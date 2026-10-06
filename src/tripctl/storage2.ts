import * as z from 'zod/v4';
import { canonical, hash as digest } from './identity';
import { contentSchema, eventMetadataSchema, TripError, type TripState, type TripContent } from './schema';
import { MAX_STORE_BYTES, MAX_HISTORY_EVENTS, MAX_STORAGE2_EVENTS, MAX_STORAGE2_EVENT_BYTES, MAX_STORAGE2_REPLAY_BYTES, MAX_STORAGE2_PATCHES_PER_EVENT, MAX_STORAGE2_PATH_DEPTH } from './limits';
const token = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const path = z.array(z.string().max(1000).refine((k) => !['__proto__', 'prototype', 'constructor'].includes(k))).max(MAX_STORAGE2_PATH_DEPTH);
export const storagePatchSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('put'), path, value: z.json() }),
  z.strictObject({ kind: z.literal('remove'), path: path.refine((v) => v.length > 0) }),
  z.strictObject({ kind: z.literal('splice'), path, start: z.number().int().nonnegative(), remove: z.number().int().nonnegative(), values: z.array(z.json()) }),
]);
export type StoragePatch = z.infer<typeof storagePatchSchema>;
export const encodedEventSchema = eventMetadataSchema.extend({ previousHash: token, beforeHash: token, afterHash: token, forward: z.array(storagePatchSchema).max(MAX_STORAGE2_PATCHES_PER_EVENT), reverse: z.array(storagePatchSchema).max(MAX_STORAGE2_PATCHES_PER_EVENT), chainHash: token });
export const storage2Schema = z.strictObject({ storageFormat: z.literal(2), codecVersion: z.literal(1), schemaVersion: z.literal(1), revision: z.number().int().nonnegative(), anchor: contentSchema, content: contentSchema, history: z.array(encodedEventSchema).max(MAX_STORAGE2_EVENTS), auditHeadHash: token });
export type StoredState2 = z.infer<typeof storage2Schema>;
type JsonValue = z.infer<ReturnType<typeof z.json>>;
type EncodedEvent = z.infer<typeof encodedEventSchema>;
type Metadata = z.infer<typeof eventMetadataSchema>;
export type State2 = Omit<TripState, 'history'> & Omit<StoredState2, 'history'> & { history: (TripState['history'][number] & EncodedEvent)[] };
type Info = { state: State2; identities: { revision: number; content: TripContent }[]; receipts: Map<string, State2['history'][number]>; cache: Map<number, TripContent>; replayBytes: number; prefixCosts: number[] };
const registry = new WeakMap<object, Info>();
const fail = (code: string, message: string): never => { throw new TripError(code, message); };
const own = (o: object, key: string) => Object.hasOwn(o, key);
export const isStorage2 = (value: unknown): value is State2 => Boolean(value && typeof value === 'object' && (value as { storageFormat?: unknown }).storageFormat === 2);
const MAX_JSON_NODES = 1_000_000;
const MAX_JSON_DEPTH = 128;
type Measure = { bytes: number; nodes: number; depth: number };
/** Iterative preflight runs before recursive schemas, hashing, copying or splice allocation. */
function measure(value: unknown): Measure {
  let bytes = 0; let nodes = 0; let maxDepth = 0;
  const active = new WeakSet<object>();
  const stack: { value: unknown; depth: number; exit?: boolean }[] = [{ value, depth: 0 }];
  while (stack.length) {
    const row = stack.pop()!; const v = row.value;
    if (row.exit) { active.delete(v as object); continue; }
    if (++nodes > MAX_JSON_NODES || row.depth > MAX_JSON_DEPTH) fail('storage_budget_exceeded', 'JSON node or depth budget exceeded');
    maxDepth = Math.max(maxDepth, row.depth);
    if (v && typeof v === 'object') {
      const prototype = Object.getPrototypeOf(v);
      if (Array.isArray(v) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) fail('invalid_storage2', 'Only plain JSON objects and arrays are supported');
      const keys = Reflect.ownKeys(v); if (keys.length > MAX_JSON_NODES) fail('storage_budget_exceeded', 'JSON own-property budget exceeded');
      for (const key of keys) { const descriptor = Object.getOwnPropertyDescriptor(v, key)!; if (typeof key !== 'string' || !('value' in descriptor) || !descriptor.enumerable && !(Array.isArray(v) && key === 'length') || Array.isArray(v) && key !== 'length' && !/^(0|[1-9]\d*)$/.test(key)) fail('invalid_storage2', 'JSON must have ordinary enumerable data properties'); }
      if (Array.isArray(v) && keys.length !== v.length + 1) fail('invalid_storage2', 'Sparse or extended arrays are not supported');
      if (active.has(v)) fail('invalid_storage2', 'Storage must be acyclic JSON');
      active.add(v); stack.push({ value: v, depth: row.depth, exit: true });
      const entries = Array.isArray(v) ? v.map((x) => ['', x] as const) : Object.entries(v);
      bytes += 2 + Math.max(0, entries.length - 1);
      for (const [key, child] of entries) {
        if (!Array.isArray(v)) bytes += Buffer.byteLength(JSON.stringify(key), 'utf8') + 1;
        stack.push({ value: child, depth: row.depth + 1 });
      }
    } else {
      const encoded = JSON.stringify(v); if (encoded === undefined || typeof v === 'number' && !Number.isFinite(v)) fail('invalid_storage2', 'Storage values must be JSON');
      bytes += Buffer.byteLength(encoded, 'utf8');
    }
    if (bytes > MAX_STORE_BYTES) fail('state_too_large', 'JSON value exceeds 16 MiB');
  }
  return { bytes, nodes, depth: maxDepth };
}
const jsonBytes = (v: unknown) => measure(v).bytes;
const deeplyFrozen = new WeakSet<object>();
const immutable = <T>(value: T): T => { if (value && typeof value === 'object' && !deeplyFrozen.has(value)) { Object.values(value).forEach(immutable); if (!Object.isFrozen(value)) Object.freeze(value); deeplyFrozen.add(value); } return value; };
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
/** Structural copy-on-write; charge each result before allocating it. */
export function applyStoragePatches<T>(input: T, patchInput: StoragePatch[], charge: (bytes: number) => void = () => {}): T {
  let root: unknown = input; let total = measure(root);
  if (patchInput.length > MAX_STORAGE2_PATCHES_PER_EVENT) fail('storage_budget_exceeded', 'Patch count exceeded');
  for (const raw of patchInput) {
    measure(raw);
    const checked = storagePatchSchema.safeParse(raw); if (!checked.success) fail('invalid_storage_patch', 'Invalid patch shape or unsafe path'); const p = checked.data!;
    let target: unknown = root; let parent: Record<string, unknown> | undefined;
    for (const [depth, key] of p.path.entries()) {
      if (!object(target) || !own(target, key) && !(depth === p.path.length - 1 && p.kind === 'put')) fail('invalid_storage_patch', 'Patch path must traverse existing own object properties');
      parent = target as Record<string, unknown>; target = parent[key];
    }
    const old = target === undefined ? { bytes: 0, nodes: 0, depth: 0 } : measure(target);
    let replacement: Measure;
    if (p.kind === 'put') replacement = measure(p.value);
    else if (p.kind === 'remove') {
      if (!parent || !own(parent, p.path.at(-1)!)) fail('invalid_storage_patch', 'Remove needs an own object property');
      replacement = { bytes: 0, nodes: 0, depth: 0 };
    } else {
      if (!Array.isArray(target) || p.start > target.length || p.remove > target.length - p.start) fail('invalid_storage_patch', 'Invalid array splice bounds');
      const array = target as unknown[]; const length = array.length - p.remove + p.values.length;
      replacement = { bytes: 2 + Math.max(0, length - 1), nodes: 1, depth: 0 };
      const add = (v: unknown) => { const m = measure(v); replacement.bytes += m.bytes; replacement.nodes += m.nodes; replacement.depth = Math.max(replacement.depth, m.depth + 1); };
      for (let n = 0; n < p.start; n++) add(array[n]);
      p.values.forEach(add); for (let n = p.start + p.remove; n < array.length; n++) add(array[n]);
    }
    let punctuation = 0;
    if (p.path.length && p.kind === 'put' && target === undefined) punctuation = Buffer.byteLength(JSON.stringify(p.path.at(-1)), 'utf8') + 1 + Number(Object.keys(parent!).length > 0);
    if (p.kind === 'remove') punctuation = -(Buffer.byteLength(JSON.stringify(p.path.at(-1)), 'utf8') + 1 + Number(Object.keys(parent!).length > 1));
    total = { bytes: total.bytes - old.bytes + replacement.bytes + punctuation, nodes: total.nodes - old.nodes + replacement.nodes, depth: Math.max(total.depth, p.path.length + replacement.depth) };
    if (total.bytes > MAX_STORE_BYTES || total.nodes > MAX_JSON_NODES || total.depth > MAX_JSON_DEPTH) fail('storage_budget_exceeded', 'Patch result exceeds JSON resource budgets');
    charge(total.bytes);
    const edit = (node: unknown, depth: number): unknown => {
      if (depth === p.path.length) {
        if (p.kind === 'put') return p.value;
        const array = node as unknown[];
        if (p.kind !== 'splice') return fail('invalid_storage_patch', 'Root remove is forbidden');
        return [...array.slice(0, p.start), ...p.values, ...array.slice(p.start + p.remove)];
      }
      const source = node as Record<string, unknown>; const key = p.path[depth]; const last = depth === p.path.length - 1; const copy = { ...source };
      if (last && p.kind === 'remove') delete copy[key]; else Object.defineProperty(copy, key, { value: edit(source[key], depth + 1), enumerable: true, writable: true, configurable: true });
      return copy;
    };
    root = edit(root, 0);
  }
  if (!patchInput.length) charge(total.bytes);
  return root as T;
}
export function diffStorage(a: unknown, b: unknown, prefix: string[] = []): StoragePatch[] {
  measure(a); measure(b); const result: StoragePatch[] = [];
  const emit = (patch: StoragePatch) => { if (result.length >= MAX_STORAGE2_PATCHES_PER_EVENT) fail('storage_budget_exceeded', 'Diff exceeds the per-event patch count'); result.push(patch); };
  const visit = (before: unknown, after: unknown, keys: string[]) => {
    if (canonical(before) === canonical(after)) return;
    if (keys.length > MAX_STORAGE2_PATH_DEPTH) fail('storage_budget_exceeded', 'Patch path exceeds the codec depth budget');
    if (Array.isArray(before) && Array.isArray(after)) {
      let start = 0; while (start < before.length && start < after.length && canonical(before[start]) === canonical(after[start])) start++;
      let tail = 0; while (tail < before.length - start && tail < after.length - start && canonical(before[before.length - 1 - tail]) === canonical(after[after.length - 1 - tail])) tail++;
      emit({ kind: 'splice', path: keys, start, remove: before.length - start - tail, values: after.slice(start, after.length - tail) as JsonValue[] });
    } else if (object(before) && object(after)) {
      for (const key of Object.keys(before)) if (!own(after, key)) emit({ kind: 'remove', path: [...keys, key] });
      for (const key of Object.keys(after)) if (own(before, key)) visit(before[key], after[key], [...keys, key]); else emit({ kind: 'put', path: [...keys, key], value: after[key] as JsonValue });
    } else emit({ kind: 'put', path: keys, value: after as JsonValue });
  };
  visit(a, b, prefix); return result;
}
function anchorHead(content: TripContent) { return digest({ scope: 'tripctl-storage2-anchor-v1', journeyId: content.snapshot.trip.id, anchorHash: digest(content) }); }
export function eventMetadata(event: Metadata): Metadata { const { id, revision, operation, actor, reason, at, requestHash } = event; return { id, revision, operation, actor, reason, at, requestHash }; }
function eventBody(e: EncodedEvent) { const body: Partial<EncodedEvent> = { ...e }; delete body.chainHash; return body; }
function makeEvent(metadata: Metadata, before: TripContent, after: TripContent, previousHash: string): EncodedEvent {
  measure(metadata); measure(before); measure(after);
  const checked = eventMetadataSchema.safeParse(metadata); if (!checked.success || canonical(checked.data) !== canonical(eventMetadata(metadata))) fail('invalid_storage2', 'Event metadata must be valid without normalization');
  const body = { ...eventMetadata(metadata), previousHash, beforeHash: digest(before), afterHash: digest(after), forward: diffStorage(before, after), reverse: diffStorage(after, before) };
  if (jsonBytes(body) + 86 > MAX_STORAGE2_EVENT_BYTES) fail('storage_budget_exceeded', 'Encoded event exceeds 2 MiB; retain the original state');
  const event = encodedEventSchema.parse({ ...body, chainHash: digest(body) });
  if (jsonBytes(event) > MAX_STORAGE2_EVENT_BYTES) fail('storage_budget_exceeded', 'Encoded event exceeds 2 MiB; retain the original state');
  return event;
}
const identityShape = (c: TripContent) => ({ plans: c.snapshot.trip.plans, lodgings: c.snapshot.trip.lodgings, baseline: c.itinerary?.baseline, current: c.itinerary?.current, registered: c.itinerary?.registeredActivityIds, replacements: c.linkage?.actualChanges });
const identityTouched = (patches: StoragePatch[]) => patches.some((p) => !p.path.length || ['snapshot/trip/plans', 'snapshot/trip/lodgings', 'itinerary/baseline', 'itinerary/current', 'itinerary/registeredActivityIds', 'linkage/actualChanges'].some((wanted) => { const key = p.path.join('/'); return key === wanted || key.startsWith(wanted + '/') || wanted.startsWith(key + '/'); }));
function runtime(wire: StoredState2, identities: Info['identities'], prefixCosts: number[], previous?: Info, lastBefore?: TripContent): State2 {
  const state = { ...wire, history: wire.history.map((encoded) => ({ ...encoded })) } as State2;
  const info: Info = { state, identities: immutable(identities), prefixCosts, replayBytes: jsonBytes(state.anchor) + jsonBytes(state.content) + prefixCosts.at(-1)!, receipts: new Map(), cache: new Map([[0, state.anchor], [state.revision, state.content]]) };
  if (lastBefore && state.revision) info.cache.set(state.revision - 1, lastBefore);
  for (const event of state.history) {
    Object.defineProperties(event, { before: { get: () => contentAt(state, event.revision - 1), enumerable: false }, after: { get: () => contentAt(state, event.revision), enumerable: false } });
    info.receipts.set(event.id, event);
  }
  // Only derived indexes are cached; none are supplied by the file or used without chain verification.
  if (previous) for (const [revision, content] of previous.cache) if (info.cache.size < 4) info.cache.set(revision, content);
  immutable(state); registry.set(state, info); return state;
}
function infoFor(state: State2) { return registry.get(state) || registry.get(readStorage2(state))!; }
export function readStorage2(input: unknown): State2 {
  if (input && typeof input === 'object' && registry.has(input)) return input as State2;
  const size = jsonBytes(input);
  if (size > MAX_STORE_BYTES) fail('state_too_large', 'Encoded container exceeds 16 MiB');
  const parsed = storage2Schema.safeParse(input); if (!parsed.success) return fail('invalid_storage2', 'Format2 schema, codec version or event bounds are invalid');
  const wire = parsed.data; if (canonical(wire) !== canonical(input)) fail('invalid_storage2', 'Container parsing must not normalize or lose original fields'); if (wire.history.length !== wire.revision) fail('invalid_storage2', 'Revision and encoded history count differ');
  let current = immutable(wire.anchor); let head = anchorHead(current); let replayBytes = jsonBytes(current) + jsonBytes(wire.content); const prefixCosts = [0]; let previousContent: TripContent | undefined;
  const ids = new Set<string>(); const identities = [{ revision: 0, content: current }];
  for (const [n, event] of wire.history.entries()) {
    if (event.revision !== n + 1 || ids.has(event.id) || event.previousHash !== head || event.beforeHash !== digest(current) || event.chainHash !== digest(eventBody(event))) fail('invalid_storage2', 'Audit event identity, order or hash chain mismatch');
    if (jsonBytes(event) > MAX_STORAGE2_EVENT_BYTES) fail('storage_budget_exceeded', 'Encoded event exceeds 2 MiB'); ids.add(event.id);
    const charge = (bytes: number) => { replayBytes += bytes; if (replayBytes > MAX_STORAGE2_REPLAY_BYTES) fail('storage_budget_exceeded', 'Forward/inverse patch replay exceeds 512 MiB cumulative result bytes'); };
    const next = applyStoragePatches(current, event.forward, charge);
    const shape = contentSchema.safeParse(next); if (!shape.success || canonical(shape.data) !== canonical(next)) fail('invalid_storage2', 'Decoded event content violates the domain schema or loses fields');
    if (event.afterHash !== digest(next) || canonical(applyStoragePatches(next, event.reverse, charge)) !== canonical(current)) fail('invalid_storage2', 'Forward or inverse patch does not reproduce its exact content hash');
    prefixCosts.push(replayBytes - jsonBytes(wire.anchor) - jsonBytes(wire.content));
    previousContent = current; current = immutable(next); head = event.chainHash;
    if (identityTouched(event.forward) && canonical(identityShape(identities.at(-1)!.content)) !== canonical(identityShape(current))) identities.push({ revision: event.revision, content: current });
  }
  if (wire.auditHeadHash !== head || canonical(wire.content) !== canonical(current)) fail('invalid_storage2', 'Current content or audit head differs from replay');
  return runtime({ ...wire, anchor: immutable(wire.anchor), content: current }, identities, prefixCosts, undefined, previousContent);
}
/** Only explicitly requested historical revisions are reconstructed; the cache holds at most four. */
export function contentAt(state: TripState, revision: number): TripContent {
  if (!Number.isSafeInteger(revision) || revision < 0 || revision > state.revision) fail('unknown_revision', 'Historical revision is outside the journey');
  if (!isStorage2(state)) return revision === state.revision ? state.content : revision === 0 ? state.history[0]?.before || state.content : state.history[revision - 1].after;
  const info = infoFor(state); const existing = info.cache.get(revision); if (existing) return existing;
  const starts = [...info.cache.entries(), ...info.identities.map((r): [number, TripContent] => [r.revision, r.content])];
  const [start, value] = starts.sort((a, b) => Math.abs(a[0] - revision) - Math.abs(b[0] - revision))[0]; let result = value;
  if (start < revision) for (let n = start; n < revision; n++) result = applyStoragePatches(result, state.history[n].forward);
  else for (let n = start - 1; n >= revision; n--) result = applyStoragePatches(result, state.history[n].reverse);
  result = immutable(result); if (info.cache.size >= 4) { const removable = [...info.cache.keys()].find((n) => n !== 0 && n !== state.revision); if (removable !== undefined) info.cache.delete(removable); } info.cache.set(revision, result); return result;
}
/** Chronological source snapshots only when historic plan/activity/hotel identities change. */
export function historicalSources(state: Pick<TripState, 'content' | 'history'>, includeCurrent = true): TripContent[] {
  if (isStorage2(state)) return infoFor(state).identities.filter((r) => includeCurrent || r.revision < state.revision).map((r) => r.content);
  return state.history.length ? [state.history[0].before, ...state.history.slice(0, includeCurrent ? undefined : -1).map((h) => h.after)] : includeCurrent ? [state.content] : [];
}
export function encodeStorage2(state: TripState): State2 {
  if (isStorage2(state)) return readStorage2(state);
  measure(state);
  const anchor = state.history[0]?.before || state.content; let head = anchorHead(anchor);
  const history = state.history.map((e) => { const encoded = makeEvent(eventMetadata(e), e.before, e.after, head); head = encoded.chainHash; return encoded; });
  return readStorage2({ storageFormat: 2, codecVersion: 1, schemaVersion: 1, revision: state.revision, anchor, content: state.content, history, auditHeadHash: head });
}
export function appendStorage2(state: State2, metadata: Metadata, after: TripContent): State2 {
  measure(after); measure(eventMetadata(metadata));
  const checkedContent = contentSchema.safeParse(after); if (!checkedContent.success || canonical(checkedContent.data) !== canonical(after)) fail('invalid_storage2', 'Append content must satisfy its schema without normalization');
  const checkedMetadata = eventMetadataSchema.safeParse(eventMetadata(metadata)); if (!checkedMetadata.success || canonical(checkedMetadata.data) !== canonical(eventMetadata(metadata))) fail('invalid_storage2', 'Append metadata must satisfy its schema without normalization');
  const info = infoFor(state); if (state.history.length >= MAX_STORAGE2_EVENTS) fail('history_full', 'Format2 event budget reached; retain all history and upgrade storage before another edit');
  if (metadata.revision !== state.revision + 1 || info.receipts.has(metadata.id)) fail('invalid_storage2', 'Append must have the next revision and a fresh event identity');
  const encoded = makeEvent(eventMetadata(metadata), state.content, after, state.auditHeadHash);
  let replayBytes = info.replayBytes - jsonBytes(state.content) + jsonBytes(after); let eventCost = 0;
  const charge = (bytes: number) => { eventCost += bytes; replayBytes += bytes; if (replayBytes > MAX_STORAGE2_REPLAY_BYTES) fail('storage_budget_exceeded', 'New event exceeds the forward/inverse replay budget'); };
  const current = immutable(applyStoragePatches(state.content, encoded.forward, charge));
  if (canonical(current) !== canonical(after) || canonical(applyStoragePatches(current, encoded.reverse, charge)) !== canonical(state.content)) fail('invalid_storage2', 'New delta failed its forward/inverse checks');
  const wire: StoredState2 = { storageFormat: 2, codecVersion: 1, schemaVersion: 1, revision: metadata.revision, anchor: state.anchor, content: current, history: [...state.history.map((e) => ({ ...e })), encoded], auditHeadHash: encoded.chainHash };
  if (jsonBytes(wire) > MAX_STORE_BYTES) fail('state_too_large', 'New encoded container exceeds 16 MiB');
  const identities = [...info.identities]; if (identityTouched(encoded.forward) && canonical(identityShape(identities.at(-1)!.content)) !== canonical(identityShape(current))) identities.push({ revision: metadata.revision, content: current });
  return runtime(wire, identities, [...info.prefixCosts, info.prefixCosts.at(-1)! + eventCost], info, state.content);
}
export function selectRevision(state: TripState, revision: number): TripState {
  const content = contentAt(state, revision); if (!isStorage2(state)) return { ...state, revision, content, history: state.history.slice(0, revision) };
  const info = infoFor(state); const history = state.history.slice(0, revision).map((e) => ({ ...e })); const head = history.at(-1)?.chainHash || anchorHead(state.anchor);
  // Prefixes are derived only from an already verified immutable chain.
  return runtime({ storageFormat: 2, codecVersion: 1, schemaVersion: 1, revision, anchor: state.anchor, content, history, auditHeadHash: head }, info.identities.filter((r) => r.revision <= revision), info.prefixCosts.slice(0, revision + 1));
}
export function exportLegacyState(state: TripState): TripState {
  if (!isStorage2(state)) return state;
  if (state.history.length > MAX_HISTORY_EVENTS) fail('downgrade_unrepresentable', 'Complete legacy export exceeds 200 events');
  let before = state.anchor; let expandedBytes = jsonBytes(state.content);
  const history = state.history.map((event) => { const after = applyStoragePatches(before, event.forward); const row = { ...eventMetadata(event), before, after }; expandedBytes += jsonBytes(row); if (expandedBytes > MAX_STORE_BYTES) fail('downgrade_unrepresentable', 'Complete legacy export exceeds 16 MiB compact bytes'); before = after; return row; });
  return { schemaVersion: 1, revision: state.revision, content: state.content, history };
}
export function stateHashScope(state: TripState) { return isStorage2(state) ? 'content-and-audit-head-v2' as const : 'canonical-format-1-state' as const; }
export function stateHash(state: TripState) { return isStorage2(state) ? digest({ scope: 'tripctl-content-and-audit-head-v2', schemaVersion: 1, journeyId: state.content.snapshot.trip.id, revision: state.revision, contentHash: digest(state.content), auditHeadHash: state.auditHeadHash }) : digest(state); }
export function storageIdentity(state: TripState) { return { storageFormat: isStorage2(state) ? 2 : 1, stateHashScope: stateHashScope(state), stateHash: stateHash(state), contentHash: digest(state.content), auditHeadHash: isStorage2(state) ? state.auditHeadHash : null, containerHash: digest(state) }; }
export function findReceipt(state: TripState, id: string) { return isStorage2(state) ? infoFor(state).receipts.get(id) : state.history.find((e) => e.id === id); }
export function storage2Stats(state: State2) { const info = infoFor(state); return { replayBytes: info.replayBytes, identitySnapshots: info.identities.length, cachedContentRevisions: info.cache.size, eventLimit: MAX_STORAGE2_EVENTS, eventBytesLimit: MAX_STORAGE2_EVENT_BYTES, replayBytesLimit: MAX_STORAGE2_REPLAY_BYTES, patchLimit: MAX_STORAGE2_PATCHES_PER_EVENT }; }

export function stateHashContext(state: TripState) { return { storageFormat: isStorage2(state) ? 2 as const : 1 as const, stateHashScope: stateHashScope(state) }; }

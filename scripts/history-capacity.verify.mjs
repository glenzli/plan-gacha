// Synthetic design experiment only. This codec is NOT accepted by tripctl load/apply.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const folder = resolve(process.argv[2] || 'dist/tripctl');
const core = await import(pathToFileURL(join(folder, 'tripctl-lib.mjs')).href);
const bytes = (x) => Buffer.byteLength(JSON.stringify(x));
const equal = (a, b) => core.canonical(a) === core.canonical(b);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function diff(a, b, path = []) {
  if (equal(a, b)) return [];
  if (Array.isArray(a) && Array.isArray(b)) {
    let start = 0; while (start < a.length && start < b.length && equal(a[start], b[start])) start++;
    let tail = 0; while (tail < a.length - start && tail < b.length - start && equal(a[a.length - 1 - tail], b[b.length - 1 - tail])) tail++;
    return [{ kind: 'splice', path, start, remove: a.length - start - tail, values: structuredClone(b.slice(start, b.length - tail)) }];
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    return [...Object.keys(a).filter((k) => !own(b, k)).map((k) => ({ kind: 'remove', path: [...path, k] })), ...Object.keys(b).flatMap((k) => own(a, k) ? diff(a[k], b[k], [...path, k]) : [{ kind: 'put', path: [...path, k], value: structuredClone(b[k]) }])];
  }
  return [{ kind: 'put', path, value: structuredClone(b) }];
}
function patch(content, changes) {
  let result = structuredClone(content);
  for (const change of changes) {
    assert.ok(change.path.every((k) => typeof k === 'string' && !['__proto__', 'prototype', 'constructor'].includes(k)));
    const traverse = (path) => path.reduce((node, key) => { assert.ok(node && own(node, key)); return node[key]; }, result);
    if (change.kind === 'splice') {
      const target = traverse(change.path); assert.ok(Array.isArray(target));
      assert.ok(Number.isInteger(change.start) && Number.isInteger(change.remove) && change.start >= 0 && change.remove >= 0 && change.start + change.remove <= target.length);
      target.splice(change.start, change.remove, ...structuredClone(change.values));
    } else if (!change.path.length) { assert.equal(change.kind, 'put'); result = structuredClone(change.value); }
    else {
      const parent = traverse(change.path.slice(0, -1)); const key = change.path.at(-1); assert.ok(!Array.isArray(parent));
      if (change.kind === 'remove') { assert.ok(own(parent, key)); delete parent[key]; }
      else { assert.equal(change.kind, 'put'); parent[key] = structuredClone(change.value); }
    }
  }
  return result;
}
function eventRecord(metadata, before, after, previousHash) {
  const body = { metadata, previousHash, beforeHash: core.hash(before), afterHash: core.hash(after), forward: diff(before, after), reverse: diff(after, before) };
  return { ...body, hash: core.hash(body) };
}
function encode(state) {
  const anchor = structuredClone(state.history[0]?.before || state.content); let head = core.hash(anchor);
  const events = state.history.map(({ before, after, ...metadata }) => { const event = eventRecord(metadata, before, after, head); head = event.hash; return event; });
  return { encoding: 'experimental-lossless-patches-v0', anchor, events, head, revision: state.revision, current: structuredClone(state.content) };
}
function decode(blob, collectHistory = true) {
  assert.equal(blob.encoding, 'experimental-lossless-patches-v0'); let content = structuredClone(blob.anchor); let head = core.hash(content); const history = []; const ids = new Set();
  for (const [n, event] of blob.events.entries()) {
    const { hash, ...body } = event; assert.equal(core.hash(body), hash); assert.equal(event.previousHash, head); assert.equal(event.beforeHash, core.hash(content));
    assert.equal(event.metadata.revision, n + 1); assert.ok(!ids.has(event.metadata.id)); ids.add(event.metadata.id);
    const next = patch(content, event.forward); assert.equal(event.afterHash, core.hash(next)); assert.deepEqual(patch(next, event.reverse), content);
    if (collectHistory) history.push({ ...event.metadata, before: content, after: next }); content = next; head = hash;
  }
  assert.equal(blob.revision, blob.events.length); assert.equal(blob.head, head); assert.deepEqual(blob.current, content);
  return { schemaVersion: 1, revision: blob.revision, content, history };
}
const checks = [];
for (const [before, after] of [
  [{ list: [{ id: 'a' }] }, { list: [{ id: 'a' }, { id: 'b' }] }],
  [{ list: ['a', 'b', 'c'] }, { list: ['a', 'c'] }],
  [{ list: ['a', 'b', 'c'] }, { list: ['c', 'a', 'b'] }],
  [{ nested: { 'a/b~': '合成 🌲', gone: true } }, { nested: { 'a/b~': '修正', added: 0 } }],
]) { assert.deepEqual(patch(before, diff(before, after)), after); assert.deepEqual(patch(after, diff(after, before)), before); }
assert.throws(() => patch({}, [{ kind: 'put', path: ['__proto__'], value: {} }]));
checks.push('array-append-remove-reorder-and-object-roundtrip', 'invalid-path-refused');
let state = core.initialize(JSON.parse(await readFile(join(folder, 'synthetic.snapshot.json'), 'utf8')));
const prefixSizes = []; const requests = [];
for (let n = 1; n <= 64; n++) {
  const operation = { type: 'fact', record: { id: 'synthetic-fact-' + n, text: 'Synthetic evidence '.repeat(14), certainty: 'reported', source: { kind: 'synthetic', reference: 'synthetic:capacity-' + n, observedAt: '2033-10-01T00:00:00Z' } } };
  const p = await core.preview(state, operation, state.revision); const request = core.mutationFromPreview(p, { idempotencyKey: 'synthetic-event-' + n, actor: 'capacity-experiment', reason: 'Synthetic append only', at: '2033-10-01T00:00:00Z' });
  state = (await core.apply(state, request)).state; requests.push(request);
  if ([16, 32, 64].includes(n)) prefixSizes.push({ revision: n, v1WriterBytes: core.analyseCapacity(state).serializedStateBytes, experimentalCompactBytes: bytes(encode(state)) });
}
const blob = encode(state); const restored = core.parseState(decode(blob));
assert.equal(core.hash(restored), core.hash(state)); assert.deepEqual(restored, state);
assert.equal((await core.apply(restored, requests[0])).receipt.replayed, true);
await assert.rejects(core.apply(restored, { ...requests[0], reason: 'Conflicting reuse' }), { code: 'idempotency_key_reused' });
await assert.rejects(core.preview(restored, { type: 'undo', commitId: state.history.at(-1).id }, 63), { code: 'revision_conflict' });
const undo = await core.preview(restored, { type: 'undo', commitId: state.history.at(-1).id }, 64);
const undone = (await core.apply(restored, core.mutationFromPreview(undo, { idempotencyKey: 'undo-64', actor: 'test', reason: 'Synthetic undo', at: '2033-10-01T01:00:00Z' }))).state;
assert.deepEqual(undone.content, state.history.at(-1).before); assert.equal(undone.revision, 65); assert.equal(undone.history.length, 65);
checks.push('actual-engine-64-event-lossless-migration', 'all-metadata-ids-snapshots-and-canonical-hash-preserved', 'committed-receipt-replay', 'conflicting-key-and-stale-revision-refused', 'business-undo-through-existing-guards');
for (const corrupt of [
  (b) => { b.events[0].forward[0].values[0].text = 'Corrupt'; },
  (b) => { b.events[0].metadata.reason = 'Corrupt audit'; },
  (b) => { [b.events[0], b.events[1]] = [b.events[1], b.events[0]]; },
  (b) => { b.events.splice(1, 1); },
  (b) => { b.current.memory.facts.pop(); },
  (b) => { b.events[0].reverse = []; },
]) { const broken = structuredClone(blob); corrupt(broken); assert.throws(() => decode(broken)); }
checks.push('patch-audit-order-missing-event-current-and-inverse-corruption-refused');
const scratch = await mkdtemp(join(tmpdir(), 'tripctl-capacity-'));
try {
  const path = join(scratch, 'synthetic.json'); const text = JSON.stringify(state, null, 2) + '\n'; await writeFile(path, text);
  const child = spawnSync(process.execPath, [join(folder, 'tripctl.mjs'), 'capacity', '--store', path], { encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 0, child.stderr); const report = JSON.parse(child.stdout); assert.equal(report.serializedStateBytes, Buffer.byteLength(text)); assert.equal(report.saved, false); assert.equal(await readFile(path, 'utf8'), text);
  // Rollback export must pass BOTH legacy limits before being offered to an old runtime.
  assert.ok(core.analyseCapacity(restored).bytes.withinLimit); assert.ok(restored.history.length <= 200);
} finally { await rm(scratch, { recursive: true, force: true }); }
checks.push('real-cli-capacity-no-write', 'legacy-rollback-export-equality-and-capacity');
// Codec scale evidence, NOT a claim that production engine accepts >200 events.
let model = { records: [], selection: 0 }; const anchor = structuredClone(model); let head = core.hash(anchor); const events = []; let expandedEventBytes = 0; const scale = [];
for (let n = 1; n <= 2048; n++) {
  const next = structuredClone(model);
  // Every step appends a stable-ID record: this tests growing arrays, not just scalar edits.
  next.records.push({ id: 'synthetic-' + n, text: 'Synthetic history record with stable provenance' }); next.selection = n % 3;
  const metadata = { id: 'event-' + n, revision: n, operation: { type: 'synthetic_append', id: 'synthetic-' + n }, actor: 'test', reason: 'Codec experiment only', at: '2033-10-01T00:00:00Z', requestHash: core.hash({ n }) };
  const event = eventRecord(metadata, model, next, head); events.push(event); head = event.hash;
  expandedEventBytes += bytes({ ...metadata, before: model, after: next }); model = next;
  if ([256, 1024, 2048].includes(n)) scale.push({ events: n, experimentalCompactBytes: bytes({ encoding: 'experimental-lossless-patches-v0', anchor, events, head, revision: n, current: model }), hypotheticalCompactV1Bytes: bytes({ schemaVersion: 1, revision: n, content: model, history: [] }) + expandedEventBytes + n - 1 });
}
const large = { encoding: 'experimental-lossless-patches-v0', anchor, events, head, revision: events.length, current: model };
assert.deepEqual(decode(large, false).content, model);
assert.ok(scale.at(-1).experimentalCompactBytes < scale.at(-1).hypotheticalCompactV1Bytes / 20);
assert.throws(() => core.parseState(decode(large, false))); // experimental container is not production state
checks.push('2048-appending-records-forward-and-inverse-verified', 'production-v1-not-bypassed');
console.log(JSON.stringify({ ok: true, syntheticOnly: true, productionFormatChanged: false, productionLimitsChanged: false, codecStatus: 'experimental-not-runtime-integrated', actualEngineEvents: 64, experimentalCodecEvents: 2048, checks, prefixSizes, scale, limitations: ['Not a generic linear-growth guarantee: full imports or large reorder patches can still be large', 'No Library migration or external CAS executed', 'v1 16MiB/200 limits and in-memory history consumers remain production constraints'] }));

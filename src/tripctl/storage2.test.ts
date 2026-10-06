import { describe, it, expect } from 'vitest';
import fixture from '../../fixtures/planning-tools.snapshot.json';
import scenario from '../../fixtures/arrangement-scenario.json';
import linkage from '../../fixtures/agent-linkage-scenario.json';
import { initialize, preview, apply, mutationFromPreview, parseState, hash } from './engine';
import { hash as digest } from './identity';
import { encodeStorage2, appendStorage2, exportLegacyState, applyStoragePatches, diffStorage, storageIdentity, storage2Stats, selectRevision, historicalSources, isStorage2 } from './storage2';
import { exportPresentationView } from './presentation';
import { analyseCapacity } from './capacity';
import type { TripState } from './schema';
const at = '2033-10-05T08:00:00Z';
async function change(state: TripState, operation: unknown, id: string, time = at) {
  const p = await preview(state, operation, state.revision);
  return apply(state, mutationFromPreview(p, { idempotencyKey: id, actor: 'synthetic', reason: 'Synthetic storage regression', at: time }));
}
const wire = (state: unknown) => JSON.parse(JSON.stringify(state));
describe('formal lossless bounded storage2', () => {
  it('supports reversible array append/delete/reorder and escaped object keys', () => {
    for (const [a, b] of [[{ list: ['a', 'b'] }, { list: ['b', 'c', 'a'] }], [{ 'a/b~': { old: false }, other: null }, { 'a/b~': { new: '合成 🌲' }, added: 0 }]]) {
      expect(applyStoragePatches(a, diffStorage(a, b))).toEqual(b); expect(applyStoragePatches(b, diffStorage(b, a))).toEqual(a);
    }
  });
  it('rejects unsafe/missing paths and splice amplification before allocation', () => {
    for (const p of [{ kind: 'put', path: ['__proto__'], value: {} }, { kind: 'remove', path: ['missing'] }, { kind: 'splice', path: ['list'], start: 2, remove: 0, values: [] }, { kind: 'put', path: ['missing', 'child'], value: true }]) expect(() => applyStoragePatches({ list: [] }, [p as never])).toThrow();
    const value = 'x'.repeat(1024 * 1024); expect(() => applyStoragePatches({ list: [value] }, [{ kind: 'splice', path: ['list'], start: 1, remove: 0, values: Array(16).fill(value) }])).toThrow();
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic; expect(() => encodeStorage2({ ...initialize(fixture), content: cyclic } as never)).toThrow();
    const many = Object.fromEntries(Array.from({ length: 4097 }, (_, n) => ['k' + n, n])); expect(() => diffStorage({}, many)).toThrowError('Diff exceeds the per-event patch count');
    let deep: unknown = {}; for (let n = 0; n < 130; n++) deep = { child: deep }; expect(() => parseState({ storageFormat: 2, anchor: deep })).toThrow();
  });
  it('preserves all metadata, logical history, stable IDs, committed receipts and undo', async () => {
    let legacy = initialize(fixture); const request = mutationFromPreview(await preview(legacy, { type: 'set_context', todayId: '2026-10-11' }, 0), { idempotencyKey: 'first', actor: 'synthetic', reason: 'Synthetic identity', at });
    legacy = (await apply(legacy, request)).state;
    legacy = (await change(legacy, { type: 'set_context', todayId: '2026-10-12' }, 'second')).state;
    const state = parseState(encodeStorage2(legacy)); expect(isStorage2(state)).toBe(true); expect(exportLegacyState(state)).toEqual(legacy);
    expect(state.history.map((e) => [e.before, e.after])).toEqual(legacy.history.map((e) => [e.before, e.after]));
    expect(wire(state).history[0]).not.toHaveProperty('before'); expect(storageIdentity(state).stateHashScope).toBe('content-and-audit-head-v2'); expect(hash(state)).not.toBe(digest(state));
    expect((await apply(state, request)).receipt.replayed).toBe(true);
    const pending = mutationFromPreview(await preview(legacy, { type: 'set_context', todayId: fixture.todayId }, legacy.revision), { idempotencyKey: 'pending-before-migration', actor: 'synthetic', reason: 'Synthetic pending preview', at });
    await expect(apply(state, pending)).rejects.toMatchObject({ code: 'stale_preview' });
    await expect(apply(state, { ...request, reason: 'Changed intent' })).rejects.toMatchObject({ code: 'idempotency_key_reused' });
    const undone = (await change(state, { type: 'undo', commitId: 'second' }, 'undo-second')).state;
    expect(undone.content).toEqual(legacy.history[1].before); expect(undone.history).toHaveLength(3); expect(parseState(wire(undone)).content).toEqual(undone.content);
    await expect(preview(undone, { type: 'undo', commitId: 'second' }, 3)).rejects.toMatchObject({ code: 'undo_conflict' });
  });
  it('binds audit tampering even when content does not change; private cache cannot be forged', async () => {
    const legacy = (await change(initialize(fixture), { type: 'set_context', todayId: fixture.todayId }, 'noop')).state;
    const state = encodeStorage2(legacy);
    for (const corrupt of [(s: typeof state) => { s.history[0].reason = 'tampered'; }, (s: typeof state) => { s.history[0].reverse.push({ kind: 'put', path: ['snapshot', 'todayId'], value: '2026-10-12' }); }, (s: typeof state) => { s.content.snapshot.todayId = '2026-10-12'; }, (s: typeof state) => { s.history[0].id = 'changed'; }, (s: typeof state) => { s.auditHeadHash = 'sha256:' + '0'.repeat(64); }]) { const broken = wire(state); corrupt(broken); expect(() => parseState(Object.freeze(broken))).toThrow(); }
    expect(() => { state.history[0].operation.type = 'undo' as never; }).toThrow(); expect(Object.isFrozen(state.content.snapshot.trip.plans)).toBe(true);
    expect(hash(parseState(wire(state)))).toBe(hash(state));
  });
  it('deep-freezes already frozen outer extension objects and rejects normalization', () => {
    const legacy = initialize(fixture); const child = { n: 1 }; legacy.content.snapshot.trip.plans[0].extension = Object.freeze({ child });
    const dateInput = initialize(fixture); dateInput.content.snapshot.trip.plans[0].extension = new Date('2033-10-01T00:00:00Z'); expect(() => encodeStorage2(dateInput)).toThrowError('Only plain JSON objects and arrays are supported');
    const state = encodeStorage2(legacy); expect(() => { child.n = 2; }).toThrow(); expect(Object.isFrozen(child)).toBe(true);
    const changed = wire(state); changed.anchor.snapshot.trip.id = ' ' + changed.anchor.snapshot.trip.id + ' '; changed.content.snapshot.trip.id = ' ' + changed.content.snapshot.trip.id + ' ';
    expect(() => parseState(changed)).toThrow();
  });
  it('rejects invalid public append content and trimmed duplicate metadata before registering', async () => {
    const state = encodeStorage2((await change(initialize(fixture), { type: 'set_context', todayId: fixture.todayId }, 'a')).state);
    const metadata = { id: 'b', revision: 2, operation: { type: 'set_context', todayId: fixture.todayId }, actor: 'synthetic', reason: 'Synthetic invalid append', at, requestHash: 'synthetic' } as const;
    const invalid = structuredClone(state.content); invalid.memory.facts.push({ id: 'bad', text: 'Synthetic invalid certainty', certainty: 'INVALID', source: { kind: 'synthetic', reference: 'synthetic', observedAt: at } } as never);
    expect(() => appendStorage2(state, metadata, invalid)).toThrow(); expect(() => appendStorage2(state, { ...metadata, id: 'a ' }, state.content)).toThrow();
    expect(parseState(wire(state)).revision).toBe(1);
  });
  it('continues after the old event limit and preserves its independent downgrade boundary', async () => {
    let state: TripState = encodeStorage2(initialize(fixture));
    for (let n = 0; n < 205; n++) state = (await change(state, { type: 'set_context', todayId: n % 2 ? '2026-10-11' : '2026-10-12' }, 'event-' + n)).state;
    const loaded = parseState(wire(state)); expect(loaded.revision).toBe(205); expect(analyseCapacity(loaded).commits.limit).toBe(2048);
    expect(() => exportLegacyState(loaded)).toThrowError('Complete legacy export exceeds 200 events');
    expect(storage2Stats(loaded as ReturnType<typeof encodeStorage2>).identitySnapshots).toBe(1); expect(storage2Stats(loaded as ReturnType<typeof encodeStorage2>).cachedContentRevisions).toBeLessThanOrEqual(4);
  });
  it('enforces event byte and cumulative forward/inverse replay budgets before registration', () => {
    const original = initialize(fixture); original.content.snapshot.trip.plans[0].padding = 'x'.repeat(3 * 1024 * 1024);
    let state = encodeStorage2(original); const initial = hash(state);
    const metadata = (n: number) => ({ id: 'budget-' + n, revision: n, operation: { type: 'set_context', todayId: fixture.todayId } as const, actor: 'synthetic', reason: 'Synthetic budget', at, requestHash: 'synthetic' });
    const changed = structuredClone(state.content); changed.snapshot.trip.plans[0].padding = 'y'.repeat(3 * 1024 * 1024);
    expect(() => appendStorage2(state, metadata(1), changed)).toThrowError('Encoded event exceeds 2 MiB'); expect(hash(state)).toBe(initial);
    let rejected = false; for (let n = 1; n < 100; n++) { try { state = appendStorage2(state, metadata(n), state.content); } catch (error) { expect(error).toMatchObject({ code: 'storage_budget_exceeded' }); rejected = true; break; } }
    expect(rejected).toBe(true); expect(state.revision).toBeGreaterThan(50); expect(storage2Stats(state).replayBytes).toBeLessThanOrEqual(512 * 1024 * 1024);
  }, 20000);
  it('refuses new events at2048 but replays old committed receipts before capacity checks', async () => {
    const legacy = initialize(fixture); const first = mutationFromPreview(await preview(legacy, { type: 'set_context', todayId: fixture.todayId }, 0), { idempotencyKey: 'first', actor: 'synthetic', reason: 'Synthetic log limit', at });
    let state = encodeStorage2((await apply(legacy, first)).state);
    for (let n = 2; n <= 2048; n++) state = appendStorage2(state, { id: 'limit-' + n, revision: n, operation: { type: 'set_context', todayId: fixture.todayId }, actor: 'synthetic', reason: 'Synthetic log limit', at, requestHash: 'synthetic' }, state.content);
    const loaded = parseState(wire(state)); expect(loaded.history).toHaveLength(2048); expect((await apply(loaded, first)).receipt.replayed).toBe(true);
    const p = await preview(loaded, { type: 'set_context', todayId: fixture.todayId }, loaded.revision);
    await expect(apply(loaded, mutationFromPreview(p, { idempotencyKey: 'overflow', actor: 'synthetic', reason: 'Synthetic log overflow', at }))).rejects.toMatchObject({ code: 'history_full' });
  }, 45000);
  it('crops historical identities, watermarks and audit head with the selected revision', async () => {
    let legacy = initialize(scenario.snapshot); legacy = (await change(legacy, scenario.importOperation, 'import', scenario.asOf)).state;
    for (const [n, op] of scenario.preparationOperations.entries()) legacy = (await change(legacy, op, 'prep-' + n, scenario.asOf)).state;
    const oldRevision = legacy.revision; const old = structuredClone(legacy);
    legacy = (await change(legacy, scenario.operation, 'reconcile', scenario.asOf)).state;
    const state = encodeStorage2(legacy); const prefix = parseState(selectRevision(state, oldRevision));
    expect(exportLegacyState(prefix)).toEqual(old); expect(prefix.history).toHaveLength(oldRevision);
    expect(historicalSources(prefix)).not.toContainEqual(state.content);
    const q = { contractVersion: 2, view: { basis: 'as_recorded', revision: oldRevision }, asOf: scenario.asOf, generatedAt: scenario.generatedAt };
    const v2 = await exportPresentationView(state, q); const v1 = await exportPresentationView(legacy, q);
    expect(v2.source.hashScope).toBe('content-and-audit-head-v2'); expect(v2.historicalDailyRouteProjections.map((d) => d.entries)).toEqual(v1.historicalDailyRouteProjections.map((d) => d.entries));
    expect(v2.trip).toEqual(v1.trip);
    expect((await preview(state, { type: 'undo', commitId: 'reconcile' }, state.revision)).reasonCodes).toContain('linkage_undo_forbidden');
    const metadataOperation = { type: 'set_trip_display_metadata', ...scenario.operation.displayMetadata };
    const changed = (await change(prefix, metadataOperation, 'metadata-only', scenario.asOf)).state;
    const undo = (await change(changed, { type: 'undo', commitId: 'metadata-only' }, 'undo', scenario.asOf)).state;
    await expect(preview(undo, metadataOperation, undo.revision)).rejects.toMatchObject({ code: 'stale_display_metadata' });
  });
  it('retains linkage undo guards and source snapshots without full-history expansion', async () => {
    let state: TripState = encodeStorage2(initialize(linkage.snapshot)); state = (await change(state, linkage.importOperation, 'import', linkage.asOf)).state;
    for (const [n, op] of linkage.operations.entries()) state = (await change(state, op, 'link-' + n, linkage.asOf)).state;
    const p = await preview(state, { type: 'undo', commitId: state.history.at(-1)!.id }, state.revision); expect(p.reasonCodes).toContain('linkage_undo_forbidden');
    expect(parseState(wire(state)).content).toEqual(state.content);
  });
});

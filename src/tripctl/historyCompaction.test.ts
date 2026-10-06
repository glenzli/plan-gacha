import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fixture from '../../fixtures/planning-tools.snapshot.json';
import booked from '../../fixtures/booked-day.snapshot.json';
import operator from '../../fixtures/operator-scenario.json';
import linkage from '../../fixtures/agent-linkage-scenario.json';
import { initialize, preview, apply, mutationFromPreview, hash, canonical, parseState } from './engine';
import { encodeStorage2, appendStorage2, createHistoryCheckpoint, auditEvents, contentAt, checkpointOf, selectRevision, exportLegacyState, originalDateRestriction } from './storage2';
import { prepareHistoryCheckpoint, commitHistoryCheckpoint, proveHistoryCheckpoint } from './historyCompaction';
import * as store from './store';
import { serializeState, loadStore, atomicWrite } from './store';
import { searchExperiences, createGuideDraft } from './experiences';
import { lodgingToken } from './arrangements';
import { historicalSources } from './storage2';
import { exportReadonlyView } from './readonlyView';
import { exportPresentationView } from './presentation';
import { observationPlanToken } from './observations';
import { previewHistoryMaintenance } from './historyMaintenance';
import type { TripState, TripMutation } from './schema';
const at = '2033-10-04T20:00:00Z'; const asOf = '2034-10-04T20:00:00Z';
const source = { kind: 'synthetic' as const, reference: 'synthetic:checkpoint-test', observedAt: at };
async function save(state: TripState, op: unknown, id: string, stamp = at) { const p = await preview(state, op, state.revision); expect(p.canApply).toBe(true); const request = mutationFromPreview(p, { idempotencyKey: id, actor: 'synthetic', reason: '按用户要求调整', at: stamp }); return { ...(await apply(state, request)), request }; }
async function contexts(count: number) { let state = encodeStorage2(initialize(fixture)); const requests: TripMutation[] = []; for (let n = 0; n < count; n++) { const r = await save(state, { type: 'set_context', todayId: n % 2 ? '2026-10-10' : '2026-10-11' }, 'change-' + n); state = r.state as typeof state; requests.push(r.request); } return { state, requests }; }
function compact(state: TripState) { const review = previewHistoryMaintenance(state, { asOf, expectedRevision: state.revision, expectedStateHash: hash(state) }); return parseState(createHistoryCheckpoint(state, { createdAt: asOf, actor: 'synthetic', reason: 'Explicit test checkpoint', sourceFileHash: 'sha256:' + '1'.repeat(64), summaries: review.summaries })); }
describe('explicit historical technical checkpoint', () => {
  it('physically removes prefix deltas while retaining every original metadata and latest20 exact states', async () => {
    const { state } = await contexts(45); const raw = canonical(state); const candidate = compact(state);
    expect(candidate.revision).toBe(45); expect(candidate.history).toHaveLength(20); expect(checkpointOf(candidate)?.archive).toHaveLength(25); expect(auditEvents(candidate).map((e) => e.operation)).toEqual(auditEvents(state).map((e) => e.operation));
    expect(canonical(candidate.content)).toBe(canonical(state.content)); expect(canonical(state)).toBe(raw);
    expect(proveHistoryCheckpoint(state, candidate)).toMatchObject({ metadataCount: 45, fullRecoveryFromRevision: 25, fullRecoverableRevisionsCompared: 21 });
    for (let r = 25; r <= 45; r++) expect(contentAt(parseState(JSON.parse(JSON.stringify(candidate))), r)).toEqual(contentAt(state, r));
    expect(hash(candidate)).not.toBe(hash(state)); expect(checkpointOf(candidate)?.recoveryExternallyVerified).toBe(false);
  });
  it('replays all old receipts, refuses pending old preview, and continues undo after restart', async () => {
    const { state, requests } = await contexts(45); const p = await preview(state, { type: 'set_context', todayId: '2026-10-12' }, 45); const pending = mutationFromPreview(p, { idempotencyKey: 'pending', actor: 'synthetic', reason: 'Pending before compact', at }); const candidate = parseState(JSON.parse(JSON.stringify(compact(state))));
    for (const request of requests) expect((await apply(candidate, request)).receipt.replayed).toBe(true);
    await expect(apply(candidate, pending)).rejects.toMatchObject({ code: 'stale_preview' });
    const next = (await save(candidate, pending.operation, 'fresh')).state; expect(next.revision).toBe(46);
    const undone = (await save(next, { type: 'undo', commitId: 'fresh' }, 'undo')).state; expect(undone.revision).toBe(47); expect(undone.content).toEqual(candidate.content);
    expect(() => exportLegacyState(candidate)).toThrowError(expect.objectContaining({ code: 'downgrade_unrepresentable' }));
    expect(() => selectRevision(candidate, 24)).toThrowError(expect.objectContaining({ code: 'history_compacted' })); expect(auditEvents(selectRevision(candidate, 25))).toHaveLength(25);
  });
  it('shows archived recent metadata at the checkpoint anchor and its next historical revision', async () => {
    const { state } = await contexts(45); const candidate = compact(state);
    for (const revision of [25, 26]) {
      const view = await exportReadonlyView(selectRevision(candidate, revision), { asOf, generatedAt: asOf });
      expect(view.recentChanges).toMatchObject({ total: revision, returned: 10, truncated: true });
      expect(view.recentChanges.items.map((row) => row.revision)).toEqual(Array.from({ length: 10 }, (_, n) => revision - 9 + n));
    }
  });
  it('keeps a nested commitment reason on its actual different date and all raw protected metadata', async () => {
    let state: TripState = encodeStorage2(initialize(booked)); const reason = '餐馆临时关闭、用户同意调整预订';
    state = (await save(state, { type: 'assign', dateId: '2026-10-12', planId: 'gallery', commitmentChanges: [{ dateId: '2026-10-11', planId: 'museum', reason }] }, 'nested')).state;
    for (let n = 0; n < 25; n++) state = (await save(state, { type: 'set_context', todayId: '2026-10-11' }, 'context-' + n)).state;
    const report = previewHistoryMaintenance(state, { asOf, expectedRevision: state.revision, expectedStateHash: hash(state) }); expect(report.summaries.flatMap((c) => c.reasons)).not.toContainEqual(expect.objectContaining({ text: reason }));
    expect(report.technicalMemory.protectedCommitRefs).toContainEqual(expect.objectContaining({ id: 'nested', businessReasons: expect.arrayContaining([expect.objectContaining({ text: reason, dateId: '2026-10-11', planId: 'museum' })]) }));
    expect(checkpointOf(compact(state))?.archive[0].operation).toEqual(state.history[0].operation); expect(JSON.stringify(compact(state))).toContain(reason);
  });
  it('keeps existing and future experience links to old ordinary metadata and old raw lodging versions', async () => {
    const hotel = { id: 'synthetic-hotel', name: 'Synthetic first hotel', checkIn: '2031-06-04', checkOut: '2031-06-05', opaque: { keep: 'synthetic raw extension' } };
    let state: TripState = encodeStorage2(initialize({ ...operator.snapshot, trip: { ...operator.snapshot.trip, lodgings: [hotel] } })); state = (await save(state, operator.importOperation, 'import')).state;
    state = (await save(state, { type: 'set_context', todayId: '2031-06-04' }, 'ordinary')).state;
    state = (await save(state, { type: 'upsert_lodging_arrangements', source, confirmation: 'explicit', changes: [{ lodgingId: hotel.id, expectedLodgingToken: lodgingToken(hotel), name: 'Synthetic later hotel', correctionReason: 'Explicit synthetic name correction', reservations: [] }] }, 'hotel-label')).state;
    for (let n = 0; n < 25; n++) state = (await save(state, { type: 'set_context', todayId: '2031-06-04' }, 'context-' + n)).state;
    const candidate = compact(state); const newer = (await save(candidate, { type: 'fact', record: { id: 'experience', text: '合成体验，结果未知', certainty: 'uncertain', source, experience: { kind: 'firsthand', eventDateId: '2031-06-04', planId: 'day4', topics: ['timing'], conditions: [], unknowns: ['结果'], reviewBeforeReuse: [], changeCommitIds: ['ordinary'], draftLesson: 'General lesson from Synthetic first hotel' } } }, 'experience')).state;
    expect(searchExperiences([newer], { asOf }).results[0].recap.changes).toContainEqual(expect.objectContaining({ commitId: 'ordinary', reason: '按用户要求调整', operationType: 'set_context' }));
    expect(proveHistoryCheckpoint(state, candidate).historicalIdentityVersionsRetained).toBe(true);
    expect(historicalSources(candidate).flatMap((c) => c.snapshot.trip.lodgings)).toContainEqual(hotel);
    expect(createGuideDraft(newer, { asOf, experienceIds: ['experience'] }).omittedLessons).toBe(1);
  });
  it('retains original apply-observation watermarks and prefix knownAt after newer success is undone', async () => {
    let state: TripState = encodeStorage2(initialize(linkage.snapshot)); state = (await save(state, linkage.importOperation, 'import')).state;
    const op = { type: 'set_plan_dates', planId: 'first-day', closeDates: ['2033-10-02'], reason: 'Synthetic accepted old closure', source: { ...source, observedAt: '2033-10-03T10:00:00Z' } };
    const observed = { id: 'official-closure', streamId: 'synthetic-official-stream', messageId: 'synthetic-closure-message', publisherId: 'synthetic-publisher', source: { ...source, observedAt: '2033-10-03T11:00:00Z' }, publishedAt: '2033-10-03T10:00:00Z', expiresAt: '2035-10-04T00:00:00Z', basis: 'official_final', confidence: 'high', status: 'available', scope: { planId: 'first-day', planToken: observationPlanToken(state.content, 'first-day'), dateId: '2033-10-02', component: 'whole_plan', componentLabel: 'Synthetic whole-day closure', place: { provider: 'synthetic', placeId: 'synthetic-place', label: 'Synthetic official notice', identity: 'matched' } }, claim: { kind: 'opening', state: 'closed' }, summary: op.reason };
    state = (await save(state, { type: 'record_observation', record: observed }, 'observation')).state;
    state = (await save(state, { type: 'apply_observation', observationId: 'official-closure', asOf: at }, 'closed', '2033-10-04T23:00:00Z')).state;
    const newer = { ...observed, id: 'official-correction', messageId: 'synthetic-open-message', supersedesId: observed.id, source: { ...source, observedAt: '2033-10-04T12:00:00Z' }, publishedAt: '2033-10-04T11:00:00Z', claim: { kind: 'opening', state: 'open' }, summary: 'Synthetic newer opening report, not auto-applied' };
    state = (await save(state, { type: 'record_observation', record: newer }, 'newer-observation')).state;
    state = (await save(state, { type: op.type, planId: op.planId, reason: op.reason, reopenDates: ['2033-10-02'], source: { ...source, observedAt: '2033-10-04T12:00:00Z' } }, 'reopened')).state;
    state = (await save(state, { type: 'undo', commitId: 'reopened' }, 'undo-reopening')).state;
    for (let n = 0; n < 25; n++) state = (await save(state, { type: 'set_context', todayId: '2033-10-02' }, 'later-' + n)).state;
    const candidate = compact(state); expect(originalDateRestriction(candidate, auditEvents(candidate).find((e) => e.id === 'closed')!)).toMatchObject({ ...op, source: { ...source, observedAt: '2033-10-03T10:00:00Z' } });
    const stale = await preview(candidate, { type: op.type, planId: op.planId, reason: op.reason, reopenDates: ['2033-10-02'], source: { ...source, observedAt: '2033-10-03T09:00:00Z' } }, candidate.revision); expect(stale.reasonCodes).toContain('stale_date_evidence');
    await expect(exportPresentationView(candidate, { view: { basis: 'corrected_as_of' }, asOf: '2033-10-04T22:00:00Z', generatedAt: '2033-10-04T22:01:00Z' })).rejects.toMatchObject({ code: 'future_projection_revision' });
  });
  it('rejects changed checkpoint archive/hash/coverage and refuses an unnecessary new checkpoint', async () => {
    const { state } = await contexts(25); const candidate = compact(state); for (const change of [(x: { checkpoint: { archive: { reason: string }[] }; history: { revision: number }[] }) => { x.checkpoint.archive[0].reason = 'changed'; }, (x: { checkpoint: { archive: { reason: string }[] }; history: { revision: number }[] }) => { x.checkpoint.archive.pop(); }, (x: { checkpoint: { archive: { reason: string }[] }; history: { revision: number }[] }) => { x.history[0].revision++; }]) { const raw = JSON.parse(JSON.stringify(candidate)); change(raw); expect(() => parseState(raw)).toThrow(); }
    expect(() => compact(candidate)).toThrowError(expect.objectContaining({ code: 'nothing_to_compact' }));
  });
  it('writes a guarded candidate, keeps one exact local recovery file, and safely repeats/rotates', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'checkpoint-local-')); try {
      const { state } = await contexts(45); const path = join(dir, 'journey.json'); const output = join(dir, 'candidate.json'); const original = serializeState(state); await writeFile(path, original);
      const request = async () => { const loaded = await loadStore(path); return { asOf, expectedJourneyId: state.content.snapshot.trip.id, expectedRevision: loaded.state.revision, expectedStateHash: hash(loaded.state), expectedFileHash: loaded.fileHash, actor: 'synthetic', reason: 'Explicit technical checkpoint', sourceLibrary: { libraryFileId: 'synthetic-owned-library', expectedCurrentVersion: 3, retrievedAt: asOf } }; };
      const report = await prepareHistoryCheckpoint(path, output, await request()); expect(report.saved).toBe(false); expect(await readFile(path, 'utf8')).toBe(original); expect((await readdir(dir)).filter((p) => p.includes('recovery-checkpoint'))).toEqual([]);
      const body = JSON.parse(await readFile(report.paths.report, 'utf8')); const committed = await commitHistoryCheckpoint(path, body); expect(committed.saved).toBe(true); expect(committed.localRecoveryVerified).toBe(true); expect(committed.recoveryExternallyVerified).toBe(false); expect(await readFile(committed.localRecoveryCheckpoint, 'utf8')).toBe(original);
      expect((await commitHistoryCheckpoint(path, body)).replayed).toBe(true); expect(await readFile(committed.localRecoveryCheckpoint, 'utf8')).toBe(original);
      const fresh = (await save((await loadStore(path)).state, { type: 'set_context', todayId: '2026-10-10' }, 'after-checkpoint')).state; await atomicWrite(path, fresh); const secondOriginal = await readFile(path, 'utf8'); const second = await prepareHistoryCheckpoint(path, join(dir, 'candidate2.json'), await request());
      const secondReportBytes = await readFile(second.paths.report, 'utf8'); const secondBody = JSON.parse(secondReportBytes); const tamperedReport = { ...secondBody, source: { ...secondBody.source, fileHash: 'sha256:' + '0'.repeat(64) } }; await writeFile(second.paths.report, JSON.stringify(tamperedReport));
      await expect(commitHistoryCheckpoint(path, tamperedReport)).rejects.toMatchObject({ code: 'compaction_mismatch' }); expect(await readFile(path, 'utf8')).toBe(secondOriginal); expect(await readFile(committed.localRecoveryCheckpoint, 'utf8')).toBe(original); await writeFile(second.paths.report, secondReportBytes);
      await commitHistoryCheckpoint(path, secondBody); expect(await readFile(committed.localRecoveryCheckpoint, 'utf8')).toBe(secondOriginal); expect((await readdir(dir)).filter((p) => p.includes('recovery-checkpoint'))).toHaveLength(1); expect(auditEvents((await loadStore(path)).state)).toHaveLength(46);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('refuses expanding historical identity projections and unsafe details before recursive checkpoint copies', () => {
    const snapshot = { ...fixture, trip: { ...fixture.trip, plans: fixture.trip.plans.map((p, n) => n ? p : { ...p, opaque: { blob: 'x'.repeat(900000) } }), lodgings: fixture.trip.lodgings } };
    let state = encodeStorage2(initialize(snapshot));
    for (let n = 1; n <= 42; n++) { const next = { ...state.content, snapshot: { ...state.content.snapshot, trip: { ...state.content.snapshot.trip, lodgings: state.content.snapshot.trip.lodgings.map((l, index) => index ? l : { ...l, name: 'Hotel' + n }) } } }; state = appendStorage2(state, { id: 'large-' + n, revision: n, operation: { type: 'set_context', todayId: fixture.todayId }, actor: 'synthetic', reason: 'Small synthetic identity delta', at, requestHash: 'synthetic' }, next); }
    expect(Buffer.byteLength(JSON.stringify(state))).toBeLessThan(3 * 1024 * 1024); const before = hash(state);
    const details = { createdAt: asOf, actor: 'synthetic', reason: 'Budget guard', sourceFileHash: 'sha256:' + '1'.repeat(64), summaries: [] };
    expect(() => createHistoryCheckpoint(state, details)).toThrowError(expect.objectContaining({ code: 'state_too_large' })); expect(hash(state)).toBe(before);
    const cyclic: unknown[] = []; cyclic.push(cyclic); expect(() => createHistoryCheckpoint(state, { ...details, summaries: cyclic })).toThrowError(expect.objectContaining({ code: 'invalid_storage2' }));
  }, 20000);
  it('can retry the same report after recovery was saved but source adoption failed before rename', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'checkpoint-failure-')); try {
      const { state } = await contexts(25); const path = join(dir, 'journey.json'); const raw = serializeState(state); await writeFile(path, raw); const loaded = await loadStore(path);
      const prepared = await prepareHistoryCheckpoint(path, join(dir, 'candidate.json'), { asOf, expectedJourneyId: state.content.snapshot.trip.id, expectedRevision: state.revision, expectedStateHash: hash(state), expectedFileHash: loaded.fileHash, actor: 'synthetic', reason: 'Fault injection' }); const report = JSON.parse(await readFile(prepared.paths.report, 'utf8'));
      const originalWrite = store.atomicWriteBytes; const injected = vi.spyOn(store, 'atomicWriteBytes').mockImplementation(async (target, bytes) => { if (target === path) throw new Error('Synthetic failure before source rename'); await originalWrite(target, bytes); });
      try { await expect(commitHistoryCheckpoint(path, report)).rejects.toThrow('Synthetic failure before source rename'); } finally { injected.mockRestore(); }
      expect(await readFile(path, 'utf8')).toBe(raw); expect(await readFile(prepared.paths.localRecoveryCheckpoint, 'utf8')).toBe(raw); expect((await commitHistoryCheckpoint(path, report)).saved).toBe(true); expect((await readdir(dir)).filter((p) => p.includes('recovery-checkpoint'))).toHaveLength(1);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('refuses stale source bytes/revision, output aliases, and a tampered candidate without source changes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'checkpoint-guards-')); try {
      const { state } = await contexts(25); const path = join(dir, 'journey.json'); const output = join(dir, 'candidate.json'); const raw = serializeState(state); await writeFile(path, raw); const loaded = await loadStore(path);
      const q = { asOf, expectedJourneyId: state.content.snapshot.trip.id, expectedRevision: state.revision, expectedStateHash: hash(state), expectedFileHash: loaded.fileHash, actor: 'synthetic', reason: 'Guard proof' };
      await expect(prepareHistoryCheckpoint(path, output, { ...q, expectedRevision: 0 })).rejects.toMatchObject({ code: 'compaction_conflict' }); await expect(prepareHistoryCheckpoint(path, path, q)).rejects.toMatchObject({ code: 'invalid_output' });
      const report = await prepareHistoryCheckpoint(path, output, q); const body = JSON.parse(await readFile(report.paths.report, 'utf8')); const lied = { ...body, effect: { ...body.effect, physicalSavingsBytes: 999999 } }; await expect(commitHistoryCheckpoint(path, lied)).rejects.toMatchObject({ code: 'compaction_mismatch' }); expect(await readFile(path, 'utf8')).toBe(raw); expect((await readdir(dir)).filter((p) => p.includes('recovery-checkpoint'))).toHaveLength(0); const candidate = JSON.parse(await readFile(output, 'utf8')); candidate.checkpoint.archive[0].reason = 'tampered'; await writeFile(output, JSON.stringify(candidate)); await expect(commitHistoryCheckpoint(path, body)).rejects.toBeDefined(); expect(await readFile(path, 'utf8')).toBe(raw);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});

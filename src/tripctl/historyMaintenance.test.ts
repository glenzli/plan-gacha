import { describe, it, expect } from 'vitest';
import fixture from '../../fixtures/planning-tools.snapshot.json';
import operator from '../../fixtures/operator-scenario.json';
import booked from '../../fixtures/booked-day.snapshot.json';
import experiences from '../../fixtures/experience-scenario.json';
import { initialize, preview, apply, mutationFromPreview, hash, canonical } from './engine';
import { encodeStorage2 } from './storage2';
import { previewHistoryMaintenance, historyMaintenanceOutputSchema } from './historyMaintenance';
import { getOperatorSchema } from './operator';
import type { TripState } from './schema';
const at = '2031-06-04T20:00:00Z'; const asOf = '2032-06-04T20:00:00Z';
async function change(state: TripState, operation: unknown, id: string, reason = '调整查看日期') { const p = await preview(state, operation, state.revision); return apply(state, mutationFromPreview(p, { idempotencyKey: id, actor: 'synthetic', reason, at })); }
const q = (s: TripState) => ({ asOf, expectedRevision: s.revision, expectedStateHash: hash(s) });
async function contexts(count: number) { let s: TripState = encodeStorage2(initialize(fixture)); for (let n = 0; n < count; n++) s = (await change(s, { type: 'set_context', todayId: n % 2 ? '2026-10-10' : '2026-10-11' }, 'context-' + n, n === 0 ? '先核对交通，不把计划当实际' : '调整查看日期')).state; return s; }
describe('semantic history-maintenance dry-run', () => {
  it('groups older adjustments while retaining distinct reasons and latest20 recovery', async () => {
    const s = await contexts(45); const before = canonical(s); const report = previewHistoryMaintenance(s, q(s));
    expect(report.effect).toMatchObject({ totalChanges: 45, olderAdjustmentsToSummarize: 25, summaryCards: 1, recentFullChanges: 20, deletedEvents: 0, reclaimedStorageBytes: 0 });
    expect(report.summaries[0].reasons.map((r) => [r.text, r.occurrences])).toEqual([['先核对交通，不把计划当实际', 1], ['调整查看日期', 24]]);
    expect(report.recovery.keepRecentFullEventIds).toEqual(s.history.slice(-20).map((e) => e.id)); expect(canonical(s)).toBe(before); expect(historyMaintenanceOutputSchema.safeParse(report).success).toBe(true); expect(report.saved).toBe(false); expect(report.applicationImplemented).toBe(false);
    expect(previewHistoryMaintenance(s, q(s))).toEqual(report); expect(report.summaries[0].impliesVisitedOrSkipped).toBe(false);
  });
  it('retains nested commitment adjustment reasons separately from a generic mutation reason', async () => {
    let s: TripState = encodeStorage2(initialize(booked));
    const reason = '餐馆临时关闭、用户同意调整预订';
    const op = { type: 'assign', dateId: '2026-10-11', planId: 'indoor', commitmentChanges: [{ dateId: '2026-10-11', planId: 'museum', reason }] };
    s = (await change(s, op, 'adjust-reservation', '按用户要求调整')).state;
    for (let n = 0; n < 20; n++) s = (await change(s, { type: 'set_context', todayId: '2026-10-11' }, 'later-' + n)).state;
    const report = previewHistoryMaintenance(s, q(s));
    expect(JSON.stringify(report)).toContain(reason);
    expect(report.technicalMemory.protectedCommitRefs).toContainEqual(expect.objectContaining({ id: 'adjust-reservation', businessReasons: expect.arrayContaining([expect.objectContaining({ origin: 'commitment', subjectId: 'museum:2026-10-11', planId: 'museum', dateId: '2026-10-11', text: reason, actor: 'synthetic', at, source: null })]) }));
    expect(JSON.stringify(report)).toContain('按用户要求调整');
  });
  it('retains nested explicit veto/lifecycle reasons in protected business records', async () => {
    let s = (await change(initialize(operator.snapshot), operator.importOperation, 'import')).state;
    const reason = '用户明确否决，不再沿用未核实方案';
    s = (await change(s, { type: 'set_decision_status', decisionPointId: 'hotel-deadline', status: 'withdrawn', confirmation: 'explicit', reason, source: { kind: 'synthetic', reference: 'synthetic:veto', observedAt: at } }, 'withdraw', '按用户要求调整')).state;
    for (let n = 0; n < 20; n++) s = (await change(s, { type: 'set_context', todayId: '2031-06-04' }, 'later-' + n)).state;
    const report = previewHistoryMaintenance(s, q(s));
    expect(report.technicalMemory.protectedCommitRefs).toContainEqual(expect.objectContaining({ id: 'withdraw', operation: expect.objectContaining({ reason }), businessReasons: expect.arrayContaining([expect.objectContaining({ text: reason, origin: 'decision', subjectId: 'hotel-deadline' })]) }));
  });
  it('keeps fewer-than20 changes intact and does not invent a storage saving', async () => { const s = await contexts(3); const report = previewHistoryMaintenance(s, q(s)); expect(report.summaries).toEqual([]); expect(report.recovery.keepRecentFullEventIds).toHaveLength(3); expect(report.effect.reclaimedStorageBytes).toBe(0); });
  it('retains old experience references, explicit veto reasons, facts and unknown outcomes', async () => {
    let s = initialize(operator.snapshot); s = (await change(s, operator.importOperation, 'import')).state; s = (await change(s, experiences.adjust, 'adjust', '排队延误，推迟参观')).state;
    s = (await change(s, { type: 'decision', record: { id: 'veto', planId: 'crosscity', disposition: 'excluded', reason: '用户否决赶路过多的方案', source: experiences.adjust.source } }, 'veto')).state;
    s = (await change(s, experiences.facts[0], 'experience')).state;
    for (let n = 0; n < 25; n++) s = (await change(s, { type: 'set_context', todayId: '2031-06-04' }, 'later-' + n)).state;
    const original = canonical(s.content); const report = previewHistoryMaintenance(encodeStorage2(s), q(encodeStorage2(s)));
    expect(report.technicalMemory.protectedCommitRefs).toContainEqual(expect.objectContaining({ id: 'adjust', category: 'experience_reference', reason: '排队延误，推迟参观' })); expect(report.technicalMemory.protectedCommitRefs).toContainEqual(expect.objectContaining({ id: 'veto', category: 'business_record' }));
    expect(report.longTerm.keyDecisionReasons.planning[0].reason).toBe('用户否决赶路过多的方案'); expect(report.longTerm.businessMemory).toMatchObject({ facts: 1, experiences: 1, decisionsAndReasons: 1, actualReports: 0 }); expect(canonical(s.content)).toBe(original); expect(s.content.memory.facts[0].experience?.outcome).toBeUndefined();
  });
  it('keeps every thin receipt and does not break replay or confirmed exclusion', async () => {
    let s: TripState = encodeStorage2(initialize(fixture)); const p = await preview(s, { type: 'decision', record: { id: 'exclude', planId: 'indoor', disposition: 'excluded', reason: '保留用户明确否决原因', source: { kind: 'synthetic', reference: 'synthetic:veto', observedAt: at } } }, 0); const request = mutationFromPreview(p, { idempotencyKey: 'veto', actor: 'synthetic', reason: '用户明确拒绝', at }); s = (await apply(s, request)).state;
    for (let n = 0; n < 25; n++) s = (await change(s, { type: 'set_context', todayId: '2026-10-10' }, 'context-' + n)).state;
    const before = hash(s); const report = previewHistoryMaintenance(s, q(s)); expect(report.technicalMemory.receipts).toEqual(s.history.map((e) => ({ id: e.id, revision: e.revision, requestHash: e.requestHash })));
    expect((await apply(s, request)).receipt.replayed).toBe(true); expect((await preview(s, { type: 'assign', planId: 'indoor', dateId: '2026-10-11' }, s.revision)).reasonCodes).toContain('confirmed_exclusion'); expect(hash(s)).toBe(before);
  });
  it('rejects stale snapshot guards, future timelines and unknown query fields', async () => { const s = await contexts(1); expect(() => previewHistoryMaintenance(s, { ...q(s), expectedRevision: 0 })).toThrow(); expect(() => previewHistoryMaintenance(s, { ...q(s), expectedStateHash: 'sha256:' + '0'.repeat(64) })).toThrow(); expect(() => previewHistoryMaintenance(s, { ...q(s), asOf: '2030-01-01T00:00:00Z' })).toThrow(); expect(() => previewHistoryMaintenance(s, { ...q(s), deleteAll: true })).toThrow(); });
  it('produces equivalent summaries for existing legacy and format2 stores', async () => { const s = await contexts(25); const legacy = { schemaVersion: 1, revision: s.revision, content: s.content, history: s.history.map((e) => ({ id: e.id, revision: e.revision, operation: e.operation, actor: e.actor, reason: e.reason, at: e.at, requestHash: e.requestHash, before: e.before, after: e.after })) }; expect(previewHistoryMaintenance(s, q(s)).summaries).toEqual(previewHistoryMaintenance(legacy, q(legacy as TripState)).summaries); });
  it('discovers the dry-run capability without changing preview epoch or exposing apply', () => { const d = getOperatorSchema(); expect(d.coreVersion).toBe(12); expect(d.commands).toContain('history-maintenance'); expect('historyMaintenance' in d && d.historyMaintenance.applicationImplemented).toBe(false); expect(d.operations).not.toContain('compact_history'); });
});

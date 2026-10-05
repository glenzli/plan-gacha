import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/agent-linkage-scenario.json';
import { initialize, preview, apply, mutationFromPreview, canonical, hash, operationSchema, type TripState } from './index';
import { exportPresentationView } from './presentation';
import { presentationInputSchema, presentationOutputSchema } from './presentationSchema';
import { exportReadonlyView } from './readonlyView';
import { observationPlanToken } from './observations';
import { analyseEvidenceImpact } from './evidenceImpact';
import { getOperatorSchema } from './operator';
const query = { asOf: fixture.asOf, generatedAt: fixture.generatedAt, view: { basis: 'corrected_as_of' as const }, source: { libraryFileId: 'synthetic-current', libraryVersion: 9, retrievedAt: fixture.asOf } };
const save = async (s: TripState, op: unknown, id: string, at = fixture.asOf) => (await apply(s, mutationFromPreview(await preview(s, op, s.revision), { idempotencyKey: id, actor: 'synthetic', reason: 'Presentation regression', at }))).state;
async function scenario(snapshot: unknown = fixture.snapshot, skipRoute = false) {
  let s = await save(initialize(snapshot), fixture.importOperation, 'import');
  for (const [n, op] of fixture.operations.entries()) if (!skipRoute || op.type !== 'set_day_route') s = await save(s, op, 'op-' + n);
  return s;
}
describe('formal presentation runtime', () => {
  it('discovers strict schemas and closes the current=baseline to actual route gap without writes', async () => {
    const s = await scenario(); const original = canonical(s);
    expect(s.content.itinerary!.current).toEqual(s.content.itinerary!.baseline.days);
    const p = await exportPresentationView(s, query); const again = await exportPresentationView(s, query);
    expect(p).toEqual(again); expect(canonical(s)).toBe(original);
    expect(presentationOutputSchema.safeParse(p).success).toBe(true);
    expect(getOperatorSchema().commands).toContain('presentation-view'); expect(getOperatorSchema()).toHaveProperty('presentationOutput');
    const day = p.historicalDailyRouteProjections[0];
    expect(day.basis).toBe('confirmed_day_route'); expect(day.entries.map((e) => e.kind)).toEqual(['route_scenery', 'meal', 'visit', 'lodging']);
    expect(day.entries.every((e) => e.activityRef !== 'activity:first-day:lake')).toBe(true);
    expect(day.skippedEntries[0].activityRef).toBe('activity:first-day:lake');
    expect(day.entries[0].timing).toEqual({}); expect(day.entries[0].planningEstimate!.stopMinutes).toEqual({ min: 45, max: 90 });
    expect(p.source.authorityStateHash).toBe(hash(s)); expect(p.source.library?.libraryVersion).toBe(9);
    expect(p.nightDatedLodgingArrangements.filter((n) => n.nightDate === '2033-10-02').map((n) => n.lodgingId)).toEqual(['city-night']);
    expect(p.pendingQuestions.some((q) => q.text.includes('Meeting and ending times unknown'))).toBe(true);
  });
  it('uses explicit actual replacement even before an ordered day route is confirmed', async () => {
    const s = await scenario(fixture.snapshot, true); const p = await exportPresentationView(s, query); const d = p.historicalDailyRouteProjections[0];
    expect(d.basis).toBe('explicit_actual_change'); expect(d.orderStatus).toBe('reported_order_unknown');
    expect(d.entries.some((e) => e.activityRef === 'reported-activity:reported-memorial')).toBe(true);
    expect(d.entries.some((e) => e.activityRef === 'activity:first-day:lake')).toBe(false);
    expect(d.entries.every((e) => e.position === null)).toBe(true);
    expect(d.priorPlannedRefs).toContain('activity:first-day:lake');
  });
  it('keeps unlinked actual reports visible and asks for the missing association', async () => {
    let s = await save(initialize(fixture.snapshot), fixture.importOperation, 'import');
    s = await save(s, fixture.operations.find((o) => o.type === 'record_actual' && o.record?.id === 'memorial-substitution')!, 'actual');
    const p = await exportPresentationView(s, query); const d = p.historicalDailyRouteProjections[0];
    expect(d.needsReview).toBe(true); expect(d.actualReportRefs).toContain('actual:memorial-substitution');
    expect(p.pendingQuestions.some((q) => q.code === 'unlinked_actual_change' && q.dateIds.includes('2033-10-02'))).toBe(true);
  });
  it('reconstructs historical content and audit prefix while retaining the current Library authority identity', async () => {
    const s = await scenario(); const original = canonical(s);
    const p = await exportPresentationView(s, { ...query, view: { basis: 'as_recorded', revision: 1 } });
    expect(p.source.authorityRevision).toBe(s.revision); expect(p.source.projectedRevision).toBe(1);
    expect(p.historicalDailyRouteProjections[0].entries.some((e) => e.activityRef === 'activity:first-day:lake')).toBe(true);
    expect(p.presentationCatalog.items.some((e) => e.ref === 'reported-activity:reported-memorial')).toBe(false);
    expect(p.source.projectedStateHash).not.toBe(p.source.authorityStateHash); expect(canonical(s)).toBe(original);
    expect((await exportPresentationView(s, { ...query, view: { basis: 'as_recorded', revision: 0 } })).source.projectedRevision).toBe(0);
  });
  it('rejects malformed, unknown and future-knowledge projection requests', async () => {
    const s = await scenario(); expect(presentationInputSchema.safeParse({ ...query, currentPlanningState: {} }).success).toBe(false);
    await expect(exportPresentationView(s, { ...query, view: { basis: 'as_recorded', revision: 999 } })).rejects.toMatchObject({ code: 'unknown_revision' });
    await expect(exportPresentationView(s, { ...query, asOf: '2033-10-01T00:00:00Z' })).rejects.toMatchObject({ code: 'future_projection_revision' });
    const later = await save(s, { type: 'fact', record: { id: 'future-source', text: 'Later explicit report', certainty: 'reported', source: { kind: 'synthetic', reference: 'synthetic:later', observedAt: fixture.generatedAt } } }, 'later');
    await expect(exportPresentationView(later, query)).rejects.toMatchObject({ code: 'future_projection_revision' });
  });
  it('rejects mixed revisions, unknown references and active cancelled nights in output', async () => {
    const p = await exportPresentationView(await scenario(), query);
    const wrongRevision = structuredClone(p); wrongRevision.historicalDailyRouteProjections[0].sourceRevision++;
    const wrongRef = structuredClone(p); wrongRef.historicalDailyRouteProjections[0].entries[0].activityRef = 'activity:unknown';
    const wrongNight = structuredClone(p); wrongNight.nightDatedLodgingArrangements[0].nightDate = '2033-10-03';
    const cancelled = structuredClone(p); cancelled.nightDatedLodgingArrangements[0].status = 'cancelled';
    for (const bad of [wrongRevision, wrongRef, wrongNight, cancelled]) expect(presentationOutputSchema.safeParse(bad).success).toBe(false);
  });
  it('does not resurrect cancelled reservations through old hotel-level dates', async () => {
    const snap = structuredClone(fixture.snapshot); Object.assign(snap.trip.lodgings[0], { reservations: [{ id: 'cancelled-room', checkIn: '2033-10-02', checkOut: '2033-10-03', status: 'cancelled' }] });
    const s = await scenario(snap); const p = await exportPresentationView(s, query);
    const rows = p.nightDatedLodgingArrangements.filter((n) => n.lodgingId === 'city-night');
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ status: 'cancelled', active: false });
    expect(p.pendingQuestions.some((q) => q.code === 'cancelled_route_lodging')).toBe(true);
    const oldView = await exportReadonlyView(s, { asOf: query.asOf, generatedAt: query.generatedAt }); expect(oldView.organized.days[0].lodgingRefs).not.toContain('lodging:city-night');
  });
  it('retains an explicitly dated route night with a known hotel but no reservation or old schedule', async () => {
    const snap = structuredClone(fixture.snapshot); delete (snap.trip.lodgings[0] as { checkIn?: string }).checkIn; delete (snap.trip.lodgings[0] as { checkOut?: string }).checkOut;
    const p = await exportPresentationView(await scenario(snap), query);
    expect(p.nightDatedLodgingArrangements.find((n) => n.lodgingId === 'city-night')).toMatchObject({ nightDate: '2033-10-02', nightBasis: 'explicit_route_night', status: 'unknown' });
  });
  it('retains confirmed historical route references when a newer actual link correction removes their activities', async () => {
    let s = await scenario(); const op = operationSchema.parse(structuredClone(fixture.operations.find((o) => o.type === 'link_actual_change')!));
    if (op.type !== 'link_actual_change') throw new Error('fixture');
    op.record.id = 'corrected-link'; op.record.source.observedAt = fixture.generatedAt;
    op.record.replacementActivities = op.record.replacementActivities.filter((a) => a.id !== 'reported-meal');
    s = await save(s, op, 'correction', fixture.generatedAt);
    const p = await exportPresentationView(s, { ...query, asOf: fixture.generatedAt }); const d = p.historicalDailyRouteProjections[0];
    expect(d.needsReview).toBe(true); expect(d.pendingActualReportRefs).toContain('actual:memorial-substitution');
    expect(d.entries.some((e) => e.activityRef === 'reported-activity:reported-meal')).toBe(true);
    expect(p.presentationCatalog.items.some((e) => e.ref === 'reported-activity:reported-meal')).toBe(true);
  });
  it('connects final evidence through explicit preview/apply into typed presentation restrictions', async () => {
    let s = await scenario(); const draft = fixture.observationDrafts[0];
    s = await save(s, { type: 'record_observation', record: { ...draft, basis: 'official_final', scope: { ...draft.scope, planToken: observationPlanToken(s.content, draft.scope.planId) } } }, 'final-evidence');
    const impact = await analyseEvidenceImpact(s, { asOf: fixture.asOf });
    const proposal = impact.impacts.find((i) => i.proposal)?.proposal; expect(proposal?.canApply).toBe(true);
    s = await save(s, proposal!.operation, 'accept-final-closure');
    const p = await exportPresentationView(s, query);
    expect(p.presentationCatalog.items.find((i) => i.ref === 'plan:' + draft.scope.planId)?.dateRestrictions?.closedDates).toContain(draft.scope.dateId);
    expect(p.presentationCatalog.items.some((i) => i.evidence?.basis === 'official_final' && i.evidence.claimValue === 'closed')).toBe(true);
    expect(p.historicalDailyRouteProjections[0].entries.map((e) => e.kind)).toEqual(['route_scenery', 'meal', 'visit', 'lodging']);
  });

});

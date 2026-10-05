import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/arrangement-scenario.json';
import { initialize, preview, apply, mutationFromPreview, canonical, parseState, type TripState } from './index';
import { exportPresentationView } from './presentation';
const query = { asOf: fixture.asOf, generatedAt: fixture.generatedAt, view: { basis: 'corrected_as_of' }, contractVersion: 2 };
const save = async (s: TripState, op: unknown, id: string) => (await apply(s, mutationFromPreview(await preview(s, op, s.revision), { idempotencyKey: id, actor: 'synthetic', reason: 'Explicit route context', at: fixture.asOf }))).state;
async function scenario() {
  let s = await save(initialize(fixture.snapshot), fixture.importOperation, 'import');
  for (const [n, op] of fixture.preparationOperations.entries()) s = await save(s, op, 'report-' + n);
  return s;
}
describe('historical reports and planned route targets', () => {
  it('binds original note and a past-date planned target without rewriting the typed itinerary', async () => {
    const before = await scenario(); const s = await save(before, fixture.operation, 'reconcile');
    expect(s.content.itinerary).toEqual(before.content.itinerary); expect(s.content.itinerary!.actual.map((a) => a.kind)).toEqual(['note', 'note']);
    expect(s.content.itinerary!.current.some((d) => d.dateId === '2033-10-04')).toBe(false);
    const p = await exportPresentationView(s, query);
    const meal = p.historicalDailyRouteProjections.find((d) => d.dateId === '2033-10-02')!.entries[0];
    const target = p.historicalDailyRouteProjections.find((d) => d.dateId === '2033-10-04')!.entries[0];
    expect(meal).toMatchObject({ status: 'reported', timing: {}, completionVerified: false });
    expect(target).toMatchObject({ status: 'planned', kind: 'route_scenery', timing: {}, completionVerified: false });
    expect(p.historicalDailyRouteProjections.find((d) => d.dateId === '2033-10-03')!.entries[0]).toMatchObject({ status: 'reported', lodgingId: 'next-night', nightDate: '2033-10-03' });
  });
  it.each([
    ['unknown report', (r: typeof fixture.operation.routeActivities[number]) => { r.actualReportId = 'absent'; }, 'route_report_mismatch'],
    ['wrong day', (r: typeof fixture.operation.routeActivities[number]) => { r.dateId = '2033-10-03'; }, 'route_report_mismatch'],
    ['planned ID collision', (r: typeof fixture.operation.routeActivities[number]) => { r.activity.id = 'depart'; }, 'duplicate_id'],
    ['provider actual', (r: typeof fixture.operation.routeActivities[number]) => { r.source.kind = 'provider'; }, 'unconfirmed_route_activity'],
  ])('rejects %s while preserving the complete state', async (_name, mutate, code) => {
    const s = await scenario(); const before = canonical(s); const r = structuredClone(fixture.operation.routeActivities[0]); mutate(r);
    await expect(preview(s, { type: 'record_route_activity', record: r }, s.revision)).rejects.toMatchObject({ code }); expect(canonical(s)).toBe(before);
  });
  it.each(['actual', 'skipped'])('refuses promotion of planned_target to %s', async (status) => {
    const s = await scenario(); const op = structuredClone(fixture.operation); op.dayRoutes[1].entries[0].status = status;
    await expect(preview(s, op, s.revision)).rejects.toMatchObject({ code: 'route_context_status_mismatch' });
  });
  it('detects altered persisted role/date and never invents replacement linkage', async () => {
    const s = await save(await scenario(), fixture.operation, 'reconcile');
    for (const role of ['reported_activity', 'planned_target']) {
      const c = structuredClone(s.content); c.linkage!.routeActivities![0].role = role as 'planned_target';
      if (role === 'reported_activity') c.linkage!.routeActivities![0].dateId = '2033-10-03';
      expect(() => parseState({ schemaVersion: 1, revision: 0, history: [], content: c })).toThrow();
    }
    expect(s.content.linkage!.actualChanges).toBeUndefined();
  });
  it('retains historic route snapshots and flags a newer context correction for review', async () => {
    let s = await save(await scenario(), fixture.operation, 'reconcile'); const original = s.content.linkage!.dayRoutes![0].entries[0].activitySnapshot;
    const correction = structuredClone(fixture.operation.routeActivities[0]); Object.assign(correction, { id: 'context-meal-v2', supersedesId: correction.id }); correction.source.observedAt = '2033-10-05T11:00:00+08:00'; correction.activity.title = 'Corrected meal label';
    s = await save(s, { type: 'record_route_activity', record: correction }, 'correction');
    const p = await exportPresentationView(s, query); const d = p.historicalDailyRouteProjections[0];
    expect(d.needsReview).toBe(true); expect(d.entries[0].title).toBe(original.title); expect(d.pendingActualReportRefs).toContain('actual:meal-note');
    const route = structuredClone(fixture.operation.dayRoutes[0]); route.id = 'route-v2'; route.source.observedAt = '2033-10-05T11:30:00+08:00';
    await expect(preview(s, { type: 'set_day_route', record: route }, s.revision)).rejects.toMatchObject({ code: 'route_context_mismatch' });
    route.entries[0].activity.contextId = correction.id;
    expect((await preview(s, { type: 'set_day_route', record: route }, s.revision)).canApply).toBe(true);
  });
});

describe('one shared review decision for confirmed routes', () => {
  const change = { id: 'changed-route', dateId: '2033-10-02', activityId: 'lake', kind: 'changed_plan', text: 'Explicit change report; original lake skipped', source: fixture.preparationOperations[0].record.source };
  const node = () => ({ ...structuredClone(fixture.operation.routeActivities[0]), actualReportId: change.id });
  const route = () => ({ ...structuredClone(fixture.operation.dayRoutes[0]), entries: [structuredClone(fixture.operation.dayRoutes[0].entries[0]), { id: 'old-lake-skipped', activity: { kind: 'planned', planId: 'first-day', activityId: 'lake' }, status: 'skipped', purpose: 'default' }] });
  const changed = async () => save(await save(initialize(fixture.snapshot), fixture.importOperation, 'import'), { type: 'record_actual', record: change }, 'changed');
  async function views(s: TripState, unresolved: boolean, refs: string[]) {
    const before = canonical(s); const { exportReadonlyView } = await import('./readonlyView');
    const view = await exportReadonlyView(s, { asOf: query.asOf, generatedAt: query.generatedAt });
    const d = view.organized.days[0]; expect(d.route.needsReview).toBe(unresolved); expect(d.route.pendingActualReportRefs).toEqual(refs);
    for (const contractVersion of [1, 2]) {
      const p = await exportPresentationView(s, { ...query, contractVersion });
      expect(p.historicalDailyRouteProjections[0].needsReview).toBe(d.route.needsReview);
      expect(p.historicalDailyRouteProjections[0].pendingActualReportRefs).toEqual(d.route.pendingActualReportRefs);
      expect(p.pendingQuestions.some((q) => q.code === 'unlinked_actual_change' && q.dateIds.includes(change.dateId))).toBe(d.unlinkedChangeReportRefs.length > 0);
    }
    expect(canonical(s)).toBe(before); return d;
  }
  it('explains changed_plan through exact context plus confirmed route/skip without fake actualChanges', async () => {
    const before = await changed(); let s = await save(before, { type: 'record_route_activity', record: node() }, 'context');
    s = await save(s, { type: 'set_day_route', record: route() }, 'route');
    const d = await views(s, false, []); expect(d.unlinkedChangeReportRefs).toEqual([]);
    expect(s.content.itinerary).toEqual(before.content.itinerary); expect(s.content.linkage?.actualChanges).toBeUndefined();
    const p = await exportPresentationView(s, query); expect(p.historicalDailyRouteProjections[0].skippedEntries[0].activityRef).toBe('activity:first-day:lake');
  });
  it('does not clear a report merely because its context exists without a confirmed route', async () => {
    const s = await save(await changed(), { type: 'record_route_activity', record: node() }, 'context');
    expect((await views(s, true, ['actual:changed-route'])).unlinkedChangeReportRefs).toEqual(['actual:changed-route']);
  });
  it('does not treat a later unrelated route or skip as acknowledgement of an unreferenced report', async () => {
    const s = await save(await changed(), { type: 'set_day_route', record: { ...route(), entries: route().entries.slice(1) } }, 'unrelated-route');
    await views(s, true, ['actual:changed-route']);
  });
  it('does not clear a context that is stored but omitted from the route', async () => {
    let s = await save(await changed(), { type: 'record_route_activity', record: node() }, 'context');
    s = await save(s, { type: 'set_day_route', record: { ...route(), entries: route().entries.slice(1) } }, 'omitted-route');
    await views(s, true, ['actual:changed-route']);
  });
  it('requires every latest node belonging to the report, without assuming one node covers a multi-part report', async () => {
    let s = await save(await changed(), { type: 'record_route_activity', record: node() }, 'first');
    const second = node(); second.id = 'context-second'; second.activity.id = 'context-activity-second'; second.activity.title = 'Second reported stop';
    s = await save(s, { type: 'record_route_activity', record: second }, 'second');
    s = await save(s, { type: 'set_day_route', record: route() }, 'partial-route'); await views(s, true, ['actual:changed-route']);
    const complete = route(); complete.id = 'route-complete'; complete.source.observedAt = '2033-10-05T11:00:00+08:00';
    complete.entries.push({ ...complete.entries[0], id: 'second-entry', activity: { kind: 'context', contextId: second.id, activityId: second.activity.id } });
    s = await save(s, { type: 'set_day_route', record: complete }, 'complete-route'); await views(s, false, []);
  });
  it('keeps another unhandled changed_plan pending even if the first report is explicitly explained', async () => {
    let s = await save(await changed(), { type: 'record_actual', record: { ...change, id: 'other-change', activityId: 'depart', text: 'Another independent change needs interpretation' } }, 'other');
    s = await save(s, { type: 'record_route_activity', record: node() }, 'context'); s = await save(s, { type: 'set_day_route', record: route() }, 'route');
    expect((await views(s, true, ['actual:other-change'])).unlinkedChangeReportRefs).toEqual(['actual:other-change']);
  });
  it('reopens review for newer correction and clears it only after the new context is explicitly incorporated', async () => {
    let s = await save(await changed(), { type: 'record_route_activity', record: node() }, 'context'); s = await save(s, { type: 'set_day_route', record: route() }, 'route');
    const correction = { ...node(), id: 'context-corrected', supersedesId: node().id, source: { ...node().source, observedAt: '2033-10-05T11:00:00+08:00' } };
    s = await save(s, { type: 'record_route_activity', record: correction }, 'corrected'); await views(s, true, ['actual:changed-route']);
    const revised = route(); revised.id = 'route-revised'; revised.source.observedAt = '2033-10-05T11:30:00+08:00'; revised.entries[0].activity = { kind: 'context', contextId: correction.id, activityId: correction.activity.id };
    s = await save(s, { type: 'set_day_route', record: revised }, 'revised'); await views(s, false, []);
  });
  it('keeps unhandled new reports after confirmation and preserves the earlier historical projection', async () => {
    let s = await save(await changed(), { type: 'record_route_activity', record: node() }, 'context'); s = await save(s, { type: 'set_day_route', record: route() }, 'route'); const revision = s.revision;
    s = await save(s, { type: 'record_actual', record: { ...change, id: 'later-change', source: { ...change.source, observedAt: '2033-10-05T11:00:00+08:00' } } }, 'later');
    await views(s, true, ['actual:later-change']);
    const p = await exportPresentationView(s, { ...query, view: { basis: 'as_recorded', revision } }); expect(p.historicalDailyRouteProjections[0].needsReview).toBe(false);
  });
});

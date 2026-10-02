import { describe, it, expect, vi } from 'vitest';
import fixture from '../../fixtures/planning-tools.snapshot.json';
import { callPlanningTool, getSnapshotToken, planningSnapshotSchema, preparePlanningContext, planningToolResponseSchema } from './planningTools';
import { rankPlanCandidates } from './planCandidates';
import { previewPlanAssignment } from './planningCore';
import { normalizePlan } from './plan';

const snapshot = () => planningSnapshotSchema.parse(structuredClone(fixture));
const operation = { type: 'assign', dateId: '2026-10-11', planId: 'museum' } as const;
describe('stateless planning contract', () => {
  it('has deterministic output with no implicit clock, random IDs, storage or network', async () => {
    const input = snapshot();
    const before = structuredClone(input);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2040-01-01T12:00:00Z'));
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('Implicit clock'); });
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('Network'); });
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Random'); });
    try {
      const futureClockResult = await callPlanningTool('rank_candidates', { snapshot: input, dateId: operation.dateId });
      vi.setSystemTime(new Date('2000-01-01T12:00:00Z'));
      expect(await callPlanningTool('rank_candidates', { snapshot: input, dateId: operation.dateId })).toEqual(futureClockResult);
      expect(input).toEqual(before);
      expect(normalizePlan({ name: 'Injected ID' }, 4, [], (index) => `controlled-${index}`).id).toBe('controlled-4');
    } finally { clock.mockRestore(); fetch.mockRestore(); random.mockRestore(); vi.useRealTimers(); }
  });
  it('shares exact ranking and preview with web consumers, including fixed lodging and conflicting clears', async () => {
    const input = snapshot();
    const context = preparePlanningContext(input);
    const ranked = await callPlanningTool('rank_candidates', { snapshot: input, dateId: operation.dateId });
    if (ranked.ok && ranked.data.kind === 'ranking') expect(ranked.data.candidates.map((item) => [item.planId, item.score])).toEqual([['indoor', 11], ['museum', 2], ['gallery', -4], ['closed', -7]]);
    expect(ranked.ok && ranked.data.kind === 'ranking' && ranked.data.candidates.map((item) => [item.planId, item.score, item.reasonCodes])).toEqual(rankPlanCandidates(context, operation.dateId).map((item) => [item.plan.id, item.score, item.reasonCodes]));
    const result = await callPlanningTool('preview_changes', { snapshot: input, operation, expectedSnapshotToken: await getSnapshotToken(input) });
    expect(result.ok && result.data.kind === 'preview' && result.data.nextSchedule).toEqual(previewPlanAssignment(context, operation.dateId, context.plans[0]).nextSchedule);
    if (!result.ok || result.data.kind !== 'preview') throw new Error('Missing preview');
    expect(result.data.changes.map((item) => item.dateId)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12']);
    expect(result.data.nextSchedule['2026-10-11']).toEqual({ planId: 'museum', lodgingId: 'hotel', lodgingLocked: true });
    expect(planningToolResponseSchema.safeParse(result).success).toBe(true);
  });
  it('rejects invalid schema, missing IDs, unknown IDs/dates, duplicates and references', async () => {
    const input = snapshot();
    const bad = { ...input, todayId: '2026-02-30' };
    expect(await callPlanningTool('get_context', { snapshot: bad })).toMatchObject({ ok: false, error: { code: 'invalid_schema' } });
    const missing = structuredClone(input); delete (missing.trip.plans[0] as Record<string, unknown>).id;
    expect(await callPlanningTool('get_context', { snapshot: missing })).toMatchObject({ ok: false, error: { code: 'invalid_schema' } });
    expect(await callPlanningTool('rank_candidates', { snapshot: input, dateId: '2026-11-01' })).toMatchObject({ ok: false, error: { code: 'unknown_date' } });
    expect(await callPlanningTool('preview_changes', { snapshot: input, operation: { ...operation, planId: 'unknown' }, expectedSnapshotToken: await getSnapshotToken(input) })).toMatchObject({ ok: false, error: { code: 'unknown_id' } });
    const duplicate = structuredClone(input); duplicate.trip.plans.push(duplicate.trip.plans[0]);
    expect(await callPlanningTool('get_context', { snapshot: duplicate })).toMatchObject({ ok: false, error: { code: 'duplicate_id' } });
    const lodging = structuredClone(input); lodging.trip.schedule['2026-10-11'].lodgingId = 'missing';
    expect(await callPlanningTool('get_context', { snapshot: lodging })).toMatchObject({ ok: false, error: { code: 'invalid_reference' } });
    const stay = structuredClone(input); stay.trip.lodgings[0].checkOut = '2026-10-01';
    expect(await callPlanningTool('get_context', { snapshot: stay })).toMatchObject({ ok: false, error: { code: 'invalid_lodging_dates' } });
    const reference = structuredClone(input); reference.trip.schedule['2026-10-10'].planId = 'unknown';
    expect(await callPlanningTool('get_context', { snapshot: reference })).toMatchObject({ ok: false, error: { code: 'unknown_id' } });
  });
  it('binds proposals to all snapshot content but does not pretend to know unseen browser state', async () => {
    const input = snapshot();
    const token = await getSnapshotToken(input);
    const modified = structuredClone(input); modified.trip.checklistText += '\nNew item';
    expect(await callPlanningTool('preview_changes', { snapshot: modified, operation, expectedSnapshotToken: token })).toMatchObject({ ok: false, error: { code: 'stale_snapshot' } });
    // Old snapshot plus matching old token remains valid: web confirmation must compare live content.
    expect(await callPlanningTool('preview_changes', { snapshot: input, operation, expectedSnapshotToken: token })).toMatchObject({ ok: true });
    const reversed = { ...input, trip: Object.fromEntries(Object.entries(input.trip).reverse()) };
    expect(await getSnapshotToken(planningSnapshotSchema.parse(reversed))).toBe(token);
    const reordered = structuredClone(input); reordered.trip.schedule = Object.fromEntries(Object.entries(reordered.trip.schedule).reverse());
    expect(await callPlanningTool('rank_candidates', { snapshot: reordered, dateId: operation.dateId })).toEqual(await callPlanningTool('rank_candidates', { snapshot: input, dateId: operation.dateId }));
  });
  it('blocks unavailable dates and visited-plan changes atomically and permits historical corrections', async () => {
    const input = snapshot();
    input.todayId = '2026-10-12';
    const blocked = await callPlanningTool('preview_changes', { snapshot: input, operation, expectedSnapshotToken: await getSnapshotToken(input) });
    expect(blocked).toMatchObject({ ok: true, data: { canApply: false, reasonCodes: ['plan_already_visited'], changes: [], nextSchedule: input.trip.schedule } });
    const closed = await callPlanningTool('preview_changes', { snapshot: snapshot(), operation: { ...operation, planId: 'closed' }, expectedSnapshotToken: await getSnapshotToken(snapshot()) });
    expect(closed).toMatchObject({ ok: true, data: { canApply: false, reasonCodes: ['closed_or_unavailable'], changes: [] } });
    const historical = await callPlanningTool('preview_changes', { snapshot: input, operation: { ...operation, dateId: '2026-10-10' }, expectedSnapshotToken: await getSnapshotToken(input) });
    expect(historical).toMatchObject({ ok: true, data: { canApply: true } });
  });
  it('preserves abandoned outcomes, does not write archived snapshots and exposes weather overrides', async () => {
    const input = snapshot();
    input.trip.schedule['2026-10-10'].status = 'abandoned';
    input.trip.plans[0].name = 'Outdoor hike';
    input.trip.plans[0].stops = [{ title: 'Outdoor mountain trail' }];
    input.weatherData.fixture.dailyByDate!['2026-10-11'] = { weatherCode: 95 };
    const result = await callPlanningTool('preview_changes', { snapshot: input, operation, expectedSnapshotToken: await getSnapshotToken(input) });
    expect(result).toMatchObject({ ok: true, data: { canApply: true, weatherOverride: true, nextSchedule: { '2026-10-10': { planId: 'museum', status: 'abandoned' } } } });
    input.trip.archived = true;
    expect(await callPlanningTool('preview_changes', { snapshot: input, operation, expectedSnapshotToken: await getSnapshotToken(input) })).toMatchObject({ ok: false, error: { code: 'archived_snapshot' } });
  });
});

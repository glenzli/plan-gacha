import { describe, it, expect } from 'vitest';
import rawFixture from '../../fixtures/planning-tools.snapshot.json';
import { previewPlanDates } from './planDates';
import { callPlanningTool, planningSnapshotSchema } from './planningTools';
const fixture = planningSnapshotSchema.parse(rawFixture);
const source = { kind: 'synthetic', reference: 'synthetic:date-test', observedAt: '2026-10-02T12:00:00Z' };
const operation = { type: 'set_plan_dates', planId: 'museum', closeDates: ['2026-10-10'], reason: 'Reported closure', source };
describe('explicit date restrictions', () => {
  it('is deterministic and exposes an affected scheduled day without changing bookings, schedule or checklist', async () => {
    const before = structuredClone(fixture); const a = await previewPlanDates(fixture, operation);
    expect(a).toEqual(await previewPlanDates(fixture, operation)); expect(fixture).toEqual(before);
    expect(a.nextSnapshot.trip.schedule).toEqual(fixture.trip.schedule);
    expect(a.nextSnapshot.trip.checklistState).toEqual(fixture.trip.checklistState);
    expect(a.detail.affectedScheduledDates).toContain('2026-10-10');
    expect(a.detail.evaluation).toMatchObject({ kind: 'evaluation', scheduledIssues: expect.arrayContaining([expect.objectContaining({ planId: 'museum', issues: expect.arrayContaining([expect.any(String)]) })]) });
    const ranking = await callPlanningTool('rank_candidates', { snapshot: a.nextSnapshot, dateId: '2026-10-10' });
    expect(ranking.ok && ranking.data.kind === 'ranking' && ranking.data.candidates.find((c) => c.planId === 'museum')?.reasonCodes).toContain('closed_or_unavailable');
    const b = await previewPlanDates(a.nextSnapshot, { ...operation, closeDates: ['2026-10-11'] });
    const c = await previewPlanDates(b.nextSnapshot, { ...operation, closeDates: undefined, reopenDates: ['2026-10-10'] });
    expect(c.detail.after.closedDates).toEqual(['2026-10-11']);
    expect(c.nextSnapshot.trip.plans.find((p) => p.id === 'museum')?.available_dates).toEqual(before.trip.plans.find((p) => p.id === 'museum')?.available_dates);
  });
  it.each([
    [{ closeDates: undefined }, 'invalid_operation'], [{ availableDates: [] }, 'invalid_operation'],
    [{ closeDates: ['2026-10-10', '2026-10-10'] }, 'invalid_operation'], [{ reopenDates: ['2026-10-10'] }, 'invalid_operation'],
    [{ closeDates: ['2026-02-30'] }, 'invalid_operation'], [{ closeDates: ['2030-01-01'] }, 'unknown_date'],
    [{ planId: 'absent' }, 'unknown_id'], [{ extra: true }, 'invalid_operation'],
  ])('refuses malformed or unknown input %#', async (patch, code) => {
    await expect(previewPlanDates(fixture, { ...operation, ...patch })).rejects.toMatchObject({ code });
  });
});

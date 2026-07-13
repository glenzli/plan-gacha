import { describe, expect, it } from 'vitest';
import { normalizePlan } from './plan';
import {
  AssignmentBlockReason,
  buildAssignmentPreview,
  buildRiskItems,
} from './planning';
import { ScheduleEntryStatus } from './trip';

const dates = [
  { id: '2026-07-10', dayNumber: 1, display: '7月10日', raw: new Date('2026-07-10') },
  { id: '2026-07-11', dayNumber: 2, display: '7月11日', raw: new Date('2026-07-11') },
];

function createPlan(id = 'plan-a', conflicts: string[] = []) {
  return normalizePlan({
    id,
    name: id,
    priority: 'must',
    available_dates: dates.map((date) => date.id),
    conflicts,
    bookings: [{ id: 'ticket', title: 'Ticket', type: 'ticket', status: 'pending' }],
  }, 0, dates);
}

describe('abandoned schedule outcomes', () => {
  it('does not emit active weather or booking warnings for an abandoned day', () => {
    const plan = createPlan();
    const schedule = {
      [dates[0].id]: { planId: plan.id, status: ScheduleEntryStatus.Abandoned },
    };

    expect(buildRiskItems({
      plans: [plan],
      tripDates: dates,
      schedule,
      plansById: new Map([[plan.id, plan]]),
      weatherData: {},
      evaluateWeather: () => ({ level: 'blocked', label: '天气不合适', snapshot: null }),
    })).toEqual([]);
  });

  it('keeps the abandoned record when the same plan is scheduled on another day', () => {
    const plan = createPlan();
    const schedule = {
      [dates[0].id]: { planId: plan.id, status: ScheduleEntryStatus.Abandoned },
    };

    const preview = buildAssignmentPreview(schedule, dates[1].id, plan, new Map([[plan.id, plan]]));

    expect(preview.clears).toEqual([]);
    expect(preview.nextSchedule).toEqual({
      [dates[0].id]: { planId: plan.id, status: ScheduleEntryStatus.Abandoned },
      [dates[1].id]: { planId: plan.id },
    });
  });
});

describe('historical assignment boundaries', () => {
  it('prevents a plan completed before the planning start from being selected again', () => {
    const plan = createPlan();
    const schedule = {
      [dates[0].id]: { planId: plan.id },
    };

    const preview = buildAssignmentPreview(
      schedule,
      dates[1].id,
      plan,
      new Map([[plan.id, plan]]),
      { todayId: '2026-07-12' },
    );

    expect(preview.blocks).toEqual([{
      dateId: dates[0].id,
      plan,
      reason: AssignmentBlockReason.PlanAlreadyVisited,
    }]);
    expect(preview.clears).toEqual([]);
    expect(preview.nextSchedule).toEqual(schedule);
  });

  it('allows a historical correction to move plans from the selected date onward', () => {
    const plan = createPlan();
    const schedule = {
      [dates[1].id]: { planId: plan.id },
    };

    const preview = buildAssignmentPreview(
      schedule,
      dates[0].id,
      plan,
      new Map([[plan.id, plan]]),
      { todayId: '2026-07-12' },
    );

    expect(preview.blocks).toEqual([]);
    expect(preview.clears).toMatchObject([{
      dateId: dates[1].id,
      reason: '同一计划被移动',
    }]);
    expect(preview.nextSchedule).toEqual({
      [dates[0].id]: { planId: plan.id },
    });
  });

  it('does not erase a conflicting plan completed before the planning start', () => {
    const completedPlan = createPlan('completed-plan');
    const targetPlan = createPlan('target-plan', [completedPlan.id]);
    const schedule = {
      [dates[0].id]: { planId: completedPlan.id },
    };

    const preview = buildAssignmentPreview(
      schedule,
      dates[1].id,
      targetPlan,
      new Map([
        [completedPlan.id, completedPlan],
        [targetPlan.id, targetPlan],
      ]),
      { todayId: '2026-07-12' },
    );

    expect(preview.blocks[0]).toMatchObject({
      dateId: dates[0].id,
      reason: AssignmentBlockReason.ConflictsWithVisitedPlan,
    });
    expect(preview.nextSchedule).toEqual(schedule);
  });

  it('still allows moving an earlier assignment that has not happened yet', () => {
    const plan = createPlan();
    const schedule = {
      [dates[0].id]: { planId: plan.id },
    };

    const preview = buildAssignmentPreview(
      schedule,
      dates[1].id,
      plan,
      new Map([[plan.id, plan]]),
      { todayId: '2026-07-01' },
    );

    expect(preview.blocks).toEqual([]);
    expect(preview.nextSchedule).toEqual({
      [dates[1].id]: { planId: plan.id },
    });
  });
});

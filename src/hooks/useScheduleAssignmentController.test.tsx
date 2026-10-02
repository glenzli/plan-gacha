import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import fixture from '../../fixtures/booked-day.snapshot.json';
import { useScheduleAssignmentController } from './useScheduleAssignmentController';
import { planningSnapshotSchema, preparePlanningContext } from '../domain/planningTools';
import { evaluatePlanning } from '../domain/planningCore';
import { createTripDates } from '../domain/display';

function renderController(locked = false) {
  const snapshot = planningSnapshotSchema.parse(structuredClone(fixture));
  if (locked) { snapshot.trip.plans[0].bookings = []; snapshot.trip.schedule['2026-10-11'].planLocked = true; }
  const context = preparePlanningContext(snapshot); const notify = vi.fn(); const setSchedule = vi.fn();
  let controller: ReturnType<typeof useScheduleAssignmentController> | undefined;
  function Probe() {
    controller = useScheduleAssignmentController({ normalizedPlans: context.plans, lodgings: context.lodgings || [], notify, setSchedule, plansById: new Map(context.plans.map((plan) => [plan.id, plan])), riskItems: evaluatePlanning(context), schedule: context.schedule, selectedIndex: 1, setSelectedDateId: vi.fn(), t: (key) => key, tripDates: createTripDates(snapshot.trip.startDateStr, snapshot.trip.tripDays), weatherData: context.weatherData });
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return { controller: controller!, notify, setSchedule, schedule: context.schedule };
}
describe('web controller shared commitment guard', () => {
  for (const locked of [false, true]) it(`blocks replacement, clearing and abandoning a ${locked ? 'locked' : 'booked'} arrangement`, () => {
    const { controller, notify, setSchedule, schedule } = renderController(locked);
    expect(controller.requestAssignPlan('2026-10-11', 'indoor')).toBe(false);
    controller.clearDay('2026-10-11'); controller.toggleDayAbandoned('2026-10-11');
    expect(setSchedule).not.toHaveBeenCalled();
    expect(notify.mock.calls).toEqual(Array.from({ length: 3 }, () => [locked ? 'lockedPlanDisplaced' : 'bookedPlanDisplaced']));
    expect(controller.buildAssignmentImpact('2026-10-11', 'indoor')?.nextSchedule).toEqual(schedule);
  });
});

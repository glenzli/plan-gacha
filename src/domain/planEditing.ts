import type { NormalizedLocation, NormalizedPlan, PlanStop } from './plan';
import { ScheduleEntryStatus, type NormalizedSchedule } from './trip';

export interface PlanEditDraft {
  plan: NormalizedPlan;
  assignedDay: string;
}

export function getEditablePlan(plan: NormalizedPlan, plans: NormalizedPlan[]): NormalizedPlan {
  return { ...plan, conflicts: [...new Set([...plan.conflicts, ...plans.filter((other) => other.id !== plan.id && other.conflicts.includes(plan.id)).map((other) => other.id)])] };
}

export function updateRelatedPlan(plan: NormalizedPlan, previousPlanId: string | null, edited: NormalizedPlan): NormalizedPlan {
  if (!previousPlanId || !plan.conflicts.includes(previousPlanId)) return plan;
  const conflicts = plan.conflicts.flatMap((id) => id !== previousPlanId ? [id] : edited.conflicts.includes(plan.id) ? [edited.id] : []);
  return conflicts.join('\0') === plan.conflicts.join('\0') ? plan : { ...plan, conflicts };
}

// Display text cannot establish a new precise map position. Keep weather context
// separate, and recover the original position if the user restores the text.
export function editStopLocation(
  source: NormalizedLocation,
  label: string,
  address: string,
): NormalizedLocation {
  const samePlace = label.trim() === source.label.trim() && address.trim() === source.address.trim();
  return { ...source, label, address, mapPoint: samePlace ? source.mapPoint : undefined };
}

// A transfer belongs to a pair of stops, not just its destination. Changing the
// order must not silently attach an old scenic route to a different origin.
export function replacePlanStops(plan: NormalizedPlan, stops: PlanStop[]): NormalizedPlan {
  const previousOrigins = new Map(plan.stops.map((stop, index) => [stop.id, plan.stops[index - 1]?.id]));
  return {
    ...plan,
    stops: stops.map((stop, index) => (
      previousOrigins.get(stop.id) === stops[index - 1]?.id
        ? stop
        : { ...stop, transferFromPrevious: null }
    )),
  };
}

export function getEditedPlanSchedule(
  schedule: NormalizedSchedule,
  previousPlanId: string | null,
  planId: string,
  assignedDay: string,
): NormalizedSchedule {
  const next: NormalizedSchedule = {};
  Object.entries(schedule).forEach(([dateId, entry]) => {
    if (!entry) return;
    const belongsToPlan = entry.planId === previousPlanId;
    if (belongsToPlan && assignedDay && dateId !== assignedDay && entry.status !== ScheduleEntryStatus.Abandoned) return;
    next[dateId] = belongsToPlan ? { ...entry, planId } : entry;
  });
  if (assignedDay && next[assignedDay]?.planId !== planId) next[assignedDay] = { planId };
  return next;
}

export function serializePlanEditDraft(draft: PlanEditDraft): string {
  // Persist the complete normalized model, including stable stop/reminder IDs
  // and transfer metadata that the compact AI prompt intentionally omits.
  return JSON.stringify({ ...draft.plan, assigned_day: draft.assignedDay }, null, 2);
}

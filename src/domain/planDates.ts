import * as z from 'zod/v4';
import { evidenceSourceSchema } from './evidence';
import { planningSnapshotSchema, preparePlanningContext, callPlanningTool, type PlanningSnapshot } from './planningTools';

const dates = z.array(planningSnapshotSchema.shape.todayId).min(1).max(30).refine((items) => new Set(items).size === items.length, 'Dates must be unique');
/** Explicit restrictions, not proof of live availability. Reopening removes only named closures. */
export const setPlanDatesSchema = z.strictObject({
  type: z.literal('set_plan_dates'), planId: planningSnapshotSchema.shape.trip.shape.plans.element.shape.id,
  availableDates: dates.optional(), closeDates: dates.optional(), reopenDates: dates.optional(),
  reason: z.string().trim().min(1).max(4000), source: evidenceSourceSchema,
}).refine((op) => Boolean(op.availableDates || op.closeDates || op.reopenDates), 'Supply a date change')
  .refine((op) => !op.closeDates?.some((date) => op.reopenDates?.includes(date)), 'Cannot close and reopen the same date');
export class PlanDatesError extends Error { constructor(readonly code: string, message: string) { super(message); } }
export async function previewPlanDates(snapshot: PlanningSnapshot, input: unknown) {
  const parsed = setPlanDatesSchema.safeParse(input);
  if (!parsed.success) throw new PlanDatesError('invalid_operation', 'Date restriction operation is invalid; an empty whitelist is not supported');
  const operation = parsed.data; const context = preparePlanningContext(snapshot);
  const plan = context.plans.find((item) => item.id === operation.planId);
  if (!plan) throw new PlanDatesError('unknown_id', 'Unknown plan ID');
  const validDates = new Set(context.tripDates.map((date) => date.id));
  if ([...(operation.availableDates || []), ...(operation.closeDates || []), ...(operation.reopenDates || [])].some((date) => !validDates.has(date))) throw new PlanDatesError('unknown_date', 'Date outside the journey');
  const nextSnapshot = structuredClone(snapshot);
  const raw = nextSnapshot.trip.plans.find((item) => item.id === operation.planId)!;
  const before = { availableDates: plan.available_dates, closedDates: plan.closed_dates };
  if (operation.availableDates) raw.available_dates = [...operation.availableDates];
  if (operation.closeDates || operation.reopenDates) raw.closed_dates = [...new Set([...plan.closed_dates, ...(operation.closeDates || [])])].filter((date) => !operation.reopenDates?.includes(date)).sort();
  const next = preparePlanningContext(nextSnapshot).plans.find((item) => item.id === operation.planId)!;
  const evaluation = await callPlanningTool('evaluate_plan', { snapshot: nextSnapshot });
  if (!evaluation.ok) throw new PlanDatesError(evaluation.error.code, evaluation.error.message);
  const affectedScheduledDates = Object.entries(snapshot.trip.schedule).filter(([, entry]) => entry.planId === plan.id && entry.status !== 'abandoned').map(([date]) => date);
  return { nextSnapshot, detail: { kind: 'plan_dates', planId: plan.id, before, after: { availableDates: next.available_dates, closedDates: next.closed_dates }, affectedScheduledDates,
    evaluation: evaluation.data, reason: operation.reason, source: operation.source, liveAvailability: 'not_verified', scheduleChanged: false, cancellationPerformed: false } };
}

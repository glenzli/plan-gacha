import * as z from 'zod/v4';
import { evidenceSourceSchema } from './evidence';
import { planningSnapshotSchema, preparePlanningContext, type PlanningSnapshot } from './planningTools';

const id = planningSnapshotSchema.shape.trip.shape.plans.element.shape.id;
const dateId = planningSnapshotSchema.shape.todayId;
const base = { dateId, planId: id, source: evidenceSourceSchema };
const stopIds = z.array(id).min(1).max(50).refine((values) => new Set(values).size === values.length, 'Activity IDs must be unique');
export const linkBookingActivitiesSchema = z.strictObject({ type: z.literal('link_booking_activities'), ...base, bookingId: id, stopIds });
export const editActivitySchema = z.strictObject({ type: z.literal('edit_activity'), ...base, stopId: id, patch: z.strictObject({
  title: z.string().trim().min(1).max(500).optional(), note: z.string().max(4000).optional(), weatherRelevant: z.boolean().optional(),
  // Text cannot establish a fresh precise position. Routes must be checked separately.
  location: z.strictObject({ label: z.string().trim().min(1).max(500), address: z.string().max(1000), query: z.string().max(200).optional() }).optional(),
}).refine((patch) => Object.keys(patch).length > 0, 'An explicit patch is required') });
export const activityOperationSchemas = [linkBookingActivitiesSchema, editActivitySchema] as const;
export const activityOperationSchema = z.discriminatedUnion('type', activityOperationSchemas);
export type ActivityOperation = z.infer<typeof activityOperationSchema>;
export class ActivityEditError extends Error { constructor(readonly code: string, message: string) { super(message); } }

const transferKeys = ['transfer_from_previous', 'transferFromPrevious', 'transfer', 'travel_from_previous', 'travelFromPrevious'];
type RawStop = Exclude<NonNullable<PlanningSnapshot['trip']['plans'][number]['stops']>[number], string>;
const stableIds = (items: Array<{ id?: string } | string>) => items.every((item) => typeof item === 'object' && Boolean(item.id)) && new Set(items.map((item) => typeof item === 'object' ? item.id : '')).size === items.length;

/** Fixed-time, one-plan activity edit. Pure preview; the operator engine owns atomic persistence. */
export function previewActivityChange(snapshot: PlanningSnapshot, input: unknown) {
  const parsed = activityOperationSchema.safeParse(input);
  if (!parsed.success) throw new ActivityEditError('invalid_operation', 'Activity operation schema is invalid');
  const operation = parsed.data; const context = preparePlanningContext(snapshot);
  if (!context.tripDates.some((date) => date.id === operation.dateId)) throw new ActivityEditError('unknown_date', 'Date outside the journey');
  const planIndex = snapshot.trip.plans.findIndex((plan) => plan.id === operation.planId);
  if (planIndex < 0) throw new ActivityEditError('unknown_id', 'Unknown plan ID');
  const entry = snapshot.trip.schedule[operation.dateId];
  if (entry?.planId !== operation.planId || entry.status === 'abandoned') throw new ActivityEditError('assignment_mismatch', 'Activity operations require the active dated plan');
  const plan = snapshot.trip.plans[planIndex]; const rawStops = plan.stops || [];
  const blocks: string[] = []; const next = structuredClone(snapshot);
  const detail = { kind: operation.type, dateId: operation.dateId, planId: operation.planId, changes: [] as Array<{ entity: 'booking' | 'activity'; id: string; before: unknown; after: unknown }>, invalidatedTransferStopIds: [] as string[], noteCodes: [] as string[] };
  if (snapshot.trip.archived) blocks.push('archived_trip');
  if (operation.source.kind === 'provider') blocks.push('unconfirmed_activity_intent');
  if (!stableIds(rawStops)) blocks.push('stable_activity_ids_required');
  // The catalog entry is shared by schedule references. Do not rewrite other dates or history.
  if (Object.entries(snapshot.trip.schedule).some(([date, other]) => date !== operation.dateId && other.planId === plan.id)) blocks.push('plan_shared_across_dates');
  if (blocks.length) return { nextSnapshot: snapshot, blocks, detail };
  const stops = rawStops as RawStop[];
  if (operation.type === 'link_booking_activities') {
    const bookings = plan.bookings || [];
    if (!stableIds(bookings) || new Set(context.plans[planIndex].bookings.map((item) => item.id)).size !== context.plans[planIndex].bookings.length) return { nextSnapshot: snapshot, blocks: ['stable_booking_ids_required'], detail };
    const bookingIndex = bookings.findIndex((booking) => booking.id === operation.bookingId);
    if (bookingIndex < 0) throw new ActivityEditError('unknown_id', 'Unknown booking ID');
    if (operation.stopIds.some((value) => !stops.some((stop) => stop.id === value))) throw new ActivityEditError('unknown_id', 'Unknown activity ID in booking link');
    const booking = bookings[bookingIndex];
    const normalizedBooking = context.plans[planIndex].bookings.find((item) => item.id === operation.bookingId)!;
    if (normalizedBooking.dateId && normalizedBooking.dateId !== operation.dateId) blocks.push('booking_date_mismatch');
    if (booking.stopIds?.length && booking.stopLinkSource && booking.stopLinkSource.kind !== 'provider'
      && [...booking.stopIds].sort().join('\0') !== [...operation.stopIds].sort().join('\0')) blocks.push('confirmed_booking_link_change');
    const after = { ...booking, dateId: operation.dateId, stopIds: stops.filter((stop) => operation.stopIds.includes(stop.id!)).map((stop) => stop.id!), stopLinkSource: operation.source };
    if (!blocks.length) { next.trip.plans[planIndex].bookings![bookingIndex] = after; detail.changes.push({ entity: 'booking', id: operation.bookingId, before: booking, after }); }
  } else {
    const stopIndex = stops.findIndex((stop) => stop.id === operation.stopId);
    if (stopIndex < 0) throw new ActivityEditError('unknown_id', 'Unknown activity ID');
    if (entry.planLocked) blocks.push('locked_plan_change');
    if (operation.dateId < snapshot.todayId) blocks.push('historical_activity_change');
    for (const booking of context.plans[planIndex].bookings.filter((item) => item.status === 'done')) {
      if (booking.dateId && booking.dateId !== operation.dateId) blocks.push('booking_date_mismatch');
      if (!booking.stopIds?.length || !booking.stopLinkSource || booking.stopLinkSource.kind === 'provider') blocks.push('booking_activity_link_required');
      else if (booking.stopIds.includes(operation.stopId)) blocks.push('booked_activity_locked');
    }
    const before = stops[stopIndex]; const after: RawStop = { ...before, ...operation.patch };
    if (operation.patch.note !== undefined) delete after.description;
    if (operation.patch.weatherRelevant !== undefined) delete after.weather_relevant;
    if (!blocks.length) {
      const nextStops = next.trip.plans[planIndex].stops as RawStop[];
      nextStops[stopIndex] = after;
      if (operation.patch.location) {
        // A new location drops stale coordinates/opening hours and adjacent route aliases.
        delete after.place;
        for (const key of ['opening_hours', 'openingHours', 'business_hours', 'businessHours', 'hours']) delete after[key];
        for (const index of [stopIndex, stopIndex + 1]) {
          const stop = nextStops[index]; if (!stop) continue;
          let invalidated = false;
          for (const key of transferKeys) if (Object.hasOwn(stop, key)) { delete stop[key]; invalidated = true; }
          if (invalidated) detail.invalidatedTransferStopIds.push(stop.id!);
        }
        detail.noteCodes.push('activity_location_unverified', 'adjacent_routes_require_recheck', 'opening_hours_require_recheck');
      }
      detail.changes.push({ entity: 'activity', id: operation.stopId, before, after });
      for (const affected of detail.invalidatedTransferStopIds.filter((id) => id !== operation.stopId)) {
        const index = stops.findIndex((stop) => stop.id === affected);
        detail.changes.push({ entity: 'activity', id: affected, before: stops[index], after: nextStops[index] });
      }
    }
  }
  if (!blocks.length) { planningSnapshotSchema.parse(next); preparePlanningContext(next); }
  return { nextSnapshot: blocks.length ? snapshot : next, blocks: [...new Set(blocks)], detail };
}

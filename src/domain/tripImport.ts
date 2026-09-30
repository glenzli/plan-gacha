import { normalizePlan, type NormalizedPlan, type TripDateLike } from './plan';
import { normalizeSchedule, type NormalizedSchedule } from './trip';
import { getLodgingImpacts, mergeLodgings, type NormalizedLodging } from './lodging';
import { isCompatibleAppSchemaVersion } from './sync';

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function validateTripImportPayload(payload: unknown): asserts payload is Record<string, any> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('noApplicableJson');
  const input = payload as Record<string, any>;
  if (input.schemaVersion !== undefined && !isCompatibleAppSchemaVersion(input.schemaVersion)) throw new Error('importSchemaUnsupported');
  if (input.startDateStr !== undefined && !validDate(input.startDateStr)) throw new Error('importTripDatesInvalid');
  if (input.tripDays !== undefined && (!Number.isInteger(input.tripDays) || input.tripDays < 1 || input.tripDays > 30)) throw new Error('importTripDatesInvalid');
  if (input.plans !== undefined && !Array.isArray(input.plans)) throw new Error('noApplicableJson');
  if (input.schedule !== undefined && (!input.schedule || typeof input.schedule !== 'object')) throw new Error('noApplicableJson');
  if (input.schedule) {
    const seenDates = new Set<string>();
    const entries = Array.isArray(input.schedule)
      ? input.schedule.map((entry) => [entry?.date || entry?.dateId || entry?.day, entry])
      : Object.entries(input.schedule);
    for (const [date, entry] of entries) {
      if (!validDate(date) || seenDates.has(date) || entry === null
        || (typeof entry !== 'string' && (typeof entry !== 'object' || Array.isArray(entry)))) throw new Error('importScheduleInvalid');
      seenDates.add(date);
    }
  }
}

export function validateLodgingReferences(plans: NormalizedPlan[], hotels: NormalizedLodging[], schedule: NormalizedSchedule = {}) {
  const ids = new Set(hotels.map((hotel) => hotel.id));
  for (const plan of plans) {
    if (plan.lodging?.mode !== 'options') continue;
    if (!plan.lodging.optionIds.length || plan.lodging.optionIds.some((id) => !ids.has(id))) throw new Error('lodgingReferenceMissing');
  }
  for (const entry of Object.values(schedule)) {
    if (entry.lodgingId && entry.lodgingId !== '__none__' && !ids.has(entry.lodgingId)) throw new Error('lodgingReferenceMissing');
  }
}

export function mergeScheduleAssignments(current: NormalizedSchedule, incoming: NormalizedSchedule, fromAi = false) {
  const next = { ...current };
  for (const [date, value] of Object.entries(incoming)) {
    const previous = current[date];
    const samePlan = previous?.planId === value.planId;
    next[date] = {
      ...(samePlan ? previous : {}), ...value,
      ...(previous?.lodgingLocked ? { lodgingId: previous.lodgingId, lodgingLocked: true } : {}),
    };
    if (fromAi) {
      // An AI recommendation cannot create or release a traveller's fixed stay.
      delete next[date].lodgingLocked;
      if (previous?.lodgingLocked) next[date].lodgingLocked = true;
      if (previous?.status === 'abandoned') next[date] = previous;
    }
  }
  return next;
}

export function prepareTripImport(
  payload: Record<string, any>, currentPlans: NormalizedPlan[], currentHotels: NormalizedLodging[], currentSchedule: NormalizedSchedule,
  dates: TripDateLike[], fromAi = false, planningFrom = '',
) {
  validateTripImportPayload(payload);
  const incomingHotels = payload.lodgings || payload.hotels || payload.accommodations || payload.stays;
  const hotels = mergeLodgings(currentHotels, incomingHotels, fromAi);
  const validStay = (stay: { checkIn: string; checkOut: string }) => validDate(stay.checkIn) && validDate(stay.checkOut) && stay.checkOut > stay.checkIn;
  if (hotels.some((hotel) => hotel.defaultForTrip !== false && Boolean(hotel.checkIn || hotel.checkOut) && !validStay(hotel)
    || hotel.reservations?.some((reservation) => !validStay(reservation)))) throw new Error('lodgingDatesInvalid');
  const plans = [...currentPlans];
  const planChanges: NormalizedPlan[] = [];
  const assignments: NormalizedSchedule = {};
  const seen = new Set<string>();
  for (const raw of Array.isArray(payload.plans) ? payload.plans : payload.plan ? [payload.plan] : []) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id.trim()
      || typeof raw.name !== 'string' || !raw.name.trim()) throw new Error('planNameRequired');
    const id = raw.id.trim();
    if (seen.has(id)) throw new Error('duplicateImportedPlan');
    seen.add(id);
    const index = plans.findIndex((plan) => plan.id === id);
    const previous = plans[index];
    const next = normalizePlan({ ...previous, ...raw, id }, index < 0 ? plans.length : index, dates);
    if (fromAi && previous) {
      next.bookings = next.bookings.map((booking) => {
        const saved = previous.bookings.find((item) => item.id === booking.id && item.status === 'done');
        return saved ? { ...booking, status: saved.status } : booking;
      });
      next.bookings.push(...previous.bookings.filter((booking) => booking.status === 'done' && !next.bookings.some((item) => item.id === booking.id)));
    }
    if (!next.stops.length) throw new Error('planStopsRequired');
    if (index < 0) plans.push(next); else plans[index] = next;
    if (JSON.stringify(previous) !== JSON.stringify(next)) planChanges.push(next);
    const date = raw.assigned_day || raw.assignedDay;
    if (date) assignments[date] = { planId: next.id };
  }
  const rawSchedule = Array.isArray(payload.schedule)
    ? Object.fromEntries(payload.schedule.map((entry: Record<string, any>) => [entry.date || entry.dateId || entry.day, entry]))
    : payload.schedule;
  const scheduleAssignments = normalizeSchedule(rawSchedule);
  // A lodging-only response must not unassign the day's existing plan.
  for (const [date, raw] of Object.entries(rawSchedule || {})) {
    // normalizeSchedule omits empty entries in saved snapshots. Import responses
    // also need an explicit empty plan_id to clear the old date during a move.
    if (raw && typeof raw === 'object' && ('plan_id' in raw || 'planId' in raw) && !scheduleAssignments[date]) scheduleAssignments[date] = { planId: '' };
    if (raw && typeof raw === 'object' && !('plan_id' in raw) && !('planId' in raw) && !('id' in raw) && scheduleAssignments[date]) {
      scheduleAssignments[date].planId = assignments[date]?.planId || currentSchedule[date]?.planId || '';
    }
  }
  Object.assign(assignments, scheduleAssignments);
  const planIds = new Set(plans.map((plan) => plan.id));
  for (const [date, entry] of Object.entries(assignments)) {
    if (!dates.some((item) => item.id === date)) throw new Error('planAssignedDateInvalid');
    if (entry.planId && !planIds.has(entry.planId)) throw new Error('importPlanMissing');
    if (fromAi && planningFrom && date < planningFrom && JSON.stringify(entry) !== JSON.stringify(currentSchedule[date])) throw new Error('aiFixedHistory');
  }
  if (fromAi && planningFrom && planChanges.some((plan) => Object.entries(currentSchedule).some(([date, entry]) => date < planningFrom && entry.planId === plan.id))) throw new Error('aiFixedHistory');
  const inRangeSchedule = Object.fromEntries(Object.entries(currentSchedule).filter(([date]) => dates.some((item) => item.id === date)));
  const schedule = mergeScheduleAssignments(inRangeSchedule, assignments, fromAi);
  const assignedPlans = new Set<string>();
  for (const entry of Object.values(schedule)) {
    if (!entry.planId || entry.status === 'abandoned') continue;
    if (assignedPlans.has(entry.planId)) throw new Error('importDuplicateAssignment');
    assignedPlans.add(entry.planId);
  }
  validateLodgingReferences(plans, hotels, schedule);
  const beforeMap = new Map(currentPlans.map((plan) => [plan.id, plan]));
  const afterMap = new Map(plans.map((plan) => [plan.id, plan]));
  const lodgingImpacts = getLodgingImpacts(currentSchedule, schedule, beforeMap, afterMap, currentHotels, hotels, dates.map((date) => date.id));
  if (fromAi && planningFrom && lodgingImpacts.some((impact) => impact.dateId < planningFrom)) throw new Error('aiFixedHistory');
  return {
    plans, lodgings: hotels, schedule, planChanges,
    lodgingChanges: hotels.filter((hotel) => JSON.stringify(currentHotels.find((saved) => saved.id === hotel.id)) !== JSON.stringify(hotel)),
    scheduleChanges: [
      ...Object.entries(schedule).filter(([date, entry]) => JSON.stringify(currentSchedule[date]) !== JSON.stringify(entry)),
      ...Object.keys(currentSchedule).filter((date) => !schedule[date]).map((date): [string, { planId: string }] => [date, { planId: '' }]),
    ],
    lodgingImpacts,
  };
}

export type TripImportPreview = ReturnType<typeof prepareTripImport>;

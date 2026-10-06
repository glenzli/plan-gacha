import { historicalSources, stateHash, stateHashContext, auditEvents } from './storage2';
import type * as z from 'zod/v4';
import { lodgingChangesSchema, reservationBindingSchema, tripDisplayOutputSchema, type ArrangementOperation } from './arrangementSchema';
import { TripError, type TripState, type TripContent, type TripOperation } from './schema';
import { preparePlanningContext } from '../domain/planningTools';
import { canonical, hash } from './identity';
import { emptyLinkage } from './linkageSchema';
import { changeReminders } from './reminders';
const fail = (code: string, message: string): never => { throw new TripError(code, message); };
const human = (s: { kind: string }) => { if (s.kind === 'provider') fail('unconfirmed_arrangement', 'Explicit user provenance is required'); };
/** Direct and composite operations share the same audit extraction, including after undo. */
function components(op: TripOperation): ArrangementOperation[] {
  if (op.type === 'reconcile_journey_context') return [...(op.displayMetadata ? [{ type: 'set_trip_display_metadata' as const, ...op.displayMetadata }] : []), ...(op.lodgings ? [{ type: 'upsert_lodging_arrangements' as const, ...op.lodgings }] : [])];
  return op.type === 'upsert_lodging_arrangements' || op.type === 'set_trip_display_metadata' ? [op] : [];
}
export function isDisplayMetadataOnly(op: TripOperation) { return op.type === 'set_trip_display_metadata' || op.type === 'reconcile_journey_context' && Boolean(op.displayMetadata) && !op.lodgings && !op.routeActivities && !op.dayRoutes; }
export function lodgingToken(lodging: TripContent['snapshot']['trip']['lodgings'][number]) { return hash(lodging); }
function upsertLodgings(state: TripState, next: TripContent, input: z.infer<typeof lodgingChangesSchema>) {
  human(input.source); const when = Date.parse(input.source.observedAt); const dates = preparePlanningContext(next.snapshot).tripDates.map((d) => d.id);
  const audit = auditEvents(state).flatMap((h) => components(h.operation));
  if (new Set(input.changes.map((c) => c.lodgingId)).size !== input.changes.length) fail('duplicate_id', 'Only one patch per hotel in a reconciliation');
  for (const change of input.changes) {
    const old = next.snapshot.trip.lodgings.find((l) => l.id === change.lodgingId);
    if ((old ? lodgingToken(old) : null) !== change.expectedLodgingToken) fail('lodging_token_conflict', 'Re-read the complete raw hotel before applying its patch');
    if (!old && !change.name) fail('lodging_name_required', 'A new canonical hotel requires an explicit name');
    if (audit.some((a) => a.type === 'upsert_lodging_arrangements' && a.changes.some((c) => c.lodgingId === change.lodgingId) && Date.parse(a.source.observedAt) >= when)) fail('stale_arrangement_source', 'Hotel changes require newer mapping evidence, including after undo');
    if (old && (change.name && change.name !== old.name || change.location && canonical({ ...(typeof old.location === 'object' ? old.location : old.location ? { label: old.location } : {}), ...change.location }) !== canonical(old.location)) && old.reservations?.some((r) => r.status === 'booked') && !change.correctionReason) fail('arrangement_correction_required', 'Correcting a booked hotel identity requires an explicit reason');
    if (change.location && old?.location && typeof old.location === 'object' && Object.entries(change.location).some(([k, v]) => old.location && typeof old.location === 'object' && old.location[k] !== v) && ['mapPoint', 'map_point', 'latitude', 'longitude', 'lat', 'lng', 'coordinates', 'providerPlaceId', 'placeId'].some((k) => typeof old.location === 'object' && Object.hasOwn(old.location, k))) fail('lodging_location_rebind_required', 'This hotel has precise navigation identity; do not combine a changed address with stale coordinates. Resolve its full place binding separately');
    const hotel = old || { id: change.lodgingId, name: change.name! };
    if (change.name) hotel.name = change.name;
    if (change.location) hotel.location = { ...(typeof hotel.location === 'object' ? hotel.location : hotel.location ? { label: hotel.location } : {}), ...change.location };
    if (new Set(change.reservations.map((r) => r.id)).size !== change.reservations.length) fail('duplicate_id', 'Reservation IDs must be unique per patch');
    for (const record of change.reservations) {
      human(record.source);
      if (Date.parse(record.source.observedAt) > when) fail('future_arrangement_source', 'Mapping cannot predate reservation provenance');
      if (!dates.some((d) => d >= record.checkIn && d < record.checkOut)) fail('unknown_date', 'Reservation must cover at least one journey night');
      const owners = new Set([next, ...historicalSources(state)].flatMap((c) => c.snapshot.trip.lodgings.filter((l) => l.reservations?.some((r) => r.id === record.id)).map((l) => l.id)));
      if ([...owners].some((id) => id !== hotel.id)) fail('reservation_identity_conflict', 'Reservation identity belongs to another hotel; never move an order through a correction');
      const previous = hotel.reservations?.find((r) => r.id === record.id);
      if (previous && (previous.checkIn !== record.checkIn || previous.checkOut !== record.checkOut || previous.status !== record.status) && !record.correctionReason) fail('arrangement_correction_required', 'Status or date corrections require an explicit audit reason');
      const knownReservations = [next, ...historicalSources(state)].flatMap((c) => c.snapshot.trip.lodgings.flatMap((l) => (l.reservations || []).filter((r) => r.id === record.id)));
      for (const known of knownReservations) {
        const binding = reservationBindingSchema.safeParse(known.tripctlArrangement); if (!binding.success) continue;
        const time = Date.parse(record.source.observedAt); const oldTime = Date.parse(binding.data.source.observedAt);
        if (time < oldTime || time === oldTime && (canonical(record.source) !== canonical(binding.data.source) || record.checkIn !== known.checkIn || record.checkOut !== known.checkOut || record.status !== known.status)) fail('stale_arrangement_source', 'Reservation facts cannot regress past their historical provenance watermark, including after undo');
      }
      const priorBinding = previous?.tripctlArrangement ? reservationBindingSchema.parse(previous.tripctlArrangement) : null;
      if (priorBinding && (Date.parse(record.source.observedAt) < Date.parse(priorBinding.source.observedAt) || Date.parse(record.source.observedAt) === Date.parse(priorBinding.source.observedAt) && canonical(record.source) !== canonical(priorBinding.source))) fail('stale_arrangement_source', 'Reservation provenance cannot regress or change at the same timestamp');
      if (previous && (previous.checkIn !== record.checkIn || previous.checkOut !== record.checkOut || previous.status !== record.status) && priorBinding && Date.parse(record.source.observedAt) <= Date.parse(priorBinding.source.observedAt)) fail('stale_arrangement_source', 'Corrected reservation facts need newer original evidence');
      for (const id of record.commitmentIds) {
        const c = next.itinerary?.commitments.find((c) => c.id === id);
        if (!c || c.kind !== 'reservation' || c.dateId < record.checkIn || c.dateId >= record.checkOut) fail('reservation_commitment_mismatch', 'Link an existing reservation commitment within the exact stay nights');
        if (Date.parse(c!.source.observedAt) > when) fail('future_arrangement_source', 'Mapping must follow the original commitment report');
        if (c!.activityId && !next.itinerary?.current.some((d) => d.dateId === c!.dateId && d.activities.some((a) => a.id === c!.activityId && a.kind === 'lodging'))) fail('reservation_commitment_mismatch', 'An activity-bound hotel commitment must name a lodging activity');
      }
      const { commitmentIds, source, correctionReason, ...fields } = record;
      const value = { ...previous, ...fields, tripctlArrangement: { version: 1 as const, commitmentIds, source, bindingSource: input.source, ...(correctionReason ? { correctionReason } : {}) } };
      hotel.reservations ||= [];
      if (previous) hotel.reservations[hotel.reservations.indexOf(previous)] = value; else hotel.reservations.push(value);
    }
    if (!old) next.snapshot.trip.lodgings.push(hotel);
  }
  validateArrangements({ ...state, content: next });
  return { kind: 'lodging_arrangements', changedLodgingIds: input.changes.map((c) => c.lodgingId), changedReservationIds: input.changes.flatMap((c) => c.reservations.map((r) => r.id)), providerActions: false, scheduleChanged: false, paymentStatus: 'unknown', checkInStatus: 'unknown' };
}
export function changeArrangements(state: TripState, next: TripContent, op: ArrangementOperation): unknown {
  if (op.type === 'upsert_lodging_arrangements') return upsertLodgings(state, next, op);
  if (op.type === 'set_trip_display_metadata') {
    human(op.source);
    if ((next.displayMetadata?.version || 0) !== op.expectedVersion) fail('display_metadata_version_conflict', 'Re-read the current display metadata version');
    const prior = [next.displayMetadata?.source.observedAt, ...auditEvents(state).flatMap((h) => components(h.operation)).filter((a) => a.type === 'set_trip_display_metadata').map((a) => a.source.observedAt)].filter((t): t is string => Boolean(t));
    if (prior.some((t) => Date.parse(t) >= Date.parse(op.source.observedAt))) fail('stale_display_metadata', 'Display corrections need newer explicit source evidence, including after undo');
    next.displayMetadata = { ...op.record, version: op.expectedVersion + 1, source: op.source };
    return { kind: 'trip_display_metadata', tripId: next.snapshot.trip.id, version: next.displayMetadata.version, snapshotNameChanged: false, scheduleChanged: false };
  }
  const details: unknown[] = [];
  if (op.displayMetadata) details.push(changeArrangements(state, next, { type: 'set_trip_display_metadata', ...op.displayMetadata }));
  if (op.lodgings) details.push(upsertLodgings(state, next, op.lodgings));
  if (op.routeActivities || op.dayRoutes) next.linkage ||= emptyLinkage();
  for (const record of op.routeActivities || []) details.push(changeReminders(state, next, { type: 'record_route_activity', record }));
  for (const record of op.dayRoutes || []) details.push(changeReminders(state, next, { type: 'set_day_route', record }));
  return { kind: 'journey_context_reconciliation', components: details, atomic: true, historyEventsAdded: 1, scheduleChanged: false, providerActions: false };
}
export function validateArrangements(state: Pick<TripState, 'content'>) {
  const c = state.content; const dates = preparePlanningContext(c.snapshot).tripDates.map((d) => d.id); const mappings = new Set<string>();
  if (c.displayMetadata) human(c.displayMetadata.source);
  for (const hotel of c.snapshot.trip.lodgings) for (const r of hotel.reservations || []) {
    if (r.tripctlArrangement === undefined) continue;
    const parsed = reservationBindingSchema.safeParse(r.tripctlArrangement);
    if (!parsed.success || !(r.checkIn < r.checkOut)) fail('invalid_arrangement', 'Canonical reservation metadata is invalid');
    if (!dates.some((d) => d >= r.checkIn && d < r.checkOut)) fail('invalid_arrangement', 'Canonical reservation must cover a journey night');
    const binding = parsed.data!; human(binding.source); human(binding.bindingSource);
    if (Date.parse(binding.bindingSource.observedAt) < Date.parse(binding.source.observedAt)) fail('invalid_arrangement', 'Reservation binding predates its provenance');
    if (c.snapshot.trip.lodgings.filter((l) => l.reservations?.some((x) => x.id === r.id)).length !== 1 || hotel.reservations!.filter((x) => x.id === r.id).length !== 1) fail('reservation_identity_conflict', 'Canonical reservation IDs must identify exactly one hotel record');
    for (const id of binding.commitmentIds) {
      const row = c.itinerary?.commitments.find((x) => x.id === id);
      if (!row || row.kind !== 'reservation' || row.dateId < r.checkIn || row.dateId >= r.checkOut || Date.parse(row.source.observedAt) > Date.parse(binding.bindingSource.observedAt)) fail('reservation_commitment_mismatch', 'Canonical reservation has an invalid original commitment reference');
      if (row!.activityId && !c.itinerary?.current.some((d) => d.dateId === row!.dateId && d.activities.some((a) => a.id === row!.activityId && a.kind === 'lodging'))) fail('reservation_commitment_mismatch', 'Hotel commitments must name a lodging activity');
      if (mappings.has(id)) fail('reservation_commitment_conflict', 'A commitment must map to exactly one canonical reservation');
      mappings.add(id);
    }
  }
}
export function exportTripDisplay(state: TripState) {
  const m = state.content.displayMetadata;
  return tripDisplayOutputSchema.parse({ tripId: state.content.snapshot.trip.id, displayName: m?.displayName || state.content.snapshot.trip.name || state.content.snapshot.trip.id, aliases: m?.aliases || [], year: m?.year ?? null, month: m?.month ?? null, knownWindowStart: m?.knownWindowStart ?? null, knownWindowEnd: m?.knownWindowEnd ?? null, metadataVersion: m?.version || 0, source: m?.source || null, basis: m ? 'explicit_metadata' : 'snapshot_name_only', sourceRevision: state.revision, sourceStateHash: stateHash(state), ...stateHashContext(state), readOnly: true, saved: false });
}

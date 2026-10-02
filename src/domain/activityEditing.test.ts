import { describe, it, expect, vi } from 'vitest';
import fixture from '../../fixtures/booked-day.snapshot.json';
import { previewActivityChange, activityOperationSchema } from './activityEditing';
import { planningSnapshotSchema, preparePlanningContext, callPlanningTool } from './planningTools';
import { compactPlanForAi } from './aiPrompts';
import { normalizePlan } from './plan';
const source = { kind: 'synthetic' as const, reference: 'synthetic:explicit-activity-instruction', observedAt: '2026-10-02T12:00:00Z' };
const base = { dateId: '2026-10-11', planId: 'museum', source };
const link = { type: 'link_booking_activities' as const, ...base, bookingId: 'dinner-booking', stopIds: ['dinner-stop'] };
const edit = { type: 'edit_activity' as const, ...base, stopId: 'afternoon-stop', patch: { title: 'Synthetic indoor afternoon', location: { label: 'Synthetic indoor venue', address: 'Fixture only', query: 'fixture-indoor' }, weatherRelevant: false } };
const initial = () => planningSnapshotSchema.parse(structuredClone(fixture));
const linked = () => previewActivityChange(initial(), link).nextSnapshot;
function expectCode(action: () => unknown, code: string) {
  try { action(); expect.fail('Expected explicit error'); } catch (error) { expect(error).toMatchObject({ code }); }
}
describe('fixed-time activity edits', () => {
  it('requires explicit stable booking linkage and edits only the permitted activity without implicit effects', () => {
    const snapshot = initial(); const before = structuredClone(snapshot);
    expect(previewActivityChange(snapshot, edit)).toMatchObject({ blocks: ['booking_activity_link_required'], nextSnapshot: snapshot });
    const binding = previewActivityChange(snapshot, link);
    expect(binding.blocks).toEqual([]);
    expect(binding.nextSnapshot.trip.plans[0].bookings![0]).toMatchObject({ id: 'dinner-booking', dateId: base.dateId, stopIds: ['dinner-stop'], stopLinkSource: source, status: 'done' });
    const result = previewActivityChange(binding.nextSnapshot, edit);
    expect(result.blocks).toEqual([]);
    expect(result.nextSnapshot.trip.plans[0].stops![1]).toMatchObject({ id: 'afternoon-stop', time: '14:00', ...edit.patch });
    expect(result.nextSnapshot.trip.plans[0].stops![0]).toEqual(snapshot.trip.plans[0].stops![0]);
    expect(result.nextSnapshot.trip.plans[0].stops![2]).toEqual(snapshot.trip.plans[0].stops![2]);
    expect(result.nextSnapshot.trip.plans[0].bookings).toEqual(binding.nextSnapshot.trip.plans[0].bookings);
    expect(result.nextSnapshot.trip.schedule).toEqual(snapshot.trip.schedule);
    expect(result.nextSnapshot.trip.lodgings).toEqual(snapshot.trip.lodgings);
    expect(result.nextSnapshot.trip.checklistText).toEqual(snapshot.trip.checklistText);
    expect(snapshot).toEqual(before);
  });
  it('protects linked dinner, whole-day locks, historical plans, provider guesses and shared catalog entries', () => {
    const snapshot = linked();
    expect(previewActivityChange(snapshot, { ...edit, stopId: 'dinner-stop' }).blocks).toContain('booked_activity_locked');
    snapshot.trip.schedule[base.dateId].planLocked = true;
    expect(previewActivityChange(snapshot, edit).blocks).toContain('locked_plan_change');
    delete snapshot.trip.schedule[base.dateId].planLocked;
    snapshot.todayId = '2026-10-12';
    expect(previewActivityChange(snapshot, edit).blocks).toContain('historical_activity_change');
    snapshot.todayId = fixture.todayId;
    expect(previewActivityChange(snapshot, { ...edit, source: { ...source, kind: 'provider' } }).blocks).toContain('unconfirmed_activity_intent');
    snapshot.trip.schedule['2026-10-10'] = { planId: base.planId, status: 'abandoned' };
    expect(previewActivityChange(snapshot, edit).blocks).toContain('plan_shared_across_dates');
    delete snapshot.trip.schedule['2026-10-10']; snapshot.trip.archived = true;
    expect(previewActivityChange(snapshot, edit).blocks).toContain('archived_trip');
  });
  it('does not silently change a confirmed booking link or a separately dated reservation', () => {
    const snapshot = linked();
    expect(previewActivityChange(snapshot, { ...link, stopIds: ['afternoon-stop'] }).blocks).toContain('confirmed_booking_link_change');
    snapshot.trip.plans[0].bookings![0].dateId = '2026-10-12';
    expect(previewActivityChange(snapshot, link).blocks).toContain('booking_date_mismatch');
    expect(previewActivityChange(snapshot, edit).blocks).toContain('booking_date_mismatch');
    const alias = initial(); alias.trip.plans[0].bookings![0].date_id = '2026-10-12';
    expect(previewActivityChange(alias, link).blocks).toContain('booking_date_mismatch');
    alias.trip.plans[0].bookings![0].date_id = '2026-10-11';
    alias.trip.plans[0].reservations = [{ id: 'dinner-booking', title: 'Ambiguous alias booking', status: 'done' }];
    expect(previewActivityChange(alias, link).blocks).toContain('stable_booking_ids_required');
    expect(previewActivityChange(initial(), { ...link, source: { ...source, kind: 'provider' } }).blocks).toContain('unconfirmed_activity_intent');
  });
  it('rejects positional legacy edits, duplicates and unknown references with explicit errors', () => {
    const snapshot = initial(); snapshot.trip.plans[0].stops![1] = 'Legacy afternoon';
    expect(previewActivityChange(snapshot, edit).blocks).toContain('stable_activity_ids_required');
    snapshot.trip.plans[0].stops![1] = { id: 'morning-stop', title: 'Duplicate ID' };
    expect(previewActivityChange(snapshot, edit).blocks).toContain('stable_activity_ids_required');
    const missingBookingId = initial(); delete missingBookingId.trip.plans[0].bookings![0].id;
    expect(previewActivityChange(missingBookingId, link).blocks).toContain('stable_booking_ids_required');
    expectCode(() => previewActivityChange(initial(), { ...link, bookingId: 'missing' }), 'unknown_id');
    expectCode(() => previewActivityChange(initial(), { ...link, stopIds: ['missing'] }), 'unknown_id');
    expectCode(() => previewActivityChange(initial(), { ...edit, stopId: 'missing' }), 'unknown_id');
    expectCode(() => previewActivityChange(initial(), { ...edit, dateId: '2026-10-15' }), 'unknown_date');
    expectCode(() => previewActivityChange(initial(), { ...edit, dateId: '2026-10-10' }), 'assignment_mismatch');
    expectCode(() => previewActivityChange(initial(), { ...edit, planId: 'missing' }), 'unknown_id');
  });
  it.each([{ time: '15:00' }, { id: 'replacement' }, { stops: [] }, {}, { location: { label: 'Guessed point', address: '', latitude: 1, longitude: 2 } }])('refuses unsupported patch fields and empty patches: %j', (patch) => {
    expect(activityOperationSchema.safeParse({ ...edit, patch }).success).toBe(false);
    expectCode(() => previewActivityChange(initial(), { ...edit, patch }), 'invalid_operation');
  });
  it('removes affected route aliases and stale location facts without changing clocks or booking content', () => {
    const snapshot = linked(); const stops = snapshot.trip.plans[0].stops!;
    stops[1] = { ...stops[1] as object, time_window: '14:00-16:00', description: 'Old note', weather_relevant: false, location: { label: 'Old', latitude: 1, longitude: 2, map_point: { longitude: 1, latitude: 2, coordinate_system: 'GCJ-02' } }, place: 'Old alias', opening_hours: '09:00-16:00', openingHours: 'stale', transfer_from_previous: { mode: 'walking', duration: '20 minutes' }, transferFromPrevious: { mode: 'walking', duration: '20 minutes' }, travelFromPrevious: { mode: 'walking', duration: '20 minutes' } };
    stops[2] = { ...stops[2] as object, transfer: { mode: 'walking', duration: '30 minutes' }, travel_from_previous: { mode: 'walking', duration: '30 minutes' } };
    const before = structuredClone(snapshot);
    const result = previewActivityChange(snapshot, { ...edit, patch: { ...edit.patch, weatherRelevant: true, note: '' } });
    expect(result.detail.invalidatedTransferStopIds).toEqual(['afternoon-stop', 'dinner-stop']);
    expect(result.detail.changes.map((change) => change.id)).toEqual(['afternoon-stop', 'dinner-stop']);
    expect(result.detail.noteCodes).toContain('adjacent_routes_require_recheck');
    const normalized = preparePlanningContext(result.nextSnapshot).plans[0];
    expect(normalized.stops[1]).toMatchObject({ id: 'afternoon-stop', time: '14:00', note: '', weatherRelevant: true, openingHours: '', transferFromPrevious: null });
    expect(normalized.stops[2]).toMatchObject({ id: 'dinner-stop', time: '18:30', title: 'Synthetic reserved dinner', transferFromPrevious: null });
    expect(result.nextSnapshot.trip.plans[0].stops![1]).toMatchObject({ location: edit.patch.location, time_window: '14:00-16:00' });
    expect(result.nextSnapshot.trip.plans[0].bookings).toEqual(before.trip.plans[0].bookings);
    expect(snapshot).toEqual(before);
  });
  it('preserves explicit booking provenance in normalized AI export, and rejects malformed persisted links', async () => {
    const snapshot = linked(); const context = preparePlanningContext(snapshot);
    const exported = compactPlanForAi(context.plans[0], base.dateId);
    const normalized = normalizePlan(exported, 0, context.tripDates);
    expect(normalized.bookings[0]).toMatchObject({ dateId: base.dateId, stopIds: ['dinner-stop'], stopLinkSource: source });
    snapshot.trip.plans[0].bookings![0].stopIds = ['missing'];
    expect(await callPlanningTool('get_context', { snapshot })).toMatchObject({ ok: false, error: { code: 'invalid_reference' } });
    snapshot.trip.plans[0].bookings![0].stopIds = ['dinner-stop', 'dinner-stop'];
    expect(planningSnapshotSchema.safeParse(snapshot).success).toBe(false);
    const legacy = initial(); legacy.trip.plans[0].bookings![0].stopIds = ['stop-2']; legacy.trip.plans[0].stops![1] = 'Legacy afternoon';
    expect(await callPlanningTool('get_context', { snapshot: legacy })).toMatchObject({ ok: false, error: { code: 'invalid_reference' } });
  });
  it('is deterministic with caller-supplied dates, IDs and source and needs no ambient clock or network', () => {
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('Implicit clock'); });
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Implicit ID'); });
    const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('Implicit network'); });
    try { const snapshot = linked(); expect(previewActivityChange(snapshot, edit)).toEqual(previewActivityChange(snapshot, edit)); }
    finally { clock.mockRestore(); random.mockRestore(); network.mockRestore(); }
  });
});

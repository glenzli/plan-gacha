import { describe, expect, it } from 'vitest';
import { normalizePlan } from './plan';
import { normalizeTripSnapshot, normalizeSchedule } from './trip';
import { buildAssignmentPreview } from './planning';
import { buildTripExportPayload } from './tripExport';
import { getEditedPlanSchedule } from './planEditing';
import { compactPlanForAi, compactLodgingForAi, getLodgingContextForDate } from './aiPrompts';
import { NO_LODGING, getLodgingImpacts, getLodgingTasks, normalizeLodging, normalizeLodgingDrafts, resolveLodgingStops, resolveNightLodging } from './lodging';

const date = '2026-10-02';
const hotels = [
  normalizeLodging({ id: 'a', name: 'Hotel A', location: { label: 'Hotel A', address: 'A street', map_point: { longitude: 120.3, latitude: 36.1, coordinate_system: 'WGS84' } }, check_in: '2026-10-01', check_out: '2026-10-04', booking_url: 'https://example.com/book', reservations: [{ id: 'order-a', check_in: '2026-10-01', check_out: '2026-10-04', status: 'booked', cancel_by: '2026-10-01 18:00 UTC+8' }] })!,
  normalizeLodging({ id: 'b', name: 'Hotel B', location: { label: 'Hotel B', address: 'B street' }, default_for_trip: false })!,
];
const makePlan = (id: string, ids?: string[], preferred = '') => normalizePlan({ id, name: id, stops: [{ title: 'Museum' }], ...(ids ? { lodging: { mode: 'options', option_ids: ids, preferred_id: preferred } } : {}) });
const a = makePlan('plan-a'); const b = makePlan('plan-b', ['b']);
const plans = new Map([a, b].map((plan) => [plan.id, plan]));

describe('night lodging resolution', () => {
  it('inherits legacy date ranges and excludes checkout night', () => {
    expect(resolveNightLodging(date, {}, plans, hotels).selected?.id).toBe('a');
    expect(resolveNightLodging('2026-10-04', {}, plans, hotels).selected).toBeNull();
    expect(normalizeLodging({ name: 'Legacy' })?.reservations).toEqual([]);
  });
  it('uses plan alternatives without changing a real booking', () => {
    const before = { [date]: { planId: a.id } }; const after = { [date]: { planId: b.id } };
    expect(resolveNightLodging(date, after, plans, hotels).selected?.id).toBe('b');
    const tasks = getLodgingTasks(date, after, plans, hotels);
    expect(tasks.map((task) => task.type)).toEqual(['book', 'review']);
    expect(tasks[1]).toMatchObject({ hotel: { id: 'a' }, reservation: { id: 'order-a', status: 'booked' }, partial: true });
    expect(getLodgingImpacts(before, after, plans, plans, hotels, hotels, [date, '2026-10-03'])[0].nextMorning).toBe('2026-10-03');
    expect(getLodgingImpacts(before, after, plans, plans, hotels, hotels, [date])[0].nextMorning).toBe('');
    expect(hotels[0].reservations?.[0].status).toBe('booked');
  });
  it('leaves multiple unranked hotels unresolved and does not request premature cancellation', () => {
    const plan = makePlan('choices', ['a', 'b']); const map = new Map([[plan.id, plan]]);
    expect(resolveNightLodging(date, { [date]: { planId: plan.id } }, map, hotels).status).toBe('choose');
    expect(getLodgingTasks(date, { [date]: { planId: plan.id } }, map, hotels).map((task) => task.type)).toEqual(['choose']);
    const preferred = makePlan('choices', ['a', 'b'], 'b');
    expect(resolveNightLodging(date, { [date]: { planId: preferred.id } }, new Map([[preferred.id, preferred]]), hotels).selected?.id).toBe('b');
  });
  it('keeps fixed lodging when selecting or moving plans and reports the conflict', () => {
    const schedule = { [date]: { planId: a.id, lodgingId: 'a', lodgingLocked: true } };
    const next = buildAssignmentPreview(schedule, date, b, plans, { todayId: '2026-10-01' }).nextSchedule;
    expect(next[date].lodgingId).toBe('a');
    expect(resolveNightLodging(date, next, plans, hotels)).toMatchObject({ selected: { id: 'a' }, conflict: true });
    const moved = getEditedPlanSchedule(schedule, a.id, a.id, '2026-10-03');
    expect(moved[date]).toEqual({ planId: '', lodgingId: 'a', lodgingLocked: true });
    expect(normalizeSchedule(moved)[date]).toEqual(moved[date]);
  });
  it('does not add booking tasks when no stay is required, or a booking covers the chosen hotel', () => {
    expect(getLodgingTasks(date, { [date]: { planId: a.id } }, plans, hotels)).toEqual([]);
    const tasks = getLodgingTasks(date, { [date]: { planId: a.id, lodgingId: NO_LODGING } }, plans, hotels);
    expect(tasks.map((task) => task.type)).toEqual(['review']);
    const cancelled = hotels.map((hotel) => ({ ...hotel, reservations: hotel.reservations?.map((reservation) => ({ ...reservation, status: 'cancelled' as const })) }));
    expect(getLodgingTasks(date, { [date]: { planId: b.id } }, plans, cancelled).map((task) => task.type)).toEqual(['book']);
  });
});

describe('lodging route anchors and persistence', () => {
  it('uses the previous night for departure, refreshes location, invalidates old duration and keeps required via', () => {
    const plan = normalizePlan({ id: 'morning', name: 'Morning', stops: [
      { id: 'hotel', title: 'Depart hotel', location: hotels[0].location, lodging_anchor: 'previous_night', lodging_id: 'a' },
      { id: 'museum', title: 'Museum', transfer_from_previous: { mode: 'car', duration: '20 min', depart_at: '09:00', via: [{ label: 'Scenic road', address: 'Road entrance' }] } },
    ] });
    const result = resolveLodgingStops(plan, '2026-10-03', { [date]: { planId: b.id } }, plans, hotels);
    expect(result.stops[0].location.address).toBe('B street');
    expect(result.stops[1]).toMatchObject({ lodgingRouteChanged: true, transferFromPrevious: { duration: '', departAt: '', via: [{ label: 'Scenic road' }] } });
    expect(plan.stops[1].transferFromPrevious?.duration).toBe('20 min');
    expect(normalizePlan(compactPlanForAi(plan, null)).stops[0].lodgingAnchor).toBe('previous_night');
  });
  it('recognizes exact legacy endpoint hotel locations and clears unresolved navigation points', () => {
    const plan = normalizePlan({ id: 'legacy', name: 'Legacy', stops: [{ title: 'Depart', location: hotels[0].location }, { title: 'Visit' }] });
    const resolved = resolveLodgingStops(plan, '2026-10-03', { [date]: { planId: b.id } }, plans, hotels);
    expect(resolved.stops[0].location.label).toBe('Hotel B');
    const unknown = resolveLodgingStops(plan, '2026-10-03', { [date]: { planId: b.id, lodgingId: NO_LODGING } }, plans, hotels);
    expect(unknown.stops[0]).toMatchObject({ lodgingUnresolved: true, location: { label: '', address: '' } });
    expect(unknown.stops[0].location.mapPoint).toBeUndefined();
  });
  it('preserves coordinates, links and reservations on an unchanged manual save', () => {
    const [saved] = normalizeLodgingDrafts([{ ...hotels[0], address: 'A street' }]);
    expect(saved.location.mapPoint).toEqual(hotels[0].location.mapPoint);
    expect(saved.bookingUrl).toBe('https://example.com/book');
    expect(saved.reservations).toEqual(hotels[0].reservations);
    expect(normalizeLodgingDrafts([{ ...hotels[0], address: 'Other street' }])[0].location.mapPoint).toBeUndefined();
  });
  it('round trips old/default and new/plan lodging through snapshot and export normalization', () => {
    const trip = normalizeTripSnapshot({ id: 'trip', startDateStr: date, tripDays: 2, plans: [b], lodgings: hotels, schedule: { [date]: { planId: b.id, lodgingId: 'b', lodgingLocked: true } } });
    const exported = buildTripExportPayload({ ...trip, schemaVersion: '1.0' });
    const restored = normalizeTripSnapshot(JSON.parse(JSON.stringify(exported)));
    expect(restored.lodgings).toEqual(trip.lodgings);
    expect(restored.plans[0].lodging).toEqual(b.lodging);
    expect(restored.schedule).toEqual(trip.schedule);
    expect(compactLodgingForAi(hotels[0])).toMatchObject({ location: { map_point: { coordinate_system: 'WGS84' } }, reservations: [{ status: 'booked' }] });
    expect(getLodgingContextForDate(hotels, date, trip.schedule, new Map([[b.id, b]]))).toMatchObject({ tonight_lodging_id: 'b', fixed: true });
    expect(JSON.stringify(getLodgingContextForDate(hotels, date))).not.toContain('A street');
  });
});

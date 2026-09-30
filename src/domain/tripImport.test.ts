import { describe, expect, it } from 'vitest';
import { normalizePlan } from './plan';
import { mergeLodgings, normalizeLodging } from './lodging';
import { prepareTripImport } from './tripImport';
import { ScheduleEntryStatus } from './trip';

const dates = [{ id: '2026-10-01' }, { id: '2026-10-02' }];
const plan = normalizePlan({ id: 'p1', name: 'Plan', stops: [{ title: 'Museum' }] }, 0, dates);
const hotel = normalizeLodging({ id: 'hotel-a', name: 'Hotel A', default_for_trip: true, check_in: '2026-10-01', check_out: '2026-10-03', reservations: [{ id: 'order-a', check_in: '2026-10-01', check_out: '2026-10-03', status: 'booked' }] })!;

describe('joint itinerary and lodging import', () => {
  it('prepares a single AI envelope and adds hotel alternatives without applying anything', () => {
    const payload = { plan: { ...plan, lodging: { mode: 'options', option_ids: ['hotel-b'] }, assigned_day: dates[1].id }, lodgings: [{ id: 'hotel-b', name: 'Hotel B', default_for_trip: false }] };
    const original = JSON.stringify([plan, hotel]);
    const preview = prepareTripImport(payload, [plan], [hotel], {}, dates, true);
    expect(preview.lodgings).toHaveLength(2);
    expect(preview.schedule[dates[1].id].planId).toBe(plan.id);
    expect(preview.lodgingImpacts[0].tasks.map((task) => task.type)).toEqual(['book', 'review']);
    expect(JSON.stringify([plan, hotel])).toBe(original);
  });
  it('merges by id and does not erase or fabricate real reservations', () => {
    const merged = mergeLodgings([hotel], [{ id: 'hotel-a', reservations: [], note: 'Updated' }, { id: 'new', name: 'New', reservations: [{ status: 'booked' }] }], true);
    expect(merged[0].reservations).toEqual(hotel.reservations);
    expect(merged[1].reservations).toEqual([]);
    expect(merged[1].defaultForTrip).toBe(false);
    expect(mergeLodgings([hotel], [], true)).toEqual([hotel]);
    expect(() => mergeLodgings([hotel], [{ id: hotel.id, name: 'Different hotel' }], true)).toThrow('lodgingBookedPlaceChanged');
  });
  it('preserves default flags and fixed nights against an AI override', () => {
    const current = { [dates[1].id]: { planId: plan.id, lodgingId: hotel.id, lodgingLocked: true } };
    const preview = prepareTripImport({ schedule: [{ date: dates[1].id, plan_id: plan.id, lodging_id: 'hotel-b', lodging_locked: false }], lodgings: [{ id: 'hotel-b', name: 'B', default_for_trip: false }] }, [plan], [hotel], current, dates, true);
    expect(preview.schedule[dates[1].id]).toEqual(current[dates[1].id]);
    expect(preview.lodgings[1].defaultForTrip).toBe(false);
  });
  it('rejects missing references, invalid dates and changes to fixed history before mutation', () => {
    expect(() => prepareTripImport({ plans: [{ ...plan, lodging: { mode: 'options', option_ids: ['missing'] } }] }, [plan], [hotel], {}, dates, true)).toThrow('lodgingReferenceMissing');
    expect(() => prepareTripImport({ schedule: [{ date: '2026-11-01', plan_id: plan.id }] }, [plan], [hotel], {}, dates)).toThrow('planAssignedDateInvalid');
    expect(() => prepareTripImport({ plans: [{ ...plan, name: 'Changed' }] }, [plan], [hotel], { [dates[0].id]: { planId: plan.id } }, dates, true, dates[1].id)).toThrow('aiFixedHistory');
  });
  it('restores reservations from a user backup and applies lodging_id in schedule arrays', () => {
    const result = prepareTripImport({ plans: [plan], lodgings: [hotel], schedule: [{ date: dates[0].id, plan_id: plan.id, lodging_id: hotel.id }] }, [], [], {}, dates);
    expect(result.lodgings[0].reservations).toEqual(hotel.reservations);
    expect(result.schedule[dates[0].id].lodgingId).toBe(hotel.id);
    const restored = prepareTripImport({ lodgings: [{ ...hotel, reservations: hotel.reservations?.map((reservation) => ({ ...reservation, status: 'cancelled' })) }] }, [plan], [hotel], {}, dates);
    expect(restored.lodgings[0].reservations?.[0].status).toBe('cancelled');
  });
  it('keeps the plan for a lodging-only response and preserves abandoned days', () => {
    const current = { [dates[0].id]: { planId: plan.id }, [dates[1].id]: { planId: plan.id, status: ScheduleEntryStatus.Abandoned } };
    const result = prepareTripImport({ schedule: [{ date: dates[0].id, lodging_id: hotel.id }, { date: dates[1].id, plan_id: plan.id, lodging_id: hotel.id }] }, [plan], [hotel], current, dates, true);
    expect(result.schedule[dates[0].id]).toEqual({ planId: plan.id, lodgingId: hotel.id });
    expect(result.schedule[dates[1].id]).toEqual(current[dates[1].id]);
  });
  it('rejects invalid order dates and hotel changes that would change past unscheduled nights', () => {
    expect(() => prepareTripImport({ lodgings: [{ id: 'invalid', name: 'Invalid', reservations: [{ check_in: '2026-10-02', check_out: '2026-10-01', status: 'booked' }] }] }, [], [], {}, dates)).toThrow('lodgingDatesInvalid');
    expect(() => prepareTripImport({ lodgings: [{ id: hotel.id, check_in: '2026-10-02' }] }, [plan], [hotel], {}, dates, true, dates[1].id)).toThrow('aiFixedHistory');
  });
  it('merges hotel location fields while replacing explicit snake-case coordinates', () => {
    const withPoint = normalizeLodging({ ...hotel, location: { label: hotel.name, address: 'Old address', map_point: { latitude: 36, longitude: 120, coordinate_system: 'WGS84' } } })!;
    const result = mergeLodgings([withPoint], [{ id: hotel.id, location: { map_point: { latitude: 36.1, longitude: 120.1, coordinate_system: 'GCJ-02' } } }], true)[0];
    expect(result.location.address).toBe('Old address');
    expect(result.location.mapPoint).toEqual({ latitude: 36.1, longitude: 120.1, coordinateSystem: 'GCJ-02' });
    expect(result.reservations).toEqual(withPoint.reservations);
  });
});

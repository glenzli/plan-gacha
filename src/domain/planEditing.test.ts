import { describe, expect, it } from 'vitest';
import { normalizePlan } from './plan';
import { editStopLocation, getEditablePlan, getEditedPlanSchedule, replacePlanStops, serializePlanEditDraft, updateRelatedPlan } from './planEditing';
import { applyPlanConstraintDraft, getPlanConstraintDraft } from './planConstraints';
import { ScheduleEntryStatus } from './trip';

const dates = [{ id: '2026-10-01' }, { id: '2026-10-02' }];
const plan = normalizePlan({
  id: 'drive', name: '山路自驾', description: '保留完整内容',
  location: { label: '白山市', weather_location: { query: 'Baishan, Jilin, China', country_code: 'CN', latitude: 41.9388, longitude: 126.4278 } },
  stops: [
    { id: 'hotel', title: '出发', time: '08:00', location: { label: '酒店', address: '酒店地址', map_point: { latitude: 43.9961, longitude: 125.6853, coordinate_system: 'WGS84' } }, weather_relevant: false },
    { id: 'lake', title: '湖边', time: '11:00', location: { label: '湖边', address: '湖边地址', map_point: { latitude: 42.2833, longitude: 126.6, coordinate_system: 'GCJ-02' } }, transfer_from_previous: { mode: '自驾', preferred_route_mode: 'driving', depart_at: '08:00', arrive_at: '11:00', duration: '3小时', note: '走景观道', via: [{ label: '景观道入口', map_point: { latitude: 42.35, longitude: 126.4, coordinate_system: 'WGS84' } }] } },
    { id: 'lunch', title: '午餐', time: '12:00', transfer_from_previous: { mode: '步行', duration: '15 分钟' } },
    { id: 'cafe', title: '咖啡', time: '13:00', transfer_from_previous: { mode: '步行', duration: '10 分钟' } },
  ],
  bookings: [{ id: 'ticket', title: '门票', type: 'ticket', status: 'done', cancel_url: 'https://example.com/cancel' }],
  reminders: [{ id: 'return', time: '16:00', text: '返程', links: [{ label: '官网', url: 'https://example.com/' }] }],
  tips: ['加油'], conflicts: ['other'], closed_dates: ['2026-10-02'],
}, 0, dates);

describe('editing an itinerary', () => {
  it('shows incoming exclusions and removes both sides when deselected', () => {
    const other = normalizePlan({ id: 'reverse', name: '互斥项', conflicts: ['drive', 'unrelated'] }, 0, dates);
    const editable = getEditablePlan(plan, [plan, other]);
    expect(editable.conflicts).toContain('reverse');
    expect(updateRelatedPlan(other, plan.id, editable)).toBe(other);
    expect(updateRelatedPlan(other, plan.id, { ...editable, conflicts: ['other'] }).conflicts).toEqual(['unrelated']);
    expect(updateRelatedPlan(other, plan.id, { ...editable, id: 'renamed' }).conflicts).toEqual(['renamed', 'unrelated']);
    expect(other.conflicts).toEqual(['drive', 'unrelated']);
  });
  it('round trips content and constraint edits without losing coordinates, required stops or reservations', () => {
    const constraints = getPlanConstraintDraft(plan);
    constraints.closed_dates = [];
    const edited = applyPlanConstraintDraft({ ...plan, stops: plan.stops.map((stop, index) => index === 1 ? { ...stop, time: '11:30' } : stop) }, constraints);
    const saved = normalizePlan(JSON.parse(serializePlanEditDraft({ plan: edited, assignedDay: dates[0].id })), 0, dates);
    expect(saved).toEqual(edited);
    expect(saved.stops[1].transferFromPrevious?.via?.[0].mapPoint).toEqual(plan.stops[1].transferFromPrevious?.via?.[0].mapPoint);
    expect(saved.bookings).toEqual(plan.bookings);
    expect(saved.reminders).toEqual(plan.reminders);
  });

  it('invalidates stale navigation coordinates while keeping weather context and supports reverting text', () => {
    const source = plan.stops[0].location;
    const changed = editStopLocation(source, '另一家酒店', source.address);
    expect(changed.mapPoint).toBeUndefined();
    expect(changed.latitude).toBe(source.latitude);
    expect(changed.query).toBe(source.query);
    expect(source.mapPoint).toBeDefined();
    expect(editStopLocation(source, source.label, source.address).mapPoint).toEqual(source.mapPoint);
  });

  it('clears only transfers whose origin changed after reordering or removing a stop', () => {
    const reordered = replacePlanStops(plan, [plan.stops[1], plan.stops[0], plan.stops[2], plan.stops[3]]);
    expect(reordered.stops.slice(0, 3).map((stop) => stop.transferFromPrevious)).toEqual([null, null, null]);
    expect(reordered.stops[3].transferFromPrevious).toBe(plan.stops[3].transferFromPrevious);
    const removed = replacePlanStops(plan, [plan.stops[0], plan.stops[2], plan.stops[3]]);
    expect(removed.stops[1].transferFromPrevious).toBeNull();
    expect(removed.stops[2].transferFromPrevious).toBe(plan.stops[3].transferFromPrevious);
    expect(plan.stops[1].transferFromPrevious?.via).toHaveLength(1);
  });

  it('moves an assigned plan without duplicate active dates and preserves unrelated history', () => {
    const schedule = { '2026-10-01': { planId: 'drive' }, '2026-10-02': { planId: 'other' }, '2026-09-30': { planId: 'drive', status: ScheduleEntryStatus.Abandoned } };
    expect(getEditedPlanSchedule(schedule, 'drive', 'drive', '2026-10-02')).toEqual({
      '2026-10-02': { planId: 'drive' },
      '2026-09-30': { planId: 'drive', status: ScheduleEntryStatus.Abandoned },
    });
    expect(schedule['2026-10-01']).toEqual({ planId: 'drive' });
    expect(getEditedPlanSchedule(schedule, 'drive', 'drive', '')).toEqual(schedule);
  });

  it('does not reactivate abandoned days on a content edit or lose status on ID changes', () => {
    const schedule = { '2026-10-01': { planId: 'drive', status: ScheduleEntryStatus.Abandoned } };
    expect(getEditedPlanSchedule(schedule, 'drive', 'drive', '2026-10-01')).toEqual(schedule);
    expect(getEditedPlanSchedule(schedule, 'drive', 'new-id', '')).toEqual({ '2026-10-01': { planId: 'new-id', status: ScheduleEntryStatus.Abandoned } });
  });
});

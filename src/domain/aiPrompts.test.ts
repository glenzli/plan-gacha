import { describe, expect, it } from 'vitest';
import {
  buildAiPlanningPrompt,
  buildSinglePlanPrompt,
  compactPlanForAi,
  compactStopRouteForAi,
  getPlanJsonSchema,
  getSinglePlanJsonSchema,
} from './aiPrompts';
import { normalizePlan } from './plan';

describe('AI prompt schemas', () => {
  it('keeps planning schema focused on importable plan fields', () => {
    const schema = getPlanJsonSchema('zh');

    expect(schema).toContain('weather_location');
    expect(schema).toContain('transfer_from_previous');
    expect(schema).toContain('preferred_route_mode');
    expect(JSON.parse(schema).plans[0].stops[0]).toMatchObject({ id: 'unique_stop_id', location: { map_point: null }, transfer_from_previous: { via: [] } });
    expect(getPlanJsonSchema('en')).toContain('preferred_route_mode');
    expect(JSON.parse(getSinglePlanJsonSchema('zh')).stops[0].location.map_point).toBeNull();
    expect(JSON.parse(getSinglePlanJsonSchema('en')).stops[0].location.map_point).toBeNull();
    expect(JSON.parse(schema).lodgings[0].default_for_trip).toBe(false);
    expect(schema).not.toContain('"tags"');
  });
});

describe('single plan prompts', () => {
  it('builds a compact single-plan prompt without full trip date noise', () => {
    const prompt = buildSinglePlanPrompt({
      language: 'zh',
      isCreatingPlan: false,
      planContext: {
        current_plan: {
          id: 'plan_nara',
          name: '奈良',
        },
      },
      userRequest: '改成雨天可执行方案',
    });

    expect(prompt).toContain('{plan, lodgings?, warnings?}');
    expect(prompt).toContain('preferred_route_mode');
    for (const mode of ['walking', 'transit', 'driving']) expect(prompt).toContain(mode);
    expect(prompt).toContain('restaurant_reservation');
    expect(prompt).toContain('无法核实时省略整个 map_point');
    expect(prompt).toContain('不要复制 weather_location');
    expect(prompt).toContain('景观道路却没有可靠的中途点');
    expect(prompt).toContain('路线未变时保留原有 via');
    expect(prompt).toContain('用户需求，请优先处理：\n改成雨天可执行方案');
    expect(prompt).toContain('Kawachi-Nagano, Osaka, Japan');
    expect(prompt).not.toContain('existing_plan_ids');
    expect(prompt).not.toContain('2026-07-10 / D1');
  });
});

describe('AI compaction helpers', () => {
  it('keeps verified stop map points through an unchanged raw JSON edit', () => {
    const original = normalizePlan({
      id: 'route', name: 'Route', location: { label: '青岛市', country_code: 'CN' },
      stops: [
        { id: 'start', title: '青岛站', location: { label: '青岛站', map_point: { longitude: 120.312786, latitude: 36.064812, coordinate_system: 'WGS84' } } },
        { id: 'end', title: '栈桥景区', location: { label: '栈桥景区', map_point: { longitude: 120.3193, latitude: 36.061736, coordinate_system: 'GCJ-02' } }, transfer_from_previous: {
          mode: '自驾', via: [{ label: '沿海路口', country_code: 'CN', map_point: { longitude: 120.31, latitude: 36.06, coordinate_system: 'GCJ-02' } }],
        } },
      ],
    }, 0, [{ id: '2026-09-28' }]);
    const draft = compactPlanForAi(original, '2026-09-28');
    const saved = normalizePlan(draft, 0, [{ id: '2026-09-28' }]);

    expect(saved.stops.map((stop) => stop.location.mapPoint)).toEqual(
      original.stops.map((stop) => stop.location.mapPoint),
    );
    expect(saved.stops.map((stop) => stop.id)).toEqual(['start', 'end']);
    expect(saved.stops[1].transferFromPrevious?.via?.map((point) => point.mapPoint))
      .toEqual(original.stops[1].transferFromPrevious?.via?.map((point) => point.mapPoint));
    expect(saved.stops[1].transferFromPrevious?.via?.[0].countryCode).toBe('CN');
    expect(compactStopRouteForAi(original.stops[1])).toMatchObject({
      id: 'end',
      location: { label: '栈桥景区', map_point: { longitude: 120.3193, coordinate_system: 'GCJ-02' } },
      transfer_from_previous: { via: [{ label: '沿海路口', country_code: 'CN', map_point: { longitude: 120.31 } }] },
    });
  });

  it('strips empty values and maps app fields to AI JSON names', () => {
    const compact = compactPlanForAi({
      id: 'p1',
      name: 'Plan',
      description: '',
      priority: 'must',
      location: { label: 'Osaka', query: 'Osaka, Japan' },
      stops: [
        {
          time: '10:00',
          title: 'Museum',
          location: { label: 'Museum', address: '' },
          transferFromPrevious: { departAt: '09:30', mode: 'train', preferredRouteMode: 'transit', duration: '30 min', note: '' },
          openingHours: '10:00-17:00',
          note: '',
          weatherRelevant: true,
        },
      ],
      available_dates: [],
      closed_dates: [],
      weather_rules: { best: ['sunny'], ok: [], blocked: ['storm'] },
      conflicts: [],
      bookings: [
        {
          id: 'b1',
          type: 'ticket',
          title: 'Ticket',
          status: 'pending',
          address: '',
          url: 'https://example.com/book',
          cancelUrl: 'https://example.com/cancel',
          note: '',
        },
      ],
      reminders: [],
      tips: [],
    }, '2026-07-10');

    expect(compact).toMatchObject({
      id: 'p1',
      priority: 'must',
      stops: [
        {
          transfer_from_previous: {
            depart_at: '09:30',
            mode: 'train',
            preferred_route_mode: 'transit',
            duration: '30 min',
          },
          opening_hours: '10:00-17:00',
        },
      ],
      bookings: [{ cancel_url: 'https://example.com/cancel' }],
      assigned_day: '2026-07-10',
    });
    expect(JSON.stringify(compact)).not.toContain('""');
  });
  it('includes shared weather context only once without dropping route coordinates or ids', () => {
    const location = { label: 'Qingdao', weather_location: { query: 'Qingdao, Shandong, China', country_code: 'CN' } };
    const plan = normalizePlan({ id: 'compact', name: 'Compact', location,
      stops: [{ id: 'stop', title: 'Museum', location: { ...location, label: 'Museum', map_point: { latitude: 36.1, longitude: 120.4, coordinate_system: 'GCJ-02' } } }],
      bookings: [{ id: 'saved-order', title: 'Ticket', type: 'ticket', status: 'done' }], reminders: [{ id: 'saved-reminder', time: '09:00', text: 'Bring ticket' }],
    });
    const compact = compactPlanForAi(plan, null);
    expect(JSON.stringify(compact).match(/weather_location/g)).toHaveLength(1);
    expect(normalizePlan(compact).stops[0].location).toEqual(plan.stops[0].location);
    expect(JSON.stringify(compact)).toContain('saved-order');
    expect(JSON.stringify(compact)).toContain('saved-reminder');
  });
});

describe('planning prompts', () => {
  it('builds generate prompts with duplicate-id guardrails', () => {
    const prompt = buildAiPlanningPrompt({
      mode: 'generate',
      language: 'en',
      tripContext: { trip: { name: 'Osaka' } },
      hasInitializedPlans: true,
      plannerQuestion: '',
      unplannedDates: [{ id: '2026-07-11' }],
      fixedDates: [],
      adjustableDates: [],
      remainingPlans: [],
      normalizedPlans: [{ id: 'existing_plan' }],
      summarizeScheduleDate: (date) => ({ date: date.id }),
      summarizePlan: (plan) => ({ id: plan.id }),
    });

    expect(prompt).toContain('Only output importable JSON');
    expect(prompt).toContain('preferred_route_mode');
    expect(prompt).toContain('never copy weather_location coordinates');
    expect(prompt).toContain('transfer_from_previous.via');
    expect(prompt).toContain('name the road in transfer_from_previous.note');
    expect(prompt).toContain('Use new plan ids');
    expect(prompt).toContain('existing_plan');
    expect(prompt).toContain('past_day_reviews are soft preferences');
  });

  it('treats existing map points and required waypoints as constraints in schedule-only replanning', () => {
    for (const language of ['zh', 'en']) {
      const prompt = buildAiPlanningPrompt({
        mode: 'replan', language,
        tripContext: { trip: { name: '青岛' } },
        hasInitializedPlans: true,
        unplannedDates: [], fixedDates: [], adjustableDates: [],
        remainingPlans: [{ id: 'coast' }], normalizedPlans: [],
        summarizeScheduleDate: (date) => ({ date: date.id }),
        summarizePlan: () => ({ stops: [{ location: { map_point: { longitude: 120.31 } }, transfer_from_previous: { via: [{ label: '沿海路口' }] } }] }),
      });
      expect(prompt).toContain('transfer_from_previous.via');
      expect(prompt).toContain('"map_point"');
      expect(prompt).toContain('"沿海路口"');
      expect(prompt).toContain(language === 'zh' ? '本次只重排日期和住宿' : 'schedule-and-lodging-only response');
    }
  });
  it('does not repeat the plan catalog or schedule when legacy context contains duplicates', () => {
    const prompt = buildAiPlanningPrompt({ mode: 'generate', language: 'en', tripContext: { existing_plans: ['obsolete duplicate'], existing_schedule: ['obsolete duplicate'] },
      hasInitializedPlans: true, unplannedDates: [], fixedDates: [], adjustableDates: [{ id: '2026-10-01' }], remainingPlans: [], normalizedPlans: [{ id: 'only-once-plan' }],
      summarizePlan: (plan) => ({ id: plan.id }), summarizeScheduleDate: (date) => ({ date: date.id }),
    });
    expect(prompt.match(/only-once-plan/g)).toHaveLength(1);
    expect(prompt.match(/2026-10-01/g)).toHaveLength(1);
    expect(prompt).not.toContain('obsolete duplicate');
    expect(prompt).toContain('reservations are confirmed facts');
  });
});

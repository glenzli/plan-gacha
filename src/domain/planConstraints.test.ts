import { describe, expect, it } from 'vitest';
import { normalizePlan } from './plan';
import {
  applyPlanConstraintDraft,
  getPlanConstraintDraft,
  getPlanConstraintImpacts,
  getPlanEditImpacts,
} from './planConstraints';
import { ScheduleEntryStatus, type NormalizedSchedule } from './trip';
import type { WeatherEvaluation } from './weather';

const tripDates = [{ id: '2026-10-01' }, { id: '2026-10-02' }];
const original = normalizePlan({
  id: 'scenic-drive',
  name: 'Scenic drive',
  description: 'Keep the planned stops intact.',
  available_dates: tripDates.map((date) => date.id),
  conflicts: [],
  weather_rules: { best: ['sunny'], ok: ['cloudy'], blocked: ['storm'] },
}, 0, tripDates);
const other = normalizePlan({
  id: 'city-day',
  name: 'City day',
  available_dates: tripDates.map((date) => date.id),
}, 1, tripDates);
const schedule: NormalizedSchedule = {
  '2026-10-01': { planId: original.id },
  '2026-10-02': { planId: other.id },
};
const unknownWeather = (): WeatherEvaluation => ({ level: 'unknown', snapshot: null });

describe('plan constraint edits', () => {
  it('checks all restrictions at a newly assigned date even when the plan itself is unchanged', () => {
    const restricted = { ...original, available_dates: ['2026-10-01'] };
    const impacts = getPlanEditImpacts([restricted], [restricted], { '2026-10-01': { planId: restricted.id } }, { '2026-10-02': { planId: restricted.id } }, {}, unknownWeather);
    expect(impacts).toEqual([{ dateId: '2026-10-02', planName: restricted.name, reasons: ['不在可去日期'] }]);
  });
  it('previews a changed weather location and an invalid date when the plan is moved', () => {
    const moved = { ...original, available_dates: ['2026-10-01'], location: { ...original.location, query: 'Rainy city' } };
    const evaluator = (plan: typeof original): WeatherEvaluation => ({ level: plan.location.query === 'Rainy city' ? 'blocked' : 'best', label: '天气不合适', snapshot: null });
    const impacts = getPlanEditImpacts([original, other], [moved, other], schedule, { '2026-10-02': { planId: original.id } }, {}, evaluator);
    expect(impacts[0].dateId).toBe('2026-10-02');
    expect(impacts[0].reasons).toContain('不在可去日期');
    expect(impacts[0].reasons).toContain('天气不合适');
  });
  it('preserves itinerary content while changing only scheduling constraints', () => {
    const draft = getPlanConstraintDraft(original);
    draft.available_dates = ['2026-10-02'];
    const updated = applyPlanConstraintDraft(original, draft);

    expect(updated.available_dates).toEqual(['2026-10-02']);
    expect(updated.description).toBe(original.description);
    expect(updated.stops).toBe(original.stops);
    expect(original.available_dates).toEqual(['2026-10-01', '2026-10-02']);
  });

  it('previews newly invalid dates and conflicts on both scheduled plans', () => {
    const draft = getPlanConstraintDraft(original);
    draft.available_dates = ['2026-10-02'];
    draft.conflicts = [other.id];

    expect(getPlanConstraintImpacts(original, draft, [original, other], schedule, {}, unknownWeather))
      .toEqual([
        {
          dateId: '2026-10-01',
          planName: original.name,
          reasons: ['不在可去日期', `与 ${other.name} 互斥`],
        },
        {
          dateId: '2026-10-02',
          planName: other.name,
          reasons: [`与 ${original.name} 互斥`],
        },
      ]);
  });

  it('ignores abandoned assignments and surfaces newly worse weather', () => {
    const draft = getPlanConstraintDraft(original);
    draft.weather_rules.best = [];
    const evaluateWeather = (plan: typeof original): WeatherEvaluation => ({
      level: plan.weather_rules.best.length ? 'best' : 'mismatch',
      snapshot: null,
    });
    const abandonedSchedule: NormalizedSchedule = {
      ...schedule,
      '2026-10-02': { planId: other.id, status: ScheduleEntryStatus.Abandoned },
    };

    expect(getPlanConstraintImpacts(original, draft, [original, other], abandonedSchedule, {}, evaluateWeather))
      .toEqual([{
        dateId: '2026-10-01',
        planName: original.name,
        reasons: ['天气不是最理想'],
      }]);
  });
});

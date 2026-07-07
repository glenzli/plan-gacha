import { describe, expect, it } from 'vitest';
import {
  buildAiPlanningPrompt,
  buildSinglePlanPrompt,
  compactPlanForAi,
  getPlanJsonSchema,
} from './aiPrompts';

describe('AI prompt schemas', () => {
  it('keeps planning schema focused on importable plan fields', () => {
    const schema = getPlanJsonSchema('zh');

    expect(schema).toContain('weather_location');
    expect(schema).toContain('transfer_from_previous');
    expect(schema).toContain('restaurant_reservation');
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

    expect(prompt).toContain('只输出单个计划 JSON 对象');
    expect(prompt).toContain('用户需求，请优先处理：\n改成雨天可执行方案');
    expect(prompt).toContain('Kawachi-Nagano, Osaka, Japan');
    expect(prompt).not.toContain('existing_plan_ids');
    expect(prompt).not.toContain('2026-07-10 / D1');
  });
});

describe('AI compaction helpers', () => {
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
          transferFromPrevious: { departAt: '09:30', mode: 'train', duration: '30 min', note: '' },
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
    expect(prompt).toContain('existing_plan_ids_should_not_duplicate');
    expect(prompt).toContain('existing_plan');
  });
});

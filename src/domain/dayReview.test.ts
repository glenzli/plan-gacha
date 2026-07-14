import { describe, expect, it } from 'vitest';
import {
  DayReviewRating,
  DayReviewTag,
  findDayReview,
  getDayReviewKey,
  getDayReviewsForDate,
  normalizeDayReviews,
} from './dayReview';

describe('day review normalization', () => {
  it('keeps reviews scoped to both the date and the assigned plan', () => {
    const firstKey = getDayReviewKey('2026-07-11', 'plan-a');
    const secondKey = getDayReviewKey('2026-07-11', 'plan-b');
    const reviews = normalizeDayReviews({
      [firstKey]: {
        date_id: '2026-07-11',
        plan_id: 'plan-a',
        plan_name: 'Museum day',
        rating: 'satisfied',
        tags: ['well_paced', 'worth_reusing', 'unknown'],
        note: '  Easy day.  ',
        updated_at: '2026-07-12T10:00:00.000Z',
      },
      [secondKey]: {
        dateId: '2026-07-11',
        planId: 'plan-b',
        rating: 'neutral',
        tags: ['weather_affected'],
      },
    });

    expect(findDayReview('2026-07-11', 'plan-a', reviews)).toMatchObject({
      rating: DayReviewRating.Satisfied,
      tags: [DayReviewTag.WellPaced, DayReviewTag.WorthReusing],
      note: 'Easy day.',
    });
    expect(findDayReview('2026-07-11', 'plan-b', reviews)?.rating).toBe(DayReviewRating.Neutral);
    expect(getDayReviewsForDate('2026-07-11', reviews)).toHaveLength(2);
  });

  it('drops entries without a supported rating', () => {
    expect(normalizeDayReviews({
      invalid: { dateId: '2026-07-11', planId: 'plan-a', rating: 'great' },
    })).toEqual({});
  });
});

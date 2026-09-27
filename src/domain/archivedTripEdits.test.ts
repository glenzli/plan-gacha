import { describe, expect, it } from 'vitest';
import { DayReviewRating, DayReviewTag, getDayReviewKey } from './dayReview';
import { createEmptyTripSnapshot } from './exampleData';
import { updateArchivedDayReview, updateArchivedTripSummary } from './archivedTripEdits';
import { createTripArchiveSummary, TripExpenseCategory } from './tripArchive';

describe('post-archive record edits', () => {
  const archived = {
    ...createEmptyTripSnapshot('Archived', '2026-07-10', 'archived'),
    archived: true,
    archiveSummary: createTripArchiveSummary({ note: 'First draft' }, '2026-07-11T00:00:00.000Z'),
  };
  const active = createEmptyTripSnapshot('Current', '2026-07-20', 'active');

  it('updates the summary while keeping its archive date and the itinerary', () => {
    const result = updateArchivedTripSummary([archived, active], 'archived', {
      currency: 'CNY',
      expenses: { [TripExpenseCategory.Food]: '120' },
      note: '  Final thoughts  ',
    }, '2026-07-12T00:00:00.000Z');

    expect(result[0]).toMatchObject({ archived: true, schedule: archived.schedule, plans: archived.plans });
    expect(result[0].archiveSummary).toMatchObject({
      note: 'Final thoughts',
      expenses: { food: 120 },
      archivedAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-12T00:00:00.000Z',
    });
    expect(result[1]).toBe(active);
  });

  it('updates only the targeted archived review and leaves active trips untouched', () => {
    const draft = {
      dateId: '2026-07-10',
      planId: 'plan-1',
      planName: 'Beach day',
      rating: DayReviewRating.Satisfied,
      tags: [DayReviewTag.WorthReusing],
      note: '  Lovely day  ',
    };
    const key = getDayReviewKey(draft.dateId, draft.planId);
    const first = updateArchivedDayReview([archived, active], 'archived', draft, '2026-07-12T00:00:00.000Z');
    const second = updateArchivedDayReview(first, 'archived', {
      ...draft,
      rating: DayReviewRating.Neutral,
      note: 'Changed my mind',
    }, '2026-07-13T00:00:00.000Z');

    expect(first[0].dayReviews[key]).toMatchObject({ note: 'Lovely day', rating: DayReviewRating.Satisfied });
    expect(second[0].dayReviews[key]).toMatchObject({ note: 'Changed my mind', rating: DayReviewRating.Neutral });
    expect(second[0].archived).toBe(true);
    expect(second[0].archiveSummary).toBe(archived.archiveSummary);
    expect(second[1]).toBe(active);
    expect(updateArchivedDayReview([active], 'active', draft)[0]).toBe(active);
  });
});

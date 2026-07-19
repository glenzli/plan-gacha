import { describe, expect, it } from 'vitest';
import { DayReviewRating } from './dayReview';
import { PlaceFeedbackStatus, StopOutcomeStatus } from './trip';
import { TripExpenseCategory } from './tripArchive';
import { buildTripExportPayload, readImportedTripHistory } from './tripExport';

describe('trip export payload', () => {
  it('round-trips feedback, stop outcomes, and day reviews', () => {
    const payload = buildTripExportPayload({
      schemaVersion: '1.0',
      startDateStr: '2026-07-10',
      tripDays: 1,
      lodgings: [],
      plans: [],
      schedule: {},
      placeFeedback: {
        museum: {
          key: 'museum',
          label: 'Museum',
          address: '',
          status: PlaceFeedbackStatus.Blacklisted,
          updatedAt: '2026-07-10T10:00:00.000Z',
        },
      },
      stopOutcomes: {
        '2026-07-10:plan-1:stop-1': {
          key: '2026-07-10:plan-1:stop-1',
          dateId: '2026-07-10',
          planId: 'plan-1',
          stopId: 'stop-1',
          stopTitle: 'Museum',
          status: StopOutcomeStatus.Abandoned,
          updatedAt: '2026-07-10T11:00:00.000Z',
        },
      },
      dayReviews: {
        '2026-07-10:plan-1': {
          key: '2026-07-10:plan-1',
          dateId: '2026-07-10',
          planId: 'plan-1',
          planName: 'Museum day',
          rating: DayReviewRating.Satisfied,
          tags: [],
          note: 'Good pace',
          updatedAt: '2026-07-10T12:00:00.000Z',
        },
      },
      archiveSummary: {
        currency: 'JPY',
        expenses: { [TripExpenseCategory.Food]: 8000 },
        note: 'Good trip',
        archivedAt: '2026-07-10T12:30:00.000Z',
        updatedAt: '2026-07-10T12:30:00.000Z',
      },
    });

    expect(readImportedTripHistory(payload)).toEqual({
      placeFeedback: payload.placeFeedback,
      stopOutcomes: payload.stopOutcomes,
      dayReviews: payload.dayReviews,
      archiveSummary: payload.archiveSummary,
    });
  });

  it('keeps history untouched when importing an older file without the optional fields', () => {
    expect(readImportedTripHistory({
      schemaVersion: '1.0',
      plans: [],
      schedule: {},
    })).toEqual({});
  });

  it('accepts legacy snake-case field names', () => {
    expect(readImportedTripHistory({
      day_reviews: {
        review: {
          date_id: '2026-07-10',
          plan_id: 'plan-1',
          rating: 'neutral',
        },
      },
    }).dayReviews).toMatchObject({
      '2026-07-10:plan-1': {
        rating: DayReviewRating.Neutral,
      },
    });
  });
});

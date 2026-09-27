import { getDayReviewKey, type DayReviewRating, type DayReviewTag } from './dayReview';
import { createTripArchiveSummary, type TripArchiveSummaryDraft } from './tripArchive';
import type { NormalizedTripSnapshot } from './trip';

export interface ArchivedDayReviewDraft {
  dateId: string;
  planId: string;
  planName: string;
  rating: DayReviewRating;
  tags: DayReviewTag[];
  note: string;
}

export function updateArchivedTripSummary(
  trips: NormalizedTripSnapshot[],
  tripId: string,
  draft: TripArchiveSummaryDraft,
  now = new Date().toISOString(),
): NormalizedTripSnapshot[] {
  return trips.map((trip) => trip.id === tripId && trip.archived ? {
    ...trip,
    archiveSummary: createTripArchiveSummary({
      ...draft,
      archivedAt: trip.archiveSummary?.archivedAt || draft.archivedAt,
    }, now),
  } : trip);
}

export function updateArchivedDayReview(
  trips: NormalizedTripSnapshot[],
  tripId: string,
  draft: ArchivedDayReviewDraft,
  now = new Date().toISOString(),
): NormalizedTripSnapshot[] {
  const key = getDayReviewKey(draft.dateId, draft.planId);
  return trips.map((trip) => trip.id === tripId && trip.archived ? {
    ...trip,
    dayReviews: {
      ...trip.dayReviews,
      [key]: {
        key,
        dateId: draft.dateId,
        planId: draft.planId,
        planName: draft.planName,
        rating: draft.rating,
        tags: draft.tags,
        note: draft.note.trim(),
        updatedAt: now,
      },
    },
  } : trip);
}

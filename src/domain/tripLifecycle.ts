import { addDays, parseDateId } from './date';
import { isEmptyTripDraft, type NormalizedTripSnapshot } from './trip';

export const RECENT_TRIP_REVIEW_DAYS = 7;

export enum TripTemporalStatus {
  Ongoing = 'ongoing',
  Upcoming = 'upcoming',
  Recent = 'recent',
  Past = 'past',
}

function differenceInCalendarDays(laterDateId: string, earlierDateId: string) {
  const later = parseDateId(laterDateId);
  const earlier = parseDateId(earlierDateId);
  const laterUtc = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
  const earlierUtc = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  return Math.round((laterUtc - earlierUtc) / 86_400_000);
}

export function getTripEndDate(trip: Pick<NormalizedTripSnapshot, 'startDateStr' | 'tripDays'>) {
  return addDays(trip.startDateStr, Math.max(trip.tripDays - 1, 0));
}

export function getTripTemporalStatus(
  trip: Pick<NormalizedTripSnapshot, 'startDateStr' | 'tripDays'>,
  todayId: string,
  recentReviewDays = RECENT_TRIP_REVIEW_DAYS,
) {
  const endDateId = getTripEndDate(trip);
  if (todayId < trip.startDateStr) return TripTemporalStatus.Upcoming;
  if (todayId <= endDateId) return TripTemporalStatus.Ongoing;
  if (differenceInCalendarDays(todayId, endDateId) <= recentReviewDays) return TripTemporalStatus.Recent;
  return TripTemporalStatus.Past;
}

export function isTripEnded(
  trip: Pick<NormalizedTripSnapshot, 'startDateStr' | 'tripDays'>,
  todayId: string,
) {
  return getTripEndDate(trip) < todayId;
}

export function findNearestRelevantTrip(
  trips: NormalizedTripSnapshot[],
  todayId: string,
  recentReviewDays = RECENT_TRIP_REVIEW_DAYS,
) {
  const statusPriority: Record<TripTemporalStatus, number> = {
    [TripTemporalStatus.Ongoing]: 0,
    [TripTemporalStatus.Upcoming]: 1,
    [TripTemporalStatus.Recent]: 2,
    [TripTemporalStatus.Past]: 3,
  };

  return trips
    .filter((trip) => !trip.archived && !isEmptyTripDraft(trip))
    .map((trip) => {
      const status = getTripTemporalStatus(trip, todayId, recentReviewDays);
      const distance = status === TripTemporalStatus.Upcoming
        ? differenceInCalendarDays(trip.startDateStr, todayId)
        : status === TripTemporalStatus.Recent
          ? differenceInCalendarDays(todayId, getTripEndDate(trip))
          : status === TripTemporalStatus.Ongoing
            ? 0
            : Number.POSITIVE_INFINITY;
      return { trip, status, distance };
    })
    .filter(({ status }) => status !== TripTemporalStatus.Past)
    .sort((left, right) => (
      left.distance - right.distance
      || statusPriority[left.status] - statusPriority[right.status]
      || left.trip.startDateStr.localeCompare(right.trip.startDateStr)
      || left.trip.id.localeCompare(right.trip.id)
    ))[0]?.trip || null;
}

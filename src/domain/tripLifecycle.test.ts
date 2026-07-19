import { describe, expect, it } from 'vitest';
import { normalizeTripSnapshot } from './trip';
import {
  findNearestRelevantTrip,
  getTripTemporalStatus,
  TripTemporalStatus,
} from './tripLifecycle';

function trip(id: string, startDateStr: string, tripDays = 3, archived = false) {
  return normalizeTripSnapshot({
    id,
    name: id,
    startDateStr,
    tripDays,
    plans: [{ id: `${id}-plan`, name: id }],
    archived,
  });
}

describe('trip lifecycle selection', () => {
  it('classifies ongoing, upcoming, recent, and old trips', () => {
    expect(getTripTemporalStatus(trip('ongoing', '2026-07-19'), '2026-07-20')).toBe(TripTemporalStatus.Ongoing);
    expect(getTripTemporalStatus(trip('future', '2026-07-25'), '2026-07-20')).toBe(TripTemporalStatus.Upcoming);
    expect(getTripTemporalStatus(trip('recent', '2026-07-15'), '2026-07-20')).toBe(TripTemporalStatus.Recent);
    expect(getTripTemporalStatus(trip('old', '2026-07-01'), '2026-07-20')).toBe(TripTemporalStatus.Past);
  });

  it('keeps a trip available for review through the seventh day after it ends', () => {
    expect(getTripTemporalStatus(trip('recent', '2026-07-11'), '2026-07-20')).toBe(TripTemporalStatus.Recent);
    expect(getTripTemporalStatus(trip('old', '2026-07-10'), '2026-07-20')).toBe(TripTemporalStatus.Past);
  });

  it('selects the trip whose date range is nearest to today', () => {
    const trips = [
      trip('recent', '2026-07-16', 3),
      trip('future', '2026-07-25', 3),
    ];
    expect(findNearestRelevantTrip(trips, '2026-07-20')?.id).toBe('recent');
  });

  it('prefers an upcoming trip when past and future are equally close', () => {
    const trips = [
      trip('recent', '2026-07-16', 3),
      trip('future', '2026-07-22', 3),
    ];
    expect(findNearestRelevantTrip(trips, '2026-07-20')?.id).toBe('future');
  });

  it('returns no current trip when only old, archived, or empty trips remain', () => {
    expect(findNearestRelevantTrip([
      trip('old', '2026-07-01', 2),
      trip('archived', '2026-07-20', 2, true),
      normalizeTripSnapshot({ id: 'empty', startDateStr: '2026-07-21', plans: [] }),
    ], '2026-07-20')).toBeNull();
  });
});

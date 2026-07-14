import { describe, expect, it } from 'vitest';
import { DayReviewRating } from './dayReview';
import {
  clampTripDays,
  getStopOutcomeKey,
  getPlaceFeedbackKey,
  isStopAbandoned,
  isPlaceBlacklisted,
  hasUsefulLodgingInfo,
  isEmptyTripDraft,
  normalizeLodging,
  normalizeLodgingDrafts,
  normalizePlaceFeedback,
  normalizeSchedule,
  normalizeStopOutcomes,
  normalizeTripLodgings,
  normalizeTripSnapshot,
  pruneEmptyTripDrafts,
  stripChecklistFromTripSnapshot,
  PlaceFeedbackStatus,
  ScheduleEntryStatus,
  StopOutcomeStatus,
} from './trip';

describe('trip day normalization', () => {
  it('clamps trip days into the supported range', () => {
    expect(clampTripDays('0')).toBe(1);
    expect(clampTripDays('31')).toBe(30);
    expect(clampTripDays('oops', 7)).toBe(7);
  });
});

describe('lodging normalization', () => {
  it('normalizes hotel aliases and cleans external urls', () => {
    expect(normalizeLodging({
      hotel: 'DEL Style Osaka',
      full_address: 'Osaka Kita Ward',
      url: '[booking](https://example.com/hotel)',
      map_url: 'https://maps.google.com/?q=DEL',
    })).toMatchObject({
      id: 'lodging-1',
      name: 'DEL Style Osaka',
      location: {
        label: 'DEL Style Osaka',
        address: 'Osaka Kita Ward',
      },
      bookingUrl: 'https://example.com/hotel',
      mapUrl: 'https://maps.google.com/?q=DEL',
    });
  });

  it('filters empty lodging drafts before saving', () => {
    const lodgings = normalizeLodgingDrafts([
      { name: '', address: '' },
      { name: 'Hotel', address: 'Osaka', checkIn: '2026-07-10' },
    ], () => 'fixed-lodging-id');

    expect(lodgings).toHaveLength(1);
    expect(lodgings[0]).toMatchObject({
      id: 'fixed-lodging-id',
      name: 'Hotel',
      checkIn: '2026-07-10',
      order: 1,
    });
    expect(hasUsefulLodgingInfo(lodgings[0])).toBe(true);
    expect(normalizeTripLodgings({ name: 'Single Hotel' })).toHaveLength(1);
  });
});

describe('schedule normalization', () => {
  it('normalizes schedule strings and object entries', () => {
    expect(normalizeSchedule({
      '2026-07-10': 'plan-a',
      '2026-07-11': { id: 'plan-b', status: 'abandoned' },
      '2026-07-14': { id: 'plan-c', status: 'invalid' },
      '2026-07-12': {},
      '2026-07-13': null,
    })).toEqual({
      '2026-07-10': { planId: 'plan-a' },
      '2026-07-11': { planId: 'plan-b', status: ScheduleEntryStatus.Abandoned },
      '2026-07-14': { planId: 'plan-c' },
    });
  });
});

describe('place feedback normalization', () => {
  it('uses the address as a stable place key and preserves reversible status', () => {
    const location = { label: 'Museum', address: '  Osaka 1-2-3 ' };
    const key = getPlaceFeedbackKey(location);

    expect(key).toBe('osaka 1-2-3');
    expect(normalizePlaceFeedback({
      [key]: {
        label: 'Museum',
        address: 'Osaka 1-2-3',
        status: 'blacklisted',
        updated_at: '2026-07-12T10:00:00.000Z',
      },
      allowed: {
        label: 'Cafe',
        status: 'allowed',
      },
    })).toMatchObject({
      [key]: {
        status: PlaceFeedbackStatus.Blacklisted,
        updatedAt: '2026-07-12T10:00:00.000Z',
      },
      cafe: {
        status: PlaceFeedbackStatus.Allowed,
      },
    });
  });

  it('matches the same place by label when one plan has a fuller address', () => {
    const feedback = normalizePlaceFeedback({
      museum: { label: 'Museum', status: 'blacklisted' },
    });

    expect(isPlaceBlacklisted({ label: 'Museum', address: 'Osaka 1-2-3' }, feedback)).toBe(true);
  });
});

describe('stop outcome normalization', () => {
  it('keeps a skipped stop scoped to its date, plan and stop id', () => {
    const key = getStopOutcomeKey('2026-07-11', 'plan-1', 'stop-1');
    const outcomes = normalizeStopOutcomes({
      [key]: {
        date_id: '2026-07-11',
        plan_id: 'plan-1',
        stop_id: 'stop-1',
        stop_title: 'Museum',
        status: 'abandoned',
        updated_at: '2026-07-12T10:00:00.000Z',
      },
    });

    expect(outcomes[key]).toMatchObject({
      status: StopOutcomeStatus.Abandoned,
      stopTitle: 'Museum',
      updatedAt: '2026-07-12T10:00:00.000Z',
    });
    expect(isStopAbandoned('2026-07-11', 'plan-1', 'stop-1', outcomes)).toBe(true);
    expect(isStopAbandoned('2026-07-12', 'plan-1', 'stop-1', outcomes)).toBe(false);
  });
});

describe('trip snapshot normalization', () => {
  it('normalizes imported trip payloads into the current app shape', () => {
    const trip = normalizeTripSnapshot({
      title: '大阪',
      startDate: '2026-07-10',
      days: 2,
      plans: [{ name: 'Nara', available_dates: ['2026-07-11'] }],
      schedule: { '2026-07-11': 'plan-1' },
      hotels: [{ name: 'Hotel', address: 'Osaka' }],
      checklist: '# 证件\n护照',
      checklistStatus: { '证件::护照': 'done' },
      place_feedback: {
        museum: { label: 'Museum', status: 'blacklisted' },
      },
      stop_outcomes: {
        skipped: {
          date_id: '2026-07-11',
          plan_id: 'plan-1',
          stop_id: 'stop-1',
          status: 'abandoned',
        },
      },
      day_reviews: {
        review: {
          date_id: '2026-07-11',
          plan_id: 'plan-1',
          plan_name: 'Nara',
          rating: 'satisfied',
        },
      },
      weatherData: { stale: true },
    }, 0, { todayId: '2026-07-01' });

    expect(trip).toMatchObject({
      id: 'trip-1',
      name: '大阪',
      startDateStr: '2026-07-10',
      tripDays: 2,
      schedule: { '2026-07-11': { planId: 'plan-1' } },
      lodgings: [{ name: 'Hotel' }],
      checklistText: '# 证件\n护照',
      checklistState: { '证件::护照': 'done' },
      placeFeedback: {
        museum: { status: PlaceFeedbackStatus.Blacklisted },
      },
      stopOutcomes: {
        '2026-07-11:plan-1:stop-1': { status: StopOutcomeStatus.Abandoned },
      },
      dayReviews: {
        '2026-07-11:plan-1': { rating: DayReviewRating.Satisfied },
      },
      archived: false,
    });
    expect(trip.plans[0].available_dates).toEqual(['2026-07-11']);
    expect(trip).not.toHaveProperty('weatherData');
  });

  it('removes checklist and cache data when exporting trip-only snapshots', () => {
    expect(stripChecklistFromTripSnapshot({
      id: 'trip-1',
      checklistText: '# A',
      checklistState: {},
      checklist: '# Legacy',
      checklistStatus: {},
      packingList: '# Old',
      weatherData: { Osaka: {} },
      name: 'Trip',
    })).toEqual({
      id: 'trip-1',
      name: 'Trip',
    });
  });

  it('keeps only the active empty draft', () => {
    const trips = [
      { id: 'empty-1', plans: [], lodgings: [] },
      { id: 'empty-2', plans: [], lodgings: [] },
      { id: 'ready', plans: [{ id: 'p1' }], lodgings: [] },
    ];

    expect(isEmptyTripDraft(trips[0])).toBe(true);
    expect(pruneEmptyTripDrafts(trips, 'empty-2').map((trip) => trip.id))
      .toEqual(['empty-2', 'ready']);
  });
});

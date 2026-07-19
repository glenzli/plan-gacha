import { describe, expect, it } from 'vitest';
import { getWeatherFetchDateIds, mergeWeatherCacheEntry } from './weatherService';

const tripDates = [
  { id: '2026-07-18' },
  { id: '2026-07-19' },
  { id: '2026-07-20' },
  { id: '2026-07-21' },
];

describe('weather cache date policy', () => {
  it('keeps cached past days even during a forced refresh', () => {
    const entry = {
      fetchedAt: '2026-07-01T00:00:00.000Z',
      dailyByDate: {
        '2026-07-18': { dateId: '2026-07-18', tempMin: 20 },
        '2026-07-19': { dateId: '2026-07-19', tempMin: 21 },
      },
    };

    expect(getWeatherFetchDateIds(entry, tripDates, true, '2026-07-20'))
      .toEqual(['2026-07-20', '2026-07-21']);
  });

  it('requests a missing historical day once while retaining existing history', () => {
    const entry = {
      fetchedAt: new Date().toISOString(),
      dailyByDate: {
        '2026-07-18': { dateId: '2026-07-18', tempMin: 20 },
        '2026-07-20': { dateId: '2026-07-20', tempMin: 22 },
        '2026-07-21': { dateId: '2026-07-21', tempMin: 23 },
      },
    };

    expect(getWeatherFetchDateIds(entry, tripDates, false, '2026-07-20'))
      .toEqual(['2026-07-19']);
  });

  it('does not overwrite historical values when fetched ranges overlap them', () => {
    const merged = mergeWeatherCacheEntry({
      dailyByDate: {
        '2026-07-19': { dateId: '2026-07-19', tempMin: 21 },
      },
    }, {
      fetchedAt: '2026-07-20T10:00:00.000Z',
      dailyByDate: {
        '2026-07-19': { dateId: '2026-07-19', tempMin: 99 },
        '2026-07-20': { dateId: '2026-07-20', tempMin: 22 },
      },
    }, tripDates, '2026-07-20');

    expect(merged.dailyByDate['2026-07-19'].tempMin).toBe(21);
    expect(merged.dailyByDate['2026-07-20'].tempMin).toBe(22);
  });
});

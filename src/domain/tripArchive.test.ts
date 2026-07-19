import { describe, expect, it } from 'vitest';
import {
  createTripArchiveSummary,
  getTripExpenseTotal,
  normalizeTripArchiveSummary,
  TripExpenseCategory,
} from './tripArchive';

describe('trip archive summary', () => {
  it('normalizes categorized expenses and calculates the total', () => {
    const summary = createTripArchiveSummary({
      currency: 'jpy',
      expenses: {
        [TripExpenseCategory.Airfare]: '12000',
        [TripExpenseCategory.Food]: 8000,
        [TripExpenseCategory.Other]: -1,
      },
      note: '  Worth revisiting  ',
    }, '2026-07-20T10:00:00.000Z');

    expect(summary).toMatchObject({
      currency: 'JPY',
      note: 'Worth revisiting',
      archivedAt: '2026-07-20T10:00:00.000Z',
    });
    expect(getTripExpenseTotal(summary)).toBe(20000);
  });

  it('keeps the optional summary absent when no object was stored', () => {
    expect(normalizeTripArchiveSummary(undefined)).toBeNull();
  });
});

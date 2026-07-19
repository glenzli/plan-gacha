import { describe, expect, it } from 'vitest';
import { getSmartSelectedDate } from './display';

describe('smart selected trip date', () => {
  it('selects the first day before departure', () => {
    expect(getSmartSelectedDate('2026-07-10', 5, '2026-07-01')).toBe('2026-07-10');
  });

  it('selects today during the trip', () => {
    expect(getSmartSelectedDate('2026-07-10', 5, '2026-07-12')).toBe('2026-07-12');
  });

  it('selects the final day after the trip', () => {
    expect(getSmartSelectedDate('2026-07-10', 5, '2026-07-20')).toBe('2026-07-14');
  });
});

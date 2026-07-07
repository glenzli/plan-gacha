import { describe, expect, it } from 'vitest';
import { addDays, formatDateId, parseDateId } from './date';

describe('date id helpers', () => {
  it('formats and parses local date ids', () => {
    const date = parseDateId('2026-07-10');
    expect(formatDateId(date)).toBe('2026-07-10');
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31');
  });
});

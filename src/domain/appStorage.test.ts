import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_SCHEMA_VERSION } from './sync';
import { loadInitialState, STORAGE_KEYS } from './appStorage';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

function storedTrip(id: string, startDateStr: string, tripDays: number) {
  return {
    id,
    name: id,
    startDateStr,
    tripDays,
    plans: [{ id: `${id}-plan`, name: id }],
  };
}

describe('initial trip selection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T10:00:00+08:00'));
    vi.stubGlobal('localStorage', new MemoryStorage());
    localStorage.setItem(STORAGE_KEYS.schemaVersion, APP_SCHEMA_VERSION);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens the nearest relevant trip and ignores the previously selected id', () => {
    localStorage.setItem(STORAGE_KEYS.currentTrip, 'old');
    localStorage.setItem(STORAGE_KEYS.trips, JSON.stringify([
      storedTrip('old', '2026-06-01', 3),
      storedTrip('recent', '2026-07-16', 3),
      storedTrip('future', '2026-07-25', 3),
    ]));

    const initial = loadInitialState();

    expect(initial.activeTripId).toBe('recent');
    expect(initial.selectedDate).toBe('2026-07-18');
  });

  it('has no current trip when every unarchived trip is outside the review window', () => {
    localStorage.setItem(STORAGE_KEYS.trips, JSON.stringify([
      storedTrip('old', '2026-06-01', 3),
    ]));

    const initial = loadInitialState();

    expect(initial.activeTripId).toBe('');
    expect(initial.plans).toEqual([]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAP_PREFERENCES,
  MAP_PREFERENCES_STORAGE_KEY,
  loadMapPreferences,
  normalizeMapPreferences,
  saveMapPreferences,
} from './mapPreferences';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('map preferences', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('defaults mainland China to AMap and every other region to Google', () => {
    expect(loadMapPreferences()).toEqual(DEFAULT_MAP_PREFERENCES);
  });

  it('reads back local choices and ignores invalid saved providers', () => {
    expect(saveMapPreferences({ mainlandChina: 'google', otherRegions: 'amap', unknown: 'google' })).toBe(true);
    expect(loadMapPreferences()).toEqual({ mainlandChina: 'google', otherRegions: 'amap', unknown: 'google' });
    localStorage.setItem(MAP_PREFERENCES_STORAGE_KEY, JSON.stringify({ mainlandChina: 'bad', otherRegions: 'amap' }));
    expect(loadMapPreferences()).toEqual({ mainlandChina: 'amap', otherRegions: 'amap', unknown: 'google' });
    expect(normalizeMapPreferences(null)).toEqual(DEFAULT_MAP_PREFERENCES);
  });

  it('allows the recommended combination only for mainland China', () => {
    expect(saveMapPreferences({ mainlandChina: 'recommended', otherRegions: 'google', unknown: 'google' })).toBe(true);
    expect(loadMapPreferences().mainlandChina).toBe('recommended');
    localStorage.setItem(MAP_PREFERENCES_STORAGE_KEY, JSON.stringify({ mainlandChina: 'recommended', otherRegions: 'recommended', unknown: 'recommended' }));
    expect(loadMapPreferences()).toEqual({ mainlandChina: 'recommended', otherRegions: 'google', unknown: 'google' });
  });

  it('recovers from malformed stored data', () => {
    localStorage.setItem(MAP_PREFERENCES_STORAGE_KEY, '{bad json');
    expect(loadMapPreferences()).toEqual(DEFAULT_MAP_PREFERENCES);
  });
});

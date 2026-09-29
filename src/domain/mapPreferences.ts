export type MapProvider = 'google' | 'amap' | 'baidu';
export type MapRegion = 'mainlandChina' | 'otherRegions' | 'unknown';

export interface MapPreferences {
  mainlandChina: 'amap' | 'baidu';
  otherRegions: 'google';
  unknown: 'google';
}

export const MAP_PREFERENCES_STORAGE_KEY = 'pg_mapPreferences';

export const DEFAULT_MAP_PREFERENCES: MapPreferences = {
  mainlandChina: 'amap',
  otherRegions: 'google',
  unknown: 'google',
};

export function normalizeMapPreferences(value: unknown): MapPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_MAP_PREFERENCES };
  const saved = value as Partial<Record<MapRegion, unknown>>;
  return {
    mainlandChina: saved.mainlandChina === 'baidu' ? 'baidu' : DEFAULT_MAP_PREFERENCES.mainlandChina,
    otherRegions: 'google',
    unknown: 'google',
  };
}

export function loadMapPreferences(): MapPreferences {
  try {
    return normalizeMapPreferences(JSON.parse(localStorage.getItem(MAP_PREFERENCES_STORAGE_KEY) || 'null'));
  } catch {
    return { ...DEFAULT_MAP_PREFERENCES };
  }
}

export function saveMapPreferences(value: MapPreferences): boolean {
  try {
    localStorage.setItem(MAP_PREFERENCES_STORAGE_KEY, JSON.stringify(normalizeMapPreferences(value)));
    return true;
  } catch {
    return false;
  }
}

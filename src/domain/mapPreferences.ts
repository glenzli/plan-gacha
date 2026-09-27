export type MapProvider = 'google' | 'amap' | 'recommended';
export type MapRegion = 'mainlandChina' | 'otherRegions' | 'unknown';

export interface MapPreferences {
  mainlandChina: MapProvider;
  otherRegions: MapProvider;
  unknown: MapProvider;
}

export const MAP_PREFERENCES_STORAGE_KEY = 'pg_mapPreferences';

export const DEFAULT_MAP_PREFERENCES: MapPreferences = {
  mainlandChina: 'amap',
  otherRegions: 'google',
  unknown: 'google',
};

function isMapProvider(value: unknown): value is MapProvider {
  return value === 'google' || value === 'amap' || value === 'recommended';
}

export function normalizeMapPreferences(value: unknown): MapPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_MAP_PREFERENCES };
  const saved = value as Partial<Record<MapRegion, unknown>>;
  return {
    mainlandChina: isMapProvider(saved.mainlandChina) ? saved.mainlandChina : DEFAULT_MAP_PREFERENCES.mainlandChina,
    otherRegions: isMapProvider(saved.otherRegions) && saved.otherRegions !== 'recommended' ? saved.otherRegions : DEFAULT_MAP_PREFERENCES.otherRegions,
    unknown: isMapProvider(saved.unknown) && saved.unknown !== 'recommended' ? saved.unknown : DEFAULT_MAP_PREFERENCES.unknown,
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

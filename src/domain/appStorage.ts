import {
  isCompatibleAppSchemaVersion,
} from './sync';
import {
  createEmptyTripSnapshot,
} from './exampleData';
import {
  isUntouchedExampleChecklist,
  normalizeChecklistText,
  parseChecklistText,
  reconcileChecklistStateForGroups,
} from './checklist';
import {
  normalizeTripSnapshot,
  pruneEmptyTripDrafts,
  type NormalizedTripSnapshot,
} from './trip';
import {
  DEFAULT_LANGUAGE,
  getSmartSelectedDate,
} from './display';
import { getTodayId } from './date';
import { findNearestRelevantTrip } from './tripLifecycle';
import type { WeatherDataMap } from '../types/weatherData';

export const STORAGE_KEYS = {
  schemaVersion: 'pg_schemaVersion',
  trips: 'pg_trips',
  currentTrip: 'pg_currentTripId',
  checklistText: 'pg_checklistText',
  checklistState: 'pg_checklistState',
  weatherCache: 'pg_weatherCache',
  driveAutoSync: 'pg_driveAutoSync',
};

export interface InitialAppState {
  trips: NormalizedTripSnapshot[];
  activeTripId: string;
  tripName: string;
  startDate: string;
  tripDays: number;
  plans: NormalizedTripSnapshot['plans'];
  schedule: NormalizedTripSnapshot['schedule'];
  lodgings: NormalizedTripSnapshot['lodgings'];
  placeFeedback: NormalizedTripSnapshot['placeFeedback'];
  stopOutcomes: NormalizedTripSnapshot['stopOutcomes'];
  dayReviews: NormalizedTripSnapshot['dayReviews'];
  archiveSummary: NormalizedTripSnapshot['archiveSummary'];
  selectedDate: string;
  weatherData: WeatherDataMap;
  checklistText: string;
  checklistState: NormalizedTripSnapshot['checklistState'];
}

export function safeJsonRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function loadInitialState(): InitialAppState {
  const currentVersion = localStorage.getItem(STORAGE_KEYS.schemaVersion);
  const storedTrips = safeJsonRead<unknown>(STORAGE_KEYS.trips, null);
  const loadedTrips = isCompatibleAppSchemaVersion(currentVersion) && Array.isArray(storedTrips) && storedTrips.length > 0
    ? storedTrips.map((trip, index) => normalizeTripSnapshot(trip, index))
    : [];

  const trips = pruneEmptyTripDrafts(loadedTrips);
  const nearestTrip = findNearestRelevantTrip(trips, getTodayId());
  const activeTrip = nearestTrip || normalizeTripSnapshot(
    createEmptyTripSnapshot('新旅行计划', getTodayId(), 'trip-current-stage-empty'),
  );
  const storedChecklistText = localStorage.getItem(STORAGE_KEYS.checklistText);
  const storedChecklistState = safeJsonRead<unknown>(STORAGE_KEYS.checklistState, null);
  const storedWeatherCache = safeJsonRead<WeatherDataMap>(STORAGE_KEYS.weatherCache, {});
  const loadedChecklistText = storedChecklistText ?? activeTrip.checklistText;
  const loadedChecklistState = storedChecklistState ?? activeTrip.checklistState;
  const nextChecklistText = isUntouchedExampleChecklist(loadedChecklistText, loadedChecklistState)
    ? ''
    : normalizeChecklistText(loadedChecklistText);
  const nextChecklistGroups = parseChecklistText(nextChecklistText, DEFAULT_LANGUAGE);
  const nextChecklistState = reconcileChecklistStateForGroups(
    loadedChecklistState,
    nextChecklistGroups,
  );

  return {
    trips,
    activeTripId: nearestTrip?.id || '',
    tripName: activeTrip.name,
    startDate: activeTrip.startDateStr,
    tripDays: activeTrip.tripDays,
    plans: activeTrip.plans,
    schedule: activeTrip.schedule,
    lodgings: activeTrip.lodgings || [],
    placeFeedback: activeTrip.placeFeedback || {},
    stopOutcomes: activeTrip.stopOutcomes || {},
    dayReviews: activeTrip.dayReviews || {},
    archiveSummary: activeTrip.archiveSummary,
    selectedDate: getSmartSelectedDate(activeTrip.startDateStr, activeTrip.tripDays),
    weatherData: storedWeatherCache && typeof storedWeatherCache === 'object' && !Array.isArray(storedWeatherCache)
      ? storedWeatherCache
      : {},
    checklistText: nextChecklistText,
    checklistState: nextChecklistState,
  };
}

export function parseImportJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1].trim() : trimmed);
}

export function getSinglePlanPayload(parsed: any) {
  if (Array.isArray(parsed?.plans)) return parsed.plans[0] || null;
  if (parsed?.plan && typeof parsed.plan === 'object' && !Array.isArray(parsed.plan)) return parsed.plan;
  return parsed;
}

export async function readImportFileText(file: File | null | undefined) {
  if (!file) return '';
  return file.text();
}

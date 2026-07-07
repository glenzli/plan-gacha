// @ts-nocheck
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
} from './trip';
import {
  DEFAULT_LANGUAGE,
  getSmartSelectedDate,
} from './display';
import { getTodayId } from './date';

export const STORAGE_KEYS = {
  schemaVersion: 'pg_schemaVersion',
  trips: 'pg_trips',
  currentTrip: 'pg_currentTripId',
  checklistText: 'pg_checklistText',
  checklistState: 'pg_checklistState',
  weatherCache: 'pg_weatherCache',
  driveAutoSync: 'pg_driveAutoSync',
};

export function safeJsonRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function loadInitialState() {
  const currentVersion = localStorage.getItem(STORAGE_KEYS.schemaVersion);
  const storedTrips = safeJsonRead(STORAGE_KEYS.trips, null);
  const loadedTrips = isCompatibleAppSchemaVersion(currentVersion) && Array.isArray(storedTrips) && storedTrips.length > 0
    ? storedTrips.map(normalizeTripSnapshot)
    : [createEmptyTripSnapshot('新旅行计划', getTodayId(), 'trip-default')];

  const requestedActiveTripId = localStorage.getItem(STORAGE_KEYS.currentTrip) || loadedTrips[0].id;
  const visibleLoadedTrips = loadedTrips.filter((trip) => !trip.archived);
  const loadedActiveTrip = visibleLoadedTrips.find((trip) => trip.id === requestedActiveTripId) || visibleLoadedTrips[0] || loadedTrips[0];
  const trips = pruneEmptyTripDrafts(loadedTrips, loadedActiveTrip.id);
  const visibleTrips = trips.filter((trip) => !trip.archived);
  const activeTrip = visibleTrips.find((trip) => trip.id === loadedActiveTrip.id) || visibleTrips[0] || trips[0];
  const storedChecklistText = localStorage.getItem(STORAGE_KEYS.checklistText);
  const storedChecklistState = safeJsonRead(STORAGE_KEYS.checklistState, null);
  const storedWeatherCache = safeJsonRead(STORAGE_KEYS.weatherCache, {});
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
    activeTripId: activeTrip.id,
    tripName: activeTrip.name,
    startDate: activeTrip.startDateStr,
    tripDays: activeTrip.tripDays,
    plans: activeTrip.plans,
    schedule: activeTrip.schedule,
    lodgings: activeTrip.lodgings || [],
    selectedDate: getSmartSelectedDate(activeTrip.startDateStr, activeTrip.tripDays),
    weatherData: storedWeatherCache && typeof storedWeatherCache === 'object' && !Array.isArray(storedWeatherCache)
      ? storedWeatherCache
      : {},
    checklistText: nextChecklistText,
    checklistState: nextChecklistState,
  };
}

export function parseImportJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1].trim() : trimmed);
}

export function getSinglePlanPayload(parsed) {
  if (Array.isArray(parsed?.plans)) return parsed.plans[0] || null;
  if (parsed?.plan && typeof parsed.plan === 'object' && !Array.isArray(parsed.plan)) return parsed.plan;
  return parsed;
}

export async function readImportFileText(file) {
  if (!file) return '';
  return file.text();
}

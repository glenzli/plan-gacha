import {
  normalizeChecklistText,
  mergeChecklistPayload,
  parseChecklistText,
  reconcileChecklistStateForGroups,
} from './checklist';
import { addDays } from './date';
import { normalizeDayReviews } from './dayReview';
import { normalizePlan, type TripDateLike } from './plan';
import {
  normalizePlaceFeedback,
  normalizeSchedule,
  normalizeStopOutcomes,
  normalizeTripSnapshot,
  pruneEmptyTripDrafts,
  stripChecklistFromTripSnapshot,
} from './trip';

export const APP_SCHEMA_VERSION = '1.0';
export const COMPATIBLE_APP_SCHEMA_VERSIONS = new Set([APP_SCHEMA_VERSION, '13']);

type AnyRecord = Record<string, any>;
type Language = 'zh' | 'en' | string;

export interface AppSnapshot {
  appSchemaVersion: string;
  snapshotVersion: number;
  activeTripId: string;
  trips: AnyRecord[];
  checklistText: string;
  checklistState: AnyRecord;
}

export interface SyncMergeError extends Error {
  code: string;
  details: AnyRecord;
}

function createTripDateIds(startDateStr: string, tripDays: number): TripDateLike[] {
  if (!startDateStr || tripDays < 1) return [];
  return Array.from({ length: tripDays }, (_, index) => ({ id: addDays(startDateStr, index) }));
}

export function normalizeJsonValue(value: any, seen = new WeakSet<object>()): any {
  if (value === null) return null;

  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'boolean') return value;
  if (valueType === 'number') return Number.isFinite(value) ? value : null;
  if (valueType === 'bigint') throw new Error('JSON payload cannot contain BigInt values.');
  if (valueType === 'undefined' || valueType === 'function' || valueType === 'symbol') return undefined;

  if (typeof value.toJSON === 'function') {
    return normalizeJsonValue(value.toJSON(), seen);
  }

  if (seen.has(value)) throw new Error('JSON payload cannot contain circular references.');

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => {
        const normalized = normalizeJsonValue(item, seen);
        return normalized === undefined ? null : normalized;
      });
    }

    const normalizedObject: AnyRecord = {};
    for (const key of Object.keys(value).sort()) {
      const normalizedProperty = normalizeJsonValue(value[key], seen);
      if (normalizedProperty !== undefined) normalizedObject[key] = normalizedProperty;
    }
    return normalizedObject;
  } finally {
    seen.delete(value);
  }
}

export function stableJsonStringify(value: any) {
  const normalized = normalizeJsonValue(value);
  return normalized === undefined ? '' : JSON.stringify(normalized);
}

export function jsonEqual(a: any, b: any) {
  return stableJsonStringify(a) === stableJsonStringify(b);
}

export function normalizeSnapshotForSyncCompare(snapshot: any) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return snapshot;
  const comparable = { ...snapshot };
  delete comparable.updatedAt;
  if (Array.isArray(comparable.trips)) {
    comparable.trips = comparable.trips.map(stripChecklistFromTripSnapshot);
  }
  return comparable;
}

export function remoteSnapshotMatchesLocal(remotePayload: any, localSnapshot: any) {
  return jsonEqual(
    normalizeSnapshotForSyncCompare(remotePayload),
    normalizeSnapshotForSyncCompare(localSnapshot),
  );
}

export function createSyncMergeError(code: string, details: AnyRecord = {}): SyncMergeError {
  const error = new Error(code) as SyncMergeError;
  error.code = code;
  error.details = details;
  return error;
}

function normalizeSchemaVersion(value: unknown) {
  return String(value ?? '').trim();
}

export function isCompatibleAppSchemaVersion(value: unknown) {
  return COMPATIBLE_APP_SCHEMA_VERSIONS.has(normalizeSchemaVersion(value));
}

function getSnapshotSchemaVersion(snapshot: any) {
  return snapshot?.appSchemaVersion ?? snapshot?.schemaVersion ?? '';
}

export function normalizeAppSnapshotForSync(snapshot: any, language: Language = 'zh', source = 'remote') {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || !Array.isArray(snapshot.trips)) {
    throw createSyncMergeError('merge_invalid_snapshot', { source });
  }

  const version = getSnapshotSchemaVersion(snapshot);
  if (!isCompatibleAppSchemaVersion(version)) {
    throw createSyncMergeError('merge_schema_mismatch', { source, version: version || 'missing' });
  }

  const trips = snapshot.trips.map((trip: any, index: number) => {
    const normalizedTrip = normalizeTripSnapshot(trip, index);
    const tripDates = createTripDateIds(normalizedTrip.startDateStr, normalizedTrip.tripDays);
    return stripChecklistFromTripSnapshot({
      ...normalizedTrip,
      plans: Array.isArray(normalizedTrip.plans)
        ? normalizedTrip.plans.map((plan, planIndex) => normalizePlan(plan, planIndex, tripDates))
        : [],
      schedule: normalizeSchedule(normalizedTrip.schedule),
    });
  });

  if (!trips.length) throw createSyncMergeError('merge_invalid_snapshot', { source });

  const activeTripId = trips.some((trip: any) => trip.id === snapshot.activeTripId)
    ? snapshot.activeTripId
    : trips.find((trip: any) => !trip.archived)?.id || trips[0].id;
  const checklistText = normalizeChecklistText(snapshot.checklistText ?? snapshot.checklist ?? snapshot.packingList, '');
  const checklistGroups = parseChecklistText(checklistText, language);

  return {
    appSchemaVersion: APP_SCHEMA_VERSION,
    snapshotVersion: 1,
    activeTripId,
    trips: pruneEmptyTripDrafts(trips, activeTripId).map(stripChecklistFromTripSnapshot),
    checklistText,
    checklistState: reconcileChecklistStateForGroups(snapshot.checklistState || snapshot.checklistStatus || {}, checklistGroups),
  };
}

function mergeScalarValue(localValue: any, remoteValue: any, path: string) {
  if (jsonEqual(localValue, remoteValue)) return localValue;
  if (localValue === undefined || localValue === null || localValue === '') return remoteValue;
  if (remoteValue === undefined || remoteValue === null || remoteValue === '') return localValue;
  throw createSyncMergeError('merge_data_conflict', { path });
}

function mergeScheduleForSync(localSchedule: any, remoteSchedule: any, path: string) {
  const result = { ...remoteSchedule };
  Object.entries(localSchedule || {}).forEach(([dateId, localEntry]) => {
    const remoteEntry = result[dateId];
    if (!remoteEntry) {
      result[dateId] = localEntry;
      return;
    }
    if (!jsonEqual(localEntry, remoteEntry)) {
      throw createSyncMergeError('merge_data_conflict', { path: `${path}.schedule.${dateId}` });
    }
  });
  return normalizeSchedule(result);
}

function mergePlaceFeedbackForSync(localFeedback: any, remoteFeedback: any, path: string) {
  const local = normalizePlaceFeedback(localFeedback);
  const remote = normalizePlaceFeedback(remoteFeedback);
  const result = { ...remote };

  Object.entries(local).forEach(([key, localEntry]) => {
    const remoteEntry = result[key];
    if (!remoteEntry) {
      result[key] = localEntry;
      return;
    }
    if (jsonEqual(localEntry, remoteEntry)) return;

    const localTime = Date.parse(localEntry.updatedAt);
    const remoteTime = Date.parse(remoteEntry.updatedAt);
    if (Number.isFinite(localTime) && Number.isFinite(remoteTime) && localTime !== remoteTime) {
      result[key] = localTime > remoteTime ? localEntry : remoteEntry;
      return;
    }

    throw createSyncMergeError('merge_data_conflict', { path: `${path}.placeFeedback.${key}` });
  });

  return normalizePlaceFeedback(result);
}

function mergeStopOutcomesForSync(localOutcomes: any, remoteOutcomes: any, path: string) {
  const local = normalizeStopOutcomes(localOutcomes);
  const remote = normalizeStopOutcomes(remoteOutcomes);
  const result = { ...remote };

  Object.entries(local).forEach(([key, localEntry]) => {
    const remoteEntry = result[key];
    if (!remoteEntry) {
      result[key] = localEntry;
      return;
    }
    if (jsonEqual(localEntry, remoteEntry)) return;

    const localTime = Date.parse(localEntry.updatedAt);
    const remoteTime = Date.parse(remoteEntry.updatedAt);
    if (Number.isFinite(localTime) && Number.isFinite(remoteTime) && localTime !== remoteTime) {
      result[key] = localTime > remoteTime ? localEntry : remoteEntry;
      return;
    }

    throw createSyncMergeError('merge_data_conflict', { path: `${path}.stopOutcomes.${key}` });
  });

  return normalizeStopOutcomes(result);
}

function mergeDayReviewsForSync(localReviews: any, remoteReviews: any, path: string) {
  const local = normalizeDayReviews(localReviews);
  const remote = normalizeDayReviews(remoteReviews);
  const result = { ...remote };

  Object.entries(local).forEach(([key, localEntry]) => {
    const remoteEntry = result[key];
    if (!remoteEntry) {
      result[key] = localEntry;
      return;
    }
    if (jsonEqual(localEntry, remoteEntry)) return;

    const localTime = Date.parse(localEntry.updatedAt);
    const remoteTime = Date.parse(remoteEntry.updatedAt);
    if (Number.isFinite(localTime) && Number.isFinite(remoteTime) && localTime !== remoteTime) {
      result[key] = localTime > remoteTime ? localEntry : remoteEntry;
      return;
    }

    throw createSyncMergeError('merge_data_conflict', { path: `${path}.dayReviews.${key}` });
  });

  return normalizeDayReviews(result);
}

function mergePlansForSync(localPlans: any[], remotePlans: any[], path: string) {
  const result: any[] = [];
  const localById = new Map((localPlans || []).map((plan) => [plan.id, plan]));
  const remoteById = new Map((remotePlans || []).map((plan) => [plan.id, plan]));
  const ids = [...new Set([...remoteById.keys(), ...localById.keys()])];

  ids.forEach((id) => {
    const localPlan = localById.get(id);
    const remotePlan = remoteById.get(id);
    if (!localPlan) {
      result.push(remotePlan);
      return;
    }
    if (!remotePlan) {
      result.push(localPlan);
      return;
    }
    if (!jsonEqual(localPlan, remotePlan)) {
      throw createSyncMergeError('merge_data_conflict', { path: `${path}.plans.${id}` });
    }
    result.push(localPlan);
  });

  return result;
}

function mergeLodgingsForSync(localLodgings: any[], remoteLodgings: any[], path: string) {
  const result: any[] = [];
  const localById = new Map((localLodgings || []).map((lodging) => [lodging.id, lodging]));
  const remoteById = new Map((remoteLodgings || []).map((lodging) => [lodging.id, lodging]));
  const ids = [...new Set([...remoteById.keys(), ...localById.keys()])];

  ids.forEach((id) => {
    const localLodging = localById.get(id);
    const remoteLodging = remoteById.get(id);
    if (!localLodging) {
      result.push(remoteLodging);
      return;
    }
    if (!remoteLodging) {
      result.push(localLodging);
      return;
    }
    if (!jsonEqual(localLodging, remoteLodging)) {
      throw createSyncMergeError('merge_data_conflict', { path: `${path}.lodgings.${id}` });
    }
    result.push(localLodging);
  });

  return result;
}

function mergeTripForSync(localTrip: any, remoteTrip: any) {
  if (jsonEqual(localTrip, remoteTrip)) return localTrip;
  const path = `trips.${localTrip.id}`;

  return {
    id: localTrip.id,
    name: mergeScalarValue(localTrip.name, remoteTrip.name, `${path}.name`),
    startDateStr: mergeScalarValue(localTrip.startDateStr, remoteTrip.startDateStr, `${path}.startDateStr`),
    tripDays: mergeScalarValue(localTrip.tripDays, remoteTrip.tripDays, `${path}.tripDays`),
    plans: mergePlansForSync(localTrip.plans, remoteTrip.plans, path),
    schedule: mergeScheduleForSync(localTrip.schedule, remoteTrip.schedule, path),
    lodgings: mergeLodgingsForSync(localTrip.lodgings, remoteTrip.lodgings, path),
    placeFeedback: mergePlaceFeedbackForSync(localTrip.placeFeedback, remoteTrip.placeFeedback, path),
    stopOutcomes: mergeStopOutcomesForSync(localTrip.stopOutcomes, remoteTrip.stopOutcomes, path),
    dayReviews: mergeDayReviewsForSync(localTrip.dayReviews, remoteTrip.dayReviews, path),
    archived: mergeScalarValue(localTrip.archived, remoteTrip.archived, `${path}.archived`),
  };
}

function mergeTripsForSync(localTrips: any[], remoteTrips: any[]) {
  const result: any[] = [];
  const localById = new Map(localTrips.map((trip) => [trip.id, trip]));
  const remoteById = new Map(remoteTrips.map((trip) => [trip.id, trip]));
  const ids = [...new Set([...remoteById.keys(), ...localById.keys()])];

  ids.forEach((id) => {
    const localTrip = localById.get(id);
    const remoteTrip = remoteById.get(id);
    if (!localTrip) {
      result.push(remoteTrip);
      return;
    }
    if (!remoteTrip) {
      result.push(localTrip);
      return;
    }
    result.push(mergeTripForSync(localTrip, remoteTrip));
  });

  return result;
}

export function mergeAppSnapshots(localSnapshot: any, remoteSnapshot: any, language: Language = 'zh') {
  const local = normalizeAppSnapshotForSync(localSnapshot, language, 'local');
  const remote = normalizeAppSnapshotForSync(remoteSnapshot, language, 'remote');

  if (jsonEqual(local, remote)) return local;

  const trips = mergeTripsForSync(local.trips, remote.trips);
  const activeTripId = trips.some((trip) => trip.id === local.activeTripId)
    ? local.activeTripId
    : trips.some((trip) => trip.id === remote.activeTripId)
      ? remote.activeTripId
      : trips.find((trip) => !trip.archived)?.id || trips[0]?.id;
  const checklist = mergeChecklistPayload(
    local.checklistText,
    local.checklistState,
    remote.checklistText,
    remote.checklistState,
    language,
  );

  if (checklist.conflicts.length) {
    throw createSyncMergeError('merge_data_conflict', { path: 'checklist' });
  }

  return normalizeAppSnapshotForSync({
    appSchemaVersion: APP_SCHEMA_VERSION,
    snapshotVersion: 1,
    activeTripId,
    trips,
    checklistText: checklist.checklistText,
    checklistState: checklist.checklistState,
  }, language, 'merged');
}

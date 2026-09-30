import {
  normalizePlan,
  type NormalizedPlan,
  type TripDateLike,
} from './plan';
import {
  normalizeChecklistState,
  normalizeChecklistText,
  type ChecklistState,
} from './checklist';
import { addDays, getTodayId } from './date';
import {
  normalizeDayReviews,
  type NormalizedDayReviews,
} from './dayReview';
import {
  normalizeTripArchiveSummary,
  type TripArchiveSummary,
} from './tripArchive';

const DEFAULT_TRIP_DAYS = 5;
const MAX_TRIP_DAYS = 30;

type AnyRecord = Record<string, any>;

import { normalizeTripLodgings, type NormalizedLodging } from './lodging';
export { normalizeLodging, normalizeTripLodgings, normalizeLodgingDrafts, hasUsefulLodgingInfo, type NormalizedLodging } from './lodging';

export enum ScheduleEntryStatus {
  Abandoned = 'abandoned',
}

export interface NormalizedScheduleEntry {
  planId: string;
  status?: ScheduleEntryStatus;
  lodgingId?: string;
  lodgingLocked?: boolean;
}

export type NormalizedSchedule = Record<string, NormalizedScheduleEntry>;

export enum PlaceFeedbackStatus {
  Allowed = 'allowed',
  Blacklisted = 'blacklisted',
}

export interface NormalizedPlaceFeedbackEntry {
  key: string;
  label: string;
  address: string;
  status: PlaceFeedbackStatus;
  updatedAt: string;
}

export type NormalizedPlaceFeedback = Record<string, NormalizedPlaceFeedbackEntry>;

export enum StopOutcomeStatus {
  Active = 'active',
  Abandoned = 'abandoned',
}

export interface NormalizedStopOutcomeEntry {
  key: string;
  dateId: string;
  planId: string;
  stopId: string;
  stopTitle: string;
  status: StopOutcomeStatus;
  updatedAt: string;
}

export type NormalizedStopOutcomes = Record<string, NormalizedStopOutcomeEntry>;

export interface NormalizedTripSnapshot {
  id: string;
  name: string;
  startDateStr: string;
  tripDays: number;
  plans: NormalizedPlan[];
  schedule: NormalizedSchedule;
  lodgings: NormalizedLodging[];
  placeFeedback: NormalizedPlaceFeedback;
  stopOutcomes: NormalizedStopOutcomes;
  dayReviews: NormalizedDayReviews;
  archiveSummary: TripArchiveSummary | null;
  checklistText: string;
  checklistState: ChecklistState;
  archived: boolean;
}

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function createTripDateIds(startDateStr: string, tripDays: number): TripDateLike[] {
  if (!startDateStr || tripDays < 1) return [];
  return Array.from({ length: tripDays }, (_, index) => ({ id: addDays(startDateStr, index) }));
}

export function clampTripDays(value: unknown, fallback = DEFAULT_TRIP_DAYS) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), MAX_TRIP_DAYS);
}

export function normalizeSchedule(schedule: unknown): NormalizedSchedule {
  if (!isRecord(schedule)) return {};

  return Object.fromEntries(
    Object.entries(schedule)
      .filter(([, value]) => Boolean(value))
      .map(([dateId, value]) => {
        if (typeof value === 'string') return [dateId, { planId: value }];
        if (!isRecord(value)) return [dateId, { planId: '' }];
        const status = value.status === ScheduleEntryStatus.Abandoned
          ? ScheduleEntryStatus.Abandoned
          : undefined;
        return [dateId, {
          planId: String(value.planId || value.plan_id || value.id || ''),
          ...((value.lodgingId || value.lodging_id) ? { lodgingId: String(value.lodgingId || value.lodging_id) } : {}),
          ...((value.lodgingLocked || value.lodging_locked) ? { lodgingLocked: true } : {}),
          ...(status ? { status } : {}),
        }];
      })
      .filter(([, value]) => Boolean((value as NormalizedScheduleEntry).planId || (value as NormalizedScheduleEntry).lodgingId)),
  ) as NormalizedSchedule;
}

function normalizePlaceFeedbackKeyPart(value: unknown) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function getPlaceFeedbackKey(location: unknown) {
  if (typeof location === 'string') return normalizePlaceFeedbackKeyPart(location);
  if (!isRecord(location)) return '';

  const address = location.address || location.full_address || location.addr || '';
  const label = location.label || location.name || location.title || location.query || '';
  return normalizePlaceFeedbackKeyPart(address || label);
}

export function normalizePlaceFeedback(value: unknown): NormalizedPlaceFeedback {
  const entries = Array.isArray(value)
    ? value.map((entry, index) => [String(isRecord(entry) ? entry.key || index : index), entry] as const)
    : isRecord(value) ? Object.entries(value) : [];

  return Object.fromEntries(entries.flatMap(([storedKey, rawEntry]) => {
    if (!isRecord(rawEntry) && typeof rawEntry !== 'boolean') return [];
    const safeEntry = isRecord(rawEntry) ? rawEntry : {};
    const statusValue = typeof rawEntry === 'boolean'
      ? (rawEntry ? PlaceFeedbackStatus.Blacklisted : PlaceFeedbackStatus.Allowed)
      : safeEntry.status || (safeEntry.blacklisted === false ? PlaceFeedbackStatus.Allowed : PlaceFeedbackStatus.Blacklisted);
    const status = statusValue === PlaceFeedbackStatus.Allowed
      ? PlaceFeedbackStatus.Allowed
      : statusValue === PlaceFeedbackStatus.Blacklisted
        ? PlaceFeedbackStatus.Blacklisted
        : null;
    if (!status) return [];

    const label = String(safeEntry.label || safeEntry.name || safeEntry.title || safeEntry.location?.label || '');
    const address = String(safeEntry.address || safeEntry.location?.address || '');
    const key = getPlaceFeedbackKey({ address, label }) || normalizePlaceFeedbackKeyPart(safeEntry.key || storedKey);
    if (!key) return [];

    return [[key, {
      key,
      label,
      address,
      status,
      updatedAt: String(safeEntry.updatedAt || safeEntry.updated_at || ''),
    } satisfies NormalizedPlaceFeedbackEntry]];
  }));
}

export function isPlaceBlacklisted(location: unknown, feedback: NormalizedPlaceFeedback) {
  return findPlaceFeedbackEntry(location, feedback)?.status === PlaceFeedbackStatus.Blacklisted;
}

export function findPlaceFeedbackEntry(location: unknown, feedback: NormalizedPlaceFeedback) {
  const directKey = getPlaceFeedbackKey(location);
  if (directKey && feedback[directKey]) return feedback[directKey];
  if (!isRecord(location)) return undefined;

  const addressKey = normalizePlaceFeedbackKeyPart(location.address || location.full_address || location.addr);
  const labelKey = normalizePlaceFeedbackKeyPart(location.label || location.name || location.title || location.query);
  return Object.values(feedback).find((entry) => (
    Boolean(addressKey && normalizePlaceFeedbackKeyPart(entry.address) === addressKey)
    || Boolean(labelKey && normalizePlaceFeedbackKeyPart(entry.label) === labelKey)
  ));
}

export function countBlacklistedPlanStops(plan: NormalizedPlan, feedback: NormalizedPlaceFeedback) {
  return plan.stops.filter((stop) => isPlaceBlacklisted(stop.location, feedback)).length;
}

export function getStopOutcomeKey(dateId: string, planId: string, stopId: string) {
  return [dateId, planId, stopId].map((value) => encodeURIComponent(String(value || '').trim())).join(':');
}

export function normalizeStopOutcomes(value: unknown): NormalizedStopOutcomes {
  if (!isRecord(value) && !Array.isArray(value)) return {};
  const entries = Array.isArray(value)
    ? value.map((entry, index) => [String(isRecord(entry) ? entry.key || index : index), entry] as const)
    : Object.entries(value);

  return Object.fromEntries(entries.flatMap(([storedKey, rawEntry]) => {
    if (!isRecord(rawEntry)) return [];
    const dateId = String(rawEntry.dateId || rawEntry.date_id || '');
    const planId = String(rawEntry.planId || rawEntry.plan_id || '');
    const stopId = String(rawEntry.stopId || rawEntry.stop_id || '');
    if (!dateId || !planId || !stopId) return [];

    const status = rawEntry.status === StopOutcomeStatus.Abandoned
      ? StopOutcomeStatus.Abandoned
      : rawEntry.status === StopOutcomeStatus.Active
        ? StopOutcomeStatus.Active
        : null;
    if (!status) return [];

    const key = getStopOutcomeKey(dateId, planId, stopId) || String(rawEntry.key || storedKey);
    return [[key, {
      key,
      dateId,
      planId,
      stopId,
      stopTitle: String(rawEntry.stopTitle || rawEntry.stop_title || rawEntry.title || ''),
      status,
      updatedAt: String(rawEntry.updatedAt || rawEntry.updated_at || ''),
    } satisfies NormalizedStopOutcomeEntry]];
  }));
}

export function isStopAbandoned(
  dateId: string,
  planId: string,
  stopId: string,
  outcomes: NormalizedStopOutcomes,
) {
  const key = getStopOutcomeKey(dateId, planId, stopId);
  return outcomes[key]?.status === StopOutcomeStatus.Abandoned;
}

export function normalizeTripSnapshot(
  trip: unknown,
  index = 0,
  options: { defaultTripDays?: number; todayId?: string } = {},
): NormalizedTripSnapshot {
  const safeTrip = isRecord(trip) ? trip : {};
  const defaultTripDays = options.defaultTripDays ?? DEFAULT_TRIP_DAYS;
  const startDate = String(safeTrip.startDateStr || safeTrip.startDate || options.todayId || getTodayId());
  const tripDays = clampTripDays(safeTrip.tripDays || safeTrip.days || defaultTripDays, defaultTripDays);
  const tripDates = createTripDateIds(startDate, tripDays);

  return {
    id: String(safeTrip.id || `trip-${index + 1}`),
    name: String(safeTrip.name || safeTrip.title || `旅行计划 ${index + 1}`),
    startDateStr: startDate,
    tripDays,
    plans: Array.isArray(safeTrip.plans)
      ? safeTrip.plans.map((plan, planIndex) => normalizePlan(plan, planIndex, tripDates))
      : [],
    schedule: normalizeSchedule(safeTrip.schedule || {}),
    lodgings: normalizeTripLodgings(safeTrip.lodgings || safeTrip.hotels || safeTrip.accommodations || safeTrip.stays),
    placeFeedback: normalizePlaceFeedback(safeTrip.placeFeedback || safeTrip.place_feedback),
    stopOutcomes: normalizeStopOutcomes(safeTrip.stopOutcomes || safeTrip.stop_outcomes),
    dayReviews: normalizeDayReviews(safeTrip.dayReviews || safeTrip.day_reviews),
    archiveSummary: normalizeTripArchiveSummary(safeTrip.archiveSummary || safeTrip.archive_summary),
    checklistText: normalizeChecklistText(
      Object.hasOwn(safeTrip, 'checklistText') ? safeTrip.checklistText : safeTrip.checklist || safeTrip.packingList,
    ),
    checklistState: normalizeChecklistState(safeTrip.checklistState || safeTrip.checklistStatus),
    archived: Boolean(safeTrip.archived),
  };
}

export function isEmptyTripDraft(trip: unknown) {
  if (!isRecord(trip)) return true;
  return (!Array.isArray(trip.plans) || trip.plans.length === 0)
    && (!Array.isArray(trip.lodgings) || trip.lodgings.length === 0);
}

export function pruneEmptyTripDrafts<T extends { id?: string }>(tripList: T[], activeTripId?: string) {
  return tripList.filter((trip) => !isEmptyTripDraft(trip) || trip.id === activeTripId);
}

export function stripChecklistFromTripSnapshot<T extends AnyRecord>(trip: T) {
  const nextTrip = { ...trip };
  delete nextTrip.checklistText;
  delete nextTrip.checklistState;
  delete nextTrip.checklist;
  delete nextTrip.checklistStatus;
  delete nextTrip.packingList;
  delete nextTrip.weatherData;
  return nextTrip;
}

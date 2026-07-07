import {
  normalizeExternalLinkUrl,
  normalizeLocation,
  normalizePlan,
  toArray,
  type NormalizedLocation,
  type NormalizedPlan,
  type TripDateLike,
} from './plan';
import {
  normalizeChecklistState,
  normalizeChecklistText,
  type ChecklistState,
} from './checklist';
import { addDays, getTodayId } from './date';

const DEFAULT_TRIP_DAYS = 5;
const MAX_TRIP_DAYS = 30;

type AnyRecord = Record<string, any>;

export interface NormalizedLodging {
  id: string;
  name: string;
  location: NormalizedLocation;
  checkIn: string;
  checkOut: string;
  note: string;
  bookingUrl: string;
  mapUrl: string;
  order?: number;
}

export interface NormalizedScheduleEntry {
  planId: string;
}

export type NormalizedSchedule = Record<string, NormalizedScheduleEntry>;

export interface NormalizedTripSnapshot {
  id: string;
  name: string;
  startDateStr: string;
  tripDays: number;
  plans: NormalizedPlan[];
  schedule: NormalizedSchedule;
  lodgings: NormalizedLodging[];
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

export function normalizeLodging(lodging: unknown, index = 0): NormalizedLodging | null {
  if (!isRecord(lodging)) return null;

  const name = String(lodging.name || lodging.title || lodging.hotel || lodging.label || `住宿 ${index + 1}`);
  const address = String(lodging.address || lodging.addr || lodging.full_address || lodging.location?.address || '');
  const location = normalizeLocation(lodging.location || {
    label: name,
    address,
  }, name);

  const normalized: NormalizedLodging = {
    id: String(lodging.id || `lodging-${index + 1}`),
    name,
    location: {
      ...location,
      address: location.address || address,
    },
    checkIn: String(lodging.checkIn || lodging.check_in || lodging.startDate || lodging.start_date || lodging.from || ''),
    checkOut: String(lodging.checkOut || lodging.check_out || lodging.endDate || lodging.end_date || lodging.to || ''),
    note: String(lodging.note || lodging.description || ''),
    bookingUrl: normalizeExternalLinkUrl(lodging.bookingUrl || lodging.booking_url || lodging.url),
    mapUrl: normalizeExternalLinkUrl(lodging.mapUrl || lodging.map_url),
  };

  if (Number.isFinite(Number(lodging.order))) normalized.order = Number(lodging.order);
  return normalized;
}

export function normalizeTripLodgings(lodgings: unknown) {
  return toArray(lodgings)
    .map((lodging, index) => normalizeLodging(lodging, index))
    .filter(Boolean) as NormalizedLodging[];
}

export function hasUsefulLodgingInfo(lodging: unknown) {
  if (!isRecord(lodging)) return false;
  const location = isRecord(lodging.location) ? lodging.location : {};

  return [
    lodging.name,
    location.label,
    location.address,
    lodging.address,
  ].some((value) => String(value || '').trim());
}

export function normalizeLodgingDrafts(
  drafts: unknown[],
  createId = () => `lodging-${Date.now()}-${Math.round(Math.random() * 1000)}`,
) {
  return drafts
    .map((draft, index) => {
      const safeDraft = isRecord(draft) ? draft : {};
      return {
        id: safeDraft.id || createId(),
        name: String(safeDraft.name || '').trim(),
        location: {
          label: String(safeDraft.name || '').trim(),
          address: String(safeDraft.address || '').trim(),
        },
        checkIn: String(safeDraft.checkIn || '').trim(),
        checkOut: String(safeDraft.checkOut || '').trim(),
        note: String(safeDraft.note || '').trim(),
        order: index,
      };
    })
    .filter(hasUsefulLodgingInfo)
    .map((lodging, index) => normalizeLodging(lodging, index))
    .filter(Boolean) as NormalizedLodging[];
}

export function normalizeSchedule(schedule: unknown): NormalizedSchedule {
  if (!isRecord(schedule)) return {};

  return Object.fromEntries(
    Object.entries(schedule)
      .filter(([, value]) => Boolean(value))
      .map(([dateId, value]) => {
        if (typeof value === 'string') return [dateId, { planId: value }];
        if (!isRecord(value)) return [dateId, { planId: '' }];
        return [dateId, { planId: String(value.planId || value.id || '') }];
      })
      .filter(([, value]) => Boolean((value as NormalizedScheduleEntry).planId)),
  ) as NormalizedSchedule;
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

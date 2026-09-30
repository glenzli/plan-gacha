import { normalizeExternalLinkUrl, normalizeLocation, type NormalizedLocation, type NormalizedPlan } from './plan';
import { addDays } from './date';
import type { NormalizedSchedule } from './trip';
import type { TranslateFn } from '../types/ui';

export interface LodgingReservation {
  id: string;
  checkIn: string;
  checkOut: string;
  status: 'pending' | 'booked' | 'cancelled';
  cancelBy: string;
  cancelUrl: string;
  note: string;
}

export interface NormalizedLodging {
  id: string;
  name: string;
  location: NormalizedLocation;
  checkIn: string;
  checkOut: string;
  note: string;
  bookingUrl: string;
  mapUrl: string;
  defaultForTrip?: boolean;
  reservations?: LodgingReservation[];
  order?: number;
}

type RecordValue = Record<string, any>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
export const NO_LODGING = '__none__';
export const coversNight = (stay: { checkIn: string; checkOut: string }, date: string) => Boolean(stay.checkIn && stay.checkOut && stay.checkIn <= date && date < stay.checkOut);

export function normalizeLodging(value: unknown, index = 0): NormalizedLodging | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = record(value);
  const name = String(item.name || item.title || item.hotel || item.label || `住宿 ${index + 1}`);
  const address = String(item.address || item.addr || item.full_address || item.location?.address || '');
  const location = normalizeLocation(item.location || { label: name, address }, name);
  return {
    id: String(item.id || `lodging-${index + 1}`), name,
    location: { ...location, address: location.address || address },
    checkIn: String(item.checkIn || item.check_in || item.startDate || item.start_date || item.from || ''),
    checkOut: String(item.checkOut || item.check_out || item.endDate || item.end_date || item.to || ''),
    note: String(item.note || item.description || ''),
    bookingUrl: normalizeExternalLinkUrl(item.bookingUrl || item.booking_url || item.url),
    mapUrl: normalizeExternalLinkUrl(item.mapUrl || item.map_url),
    defaultForTrip: (item.defaultForTrip ?? item.default_for_trip) !== false,
    reservations: (Array.isArray(item.reservations) ? item.reservations : []).map((raw: unknown, i: number) => {
      const reservation = record(raw);
      return {
        id: String(reservation.id || `${item.id || `lodging-${index + 1}`}-reservation-${i + 1}`),
        checkIn: String(reservation.checkIn || reservation.check_in || ''),
        checkOut: String(reservation.checkOut || reservation.check_out || ''),
        status: reservation.status === 'cancelled' ? 'cancelled' : reservation.status === 'booked' ? 'booked' : 'pending',
        cancelBy: String(reservation.cancelBy || reservation.cancel_by || ''),
        cancelUrl: normalizeExternalLinkUrl(reservation.cancelUrl || reservation.cancel_url),
        note: String(reservation.note || ''),
      } as LodgingReservation;
    }),
    ...(Number.isFinite(Number(item.order)) ? { order: Number(item.order) } : {}),
  };
}

export function normalizeTripLodgings(value: unknown): NormalizedLodging[] {
  return (Array.isArray(value) ? value : value ? [value] : []).map(normalizeLodging).filter((item): item is NormalizedLodging => Boolean(item));
}

export function hasUsefulLodgingInfo(value: unknown) {
  const item = record(value);
  return [item.name, item.location?.label, item.location?.address, item.address].some((part) => String(part || '').trim());
}

export function normalizeLodgingDrafts(drafts: unknown[], createId = () => `lodging-${Date.now()}-${Math.round(Math.random() * 1000)}`) {
  return drafts.map((raw, index) => {
    const draft = record(raw);
    const name = String(draft.name || '').trim();
    const address = String(draft.address ?? draft.location?.address ?? '').trim();
    const samePlace = name === draft.location?.label && address === draft.location?.address;
    return {
      ...draft, id: draft.id || createId(), name,
      location: { ...draft.location, label: name, address, mapPoint: samePlace ? draft.location?.mapPoint : undefined },
      order: index,
    };
  }).filter(hasUsefulLodgingInfo).map(normalizeLodging).filter((item): item is NormalizedLodging => Boolean(item));
}

// AI edits describe intent. Existing reservations are user-confirmed facts and
// must survive partial responses, empty arrays and a changed hotel suggestion.
export function mergeLodgings(current: NormalizedLodging[], incoming: unknown, fromAi = false): NormalizedLodging[] {
  const result = [...current];
  for (const raw of Array.isArray(incoming) ? incoming : []) {
    const item = record(raw);
    if (!item.id || !String(item.id).trim()) throw new Error('lodgingIdRequired');
    if (item.id === NO_LODGING) throw new Error('lodgingIdRequired');
    const index = result.findIndex((hotel) => hotel.id === item.id);
    const existing = result[index];
    const canonical = { ...item };
    for (const [snake, camel] of [['check_in', 'checkIn'], ['check_out', 'checkOut'], ['default_for_trip', 'defaultForTrip'], ['booking_url', 'bookingUrl'], ['map_url', 'mapUrl']]) {
      if (Object.hasOwn(item, snake)) canonical[camel] = item[snake];
    }
    if (fromAi && !existing && canonical.defaultForTrip === undefined) canonical.defaultForTrip = false;
    if (existing) {
      canonical.location = { ...existing.location, ...record(item.location) };
      if (Object.hasOwn(item, 'name')) canonical.location.label = item.name;
      if (Object.hasOwn(item, 'address')) canonical.location.address = item.address;
      if (Object.hasOwn(record(item.location), 'country_code')) canonical.location.countryCode = item.location.country_code;
      if (Object.hasOwn(record(item.location), 'map_point')) canonical.location.mapPoint = item.location.map_point;
    }
    const next = normalizeLodging({ ...existing, ...canonical })!;
    if (fromAi && existing?.reservations?.some((reservation) => reservation.status === 'booked')
      && (existing.name !== next.name || existing.location.address !== next.location.address)) throw new Error('lodgingBookedPlaceChanged');
    if (fromAi) next.reservations = existing?.reservations || [];
    else if (existing) {
      const orders = new Map((existing.reservations || []).map((reservation) => [reservation.id, reservation]));
      if (Array.isArray(item.reservations)) for (const reservation of next.reservations || []) orders.set(reservation.id, reservation);
      next.reservations = [...orders.values()];
    }
    // A changed label/address cannot retain a precise point from the old hotel.
    if (existing && !item.location?.map_point && !item.location?.mapPoint
      && (existing.name !== next.name || existing.location.address !== next.location.address)) {
      next.location = { ...next.location, mapPoint: undefined };
    }
    if (index < 0) result.push(next); else result[index] = next;
  }
  return result;
}

export interface NightLodging {
  dateId: string;
  selected: NormalizedLodging | null;
  options: NormalizedLodging[];
  status: 'selected' | 'none' | 'missing' | 'choose';
  source: 'default' | 'plan' | 'manual';
  locked: boolean;
  conflict: boolean;
}

export function resolveNightLodging(dateId: string, schedule: NormalizedSchedule, plans: Map<string, NormalizedPlan>, lodgings: NormalizedLodging[]): NightLodging {
  const entry = schedule[dateId];
  const intent = entry?.status !== 'abandoned' ? plans.get(entry?.planId)?.lodging : undefined;
  const options = intent?.mode === 'options'
    ? lodgings.filter((hotel) => intent.optionIds.includes(hotel.id))
    : intent?.mode === 'none' ? [] : lodgings.filter((hotel) => hotel.defaultForTrip !== false && coversNight(hotel, dateId));
  const chosenId = entry?.lodgingId || (intent?.mode === 'none' ? NO_LODGING
    : intent?.mode === 'options' && intent.preferredId ? intent.preferredId : options.length === 1 ? options[0].id : '');
  const selected = lodgings.find((hotel) => hotel.id === chosenId) || null;
  return {
    dateId, selected, options,
    status: chosenId === NO_LODGING ? 'none' : selected ? 'selected' : options.length > 1 ? 'choose' : 'missing',
    source: entry?.lodgingId ? 'manual' : intent?.mode === 'options' || intent?.mode === 'none' ? 'plan' : 'default',
    locked: entry?.lodgingLocked === true,
    conflict: Boolean(entry?.lodgingId && intent && intent.mode !== 'inherit'
      && (intent.mode === 'none' ? chosenId !== NO_LODGING : !intent.optionIds.includes(chosenId))),
  };
}

export interface LodgingTask {
  type: 'book' | 'review' | 'choose' | 'missing' | 'locked';
  dateId: string;
  hotel?: NormalizedLodging;
  reservation?: LodgingReservation;
  partial?: boolean;
}

export function getLodgingTasks(dateId: string, schedule: NormalizedSchedule, plans: Map<string, NormalizedPlan>, lodgings: NormalizedLodging[]): LodgingTask[] {
  const night = resolveNightLodging(dateId, schedule, plans, lodgings);
  const tasks: LodgingTask[] = [];
  if (night.status === 'choose' || night.status === 'missing') tasks.push({ type: night.status, dateId });
  if (night.conflict) tasks.push({ type: 'locked', dateId, hotel: night.selected || undefined });
  if (night.selected && !night.selected.reservations?.some((reservation) => reservation.status === 'booked' && coversNight(reservation, dateId))) {
    tasks.push({ type: 'book', dateId, hotel: night.selected });
  }
  // An unresolved night cannot establish that an existing booking is unwanted.
  if (night.status === 'selected' || night.status === 'none') {
    for (const hotel of lodgings) {
      if (hotel.id === night.selected?.id) continue;
      for (const reservation of hotel.reservations || []) {
        if (reservation.status === 'booked' && coversNight(reservation, dateId)) tasks.push({
          type: 'review', dateId, hotel, reservation, partial: addDays(reservation.checkIn, 1) !== reservation.checkOut,
        });
      }
    }
  }
  return tasks;
}

export interface LodgingImpact {
  dateId: string;
  before: NightLodging;
  after: NightLodging;
  nextMorning: string;
  tasks: LodgingTask[];
}

export function nightLodgingLabel(night: NightLodging, t: TranslateFn) {
  return night.selected?.name || t(night.status === 'none' ? 'lodgingNotNeeded' : night.status === 'choose' ? 'lodgingChoose' : 'lodgingUnspecified');
}

export function lodgingTaskLabel(task: LodgingTask, t: TranslateFn) {
  return t(`lodgingTask_${task.type}`, { name: task.hotel?.name || '', date: task.dateId });
}

export function getLodgingImpacts(beforeSchedule: NormalizedSchedule, afterSchedule: NormalizedSchedule,
  beforePlans: Map<string, NormalizedPlan>, afterPlans: Map<string, NormalizedPlan>,
  beforeHotels: NormalizedLodging[], afterHotels = beforeHotels, tripDates: string[] = []): LodgingImpact[] {
  const dates = [...new Set([...tripDates, ...Object.keys(beforeSchedule), ...Object.keys(afterSchedule)])].sort();
  return dates.flatMap((dateId) => {
    const before = resolveNightLodging(dateId, beforeSchedule, beforePlans, beforeHotels);
    const after = resolveNightLodging(dateId, afterSchedule, afterPlans, afterHotels);
    const identity = (night: NightLodging) => JSON.stringify([night.status, night.selected?.id, night.selected?.location, night.conflict, night.status === 'choose' ? night.options.map((hotel) => hotel.id) : []]);
    if (identity(before) === identity(after)) return [];
    const nextDate = addDays(dateId, 1);
    return [{ dateId, before, after, nextMorning: dates.includes(nextDate) ? nextDate : '', tasks: getLodgingTasks(dateId, afterSchedule, afterPlans, afterHotels) }];
  });
}

export function resolveLodgingStops(plan: NormalizedPlan, dateId: string, schedule: NormalizedSchedule, plans: Map<string, NormalizedPlan>, hotels: NormalizedLodging[]): NormalizedPlan {
  const changed = new Set<number>();
  const stops = plan.stops.map((stop, index) => {
    const legacyHotel = !stop.lodgingAnchor && (index === 0 || index === plan.stops.length - 1)
      ? hotels.find((hotel) => hotel.location.label === stop.location.label && Boolean(hotel.location.address) && hotel.location.address === stop.location.address) : undefined;
    const anchor = stop.lodgingAnchor || (legacyHotel ? index === 0 ? 'previous_night' : 'tonight' : undefined);
    if (!anchor) return stop;
    const date = anchor === 'previous_night' ? addDays(dateId, -1) : dateId;
    const night = resolveNightLodging(date, schedule, plans, hotels);
    const hotel = night.selected;
    if (!hotel) {
      changed.add(index);
      return { ...stop, location: { ...stop.location, label: '', address: '', mapPoint: undefined }, lodgingUnresolved: true };
    }
    if ((stop.lodgingId || legacyHotel?.id) !== hotel.id || stop.location.address !== hotel.location.address || JSON.stringify(stop.location.mapPoint) !== JSON.stringify(hotel.location.mapPoint)) changed.add(index);
    return { ...stop, location: { ...hotel.location, countryCode: hotel.location.countryCode || stop.location.countryCode || plan.location.countryCode }, weatherRelevant: false };
  });
  return { ...plan, stops: stops.map((stop, index) => changed.has(index) || changed.has(index - 1)
    ? { ...stop, lodgingRouteChanged: true, transferFromPrevious: stop.transferFromPrevious ? { ...stop.transferFromPrevious, duration: '', departAt: '', arriveAt: '' } : null }
    : stop) };
}

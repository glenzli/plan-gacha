import {
  HARD_BLOCKED_WEATHER,
  SEVERE_WEATHER,
  getWeatherLocationLabel,
  type WeatherCondition,
  type WeatherLocationLike,
} from './weather';
import type { MapPoint } from './coordinates';

export type Language = 'zh' | 'en' | string;

export enum PlanPriority {
  Must = 'must',
  Preferred = 'preferred',
  Backup = 'backup',
  Optional = 'optional',
}

export enum BookingType {
  Reservation = 'reservation',
  RestaurantReservation = 'restaurant_reservation',
  Ticket = 'ticket',
  Confirmation = 'confirmation',
}

export enum BookingStatus {
  Pending = 'pending',
  Done = 'done',
  None = 'none',
}

export interface TripDateLike {
  id: string;
}

export interface NormalizedLocation extends WeatherLocationLike {
  label: string;
  query: string;
  address: string;
  latitude?: number;
  longitude?: number;
  countryCode?: string;
  admin1?: string;
  admin2?: string;
  mapPoint?: MapPoint;
}

export type PreferredRouteMode = 'transit' | 'driving' | 'walking';

export interface StopTransfer {
  departAt: string;
  arriveAt: string;
  duration: string;
  mode: string;
  preferredRouteMode?: PreferredRouteMode | null;
  note: string;
  via?: NormalizedLocation[];
}

export interface PlanStop {
  id: string;
  time: string;
  title: string;
  location: NormalizedLocation;
  note: string;
  transferFromPrevious: StopTransfer | null;
  openingHours: string;
  weatherRelevant: boolean;
  lodgingAnchor?: 'previous_night' | 'tonight';
  lodgingId?: string;
  lodgingUnresolved?: boolean;
  lodgingRouteChanged?: boolean;
}

export interface PlanLodging {
  mode: 'inherit' | 'options' | 'none';
  optionIds: string[];
  preferredId: string;
}

export function normalizePlanLodging(value: unknown): PlanLodging | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  const mode = item.mode === 'options' || item.mode === 'none' ? item.mode : 'inherit';
  const rawIds = item.optionIds ?? item.option_ids;
  const optionIds = [...new Set(Array.isArray(rawIds) ? rawIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())) : [])];
  const preferredId = String(item.preferredId ?? item.preferred_id ?? '');
  return { mode, optionIds: mode === 'options' ? optionIds : [], preferredId: optionIds.includes(preferredId) ? preferredId : '' };
}

export interface ReminderLink {
  label: string;
  url: string;
}

export interface PlanReminder {
  id: string;
  time: string;
  text: string;
  links: ReminderLink[];
}

export interface PlanBooking {
  id: string;
  type: BookingType;
  title: string;
  status: BookingStatus;
  address: string;
  url: string;
  cancelUrl: string;
  note: string;
}

export interface WeatherRules {
  best: string[];
  ok: string[];
  blocked: string[];
}

export interface NormalizedPlan {
  id: string;
  name: string;
  description: string;
  priority: PlanPriority;
  location: NormalizedLocation;
  stops: PlanStop[];
  available_dates: string[];
  closed_dates: string[];
  weather_rules: WeatherRules;
  conflicts: string[];
  reminders: PlanReminder[];
  tips: string[];
  bookings: PlanBooking[];
  lodging?: PlanLodging;
}

type AnyRecord = Record<string, any>;

export const PLAN_PRIORITY_VALUES = Object.values(PlanPriority);

export const QINGDAO_LOCATION: NormalizedLocation = {
  label: '青岛市',
  query: 'Qingdao',
  weatherLabel: '青岛市',
  countryCode: 'CN',
  latitude: 36.0671,
  longitude: 120.3826,
  address: '',
};

export const WEIHAI_LOCATION: NormalizedLocation = {
  label: '威海市',
  query: 'Weihai',
  weatherLabel: '威海市',
  countryCode: 'CN',
  latitude: 37.5135,
  longitude: 122.1217,
  address: '',
};

export const YANTAI_LOCATION: NormalizedLocation = {
  label: '烟台市',
  query: 'Yantai',
  weatherLabel: '烟台市',
  countryCode: 'CN',
  latitude: 37.4638,
  longitude: 121.4479,
  address: '',
};

const BOOKING_TYPE_ALIASES = new Set<string>([
  ...Object.values(BookingType),
  'restaurant',
  'dining',
  'meal',
  'food',
  '餐厅',
  '餐厅预约',
  '饭店',
  '食事',
  'train',
  'flight',
  'boat',
  'ferry',
  'pass',
  '票',
  '车票',
  '门票',
  'confirm',
  'check',
  'notice',
  '确认',
  '预约',
  '预订',
]);

export const BOOKING_TYPE_VALUES = BOOKING_TYPE_ALIASES;

export const BOOKING_STATUS_VALUES = new Set<string>([
  ...Object.values(BookingStatus),
  'booked',
  'reserved',
  'purchased',
  'confirmed',
  'complete',
  'completed',
  'not_needed',
  'optional',
  '已预约',
  '已订票',
  '已确认',
  '未预约',
  '未订票',
  '待确认',
  '待预约',
  '待订票',
  '待处理',
  '需预约',
  '无需',
  '无需预约',
]);

export function toArray<T = any>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value) return [value];
  return [];
}

function uniq<T>(values: T[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function inferWeatherLabel(location: unknown): string | undefined {
  if (!isRecord(location)) return undefined;

  const weatherLocation = location.weatherLocation || location.weather_location || location.weather;
  if (typeof weatherLocation === 'string') return weatherLocation;
  if (isRecord(weatherLocation)) {
    return inferWeatherLabel(weatherLocation) || weatherLocation.query || weatherLocation.label || weatherLocation.name;
  }

  if (location.weatherLabel || location.weather_label || location.city || location.district || location.area) {
    return location.weatherLabel || location.weather_label || location.city || location.district || location.area;
  }

  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const isQingdao =
    location.query === QINGDAO_LOCATION.query ||
    (Math.abs(latitude - Number(QINGDAO_LOCATION.latitude)) < 0.01 && Math.abs(longitude - Number(QINGDAO_LOCATION.longitude)) < 0.01);

  return isQingdao ? QINGDAO_LOCATION.weatherLabel : undefined;
}

export function normalizeCoordinate(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

const JAPAN_LOCATION_HINTS = [
  'japan',
  '日本',
  '京都府',
  '大阪府',
  '滋賀県',
  '滋贺县',
  '奈良県',
  '奈良县',
  '兵庫県',
  '兵库县',
  '和歌山県',
  '和歌山县',
  '東京都',
  '北海道',
];

const JAPAN_PREFECTURE_ALIASES: Record<string, string> = {
  京都府: '京都府',
  大阪府: '大阪府',
  滋賀県: '滋賀県',
  滋贺县: '滋賀県',
  奈良県: '奈良県',
  奈良县: '奈良県',
  兵庫県: '兵庫県',
  兵库县: '兵庫県',
  和歌山県: '和歌山県',
  和歌山县: '和歌山県',
  東京都: '東京都',
  北海道: '北海道',
};

function normalizeCountryCode(value: unknown) {
  const normalized = String(value || '').trim().toUpperCase();
  const countryMap: Record<string, string> = {
    JAPAN: 'JP',
    日本: 'JP',
    CHINA: 'CN',
    中国: 'CN',
    SOUTH_KOREA: 'KR',
    'SOUTH KOREA': 'KR',
    韩国: 'KR',
    韓國: 'KR',
    TAIWAN: 'TW',
    台湾: 'TW',
    臺灣: 'TW',
    THAILAND: 'TH',
    泰国: 'TH',
    SINGAPORE: 'SG',
    新加坡: 'SG',
  };

  if (/^[A-Z]{2}$/.test(normalized)) return normalized;
  return countryMap[normalized] || normalized;
}

function getLocationTextValues(...values: unknown[]) {
  return values
    .flatMap((value) => {
      if (!isRecord(value)) return [value];
      return [
        value.query,
        value.label,
        value.name,
        value.weatherLabel,
        value.weather_label,
        value.address,
        value.city,
        value.district,
        value.area,
        value.admin1,
        value.admin2,
        value.prefecture,
        value.province,
        value.state,
        value.country,
        value.countryCode,
        value.country_code,
      ];
    })
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function inferCountryCodeFromLocation(values: string[]) {
  const joined = values.join(' ');
  if (!joined) return '';
  if (JAPAN_LOCATION_HINTS.some((hint) => joined.toLowerCase().includes(hint.toLowerCase()))) return 'JP';
  return '';
}

function inferJapanPrefecture(values: string[]) {
  const joined = values.join(' ');
  const alias = Object.keys(JAPAN_PREFECTURE_ALIASES).find((key) => joined.includes(key));
  if (alias) return JAPAN_PREFECTURE_ALIASES[alias];

  const match = joined.match(/([^\s,，、]{2,5}[都道府県])/);
  return match?.[1] || '';
}

function inferJapanCity(values: string[]) {
  const joined = values.join(' ');
  const match = joined.match(/([一-龯ぁ-んァ-ヶ]{1,8}市)/);
  return match?.[1] || '';
}

function normalizeWeatherKeyPart(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，、,].*$/, '')
    .replace(/県/g, '県')
    .replace(/县/g, '県');
}

export function normalizeLocation(location: unknown, area = ''): NormalizedLocation {
  if (typeof location === 'string') {
    return {
      label: location,
      query: area || location,
      weatherLabel: area || location,
      address: '',
    };
  }

  if (isRecord(location)) {
    const rawMapPoint = location.mapPoint || location.map_point;
    const mapLatitude = isRecord(rawMapPoint) ? normalizeCoordinate(rawMapPoint.latitude ?? rawMapPoint.lat) : undefined;
    const mapLongitude = isRecord(rawMapPoint) ? normalizeCoordinate(rawMapPoint.longitude ?? rawMapPoint.lon ?? rawMapPoint.lng) : undefined;
    const rawCoordinateSystem = isRecord(rawMapPoint) ? rawMapPoint.coordinateSystem ?? rawMapPoint.coordinate_system : undefined;
    const coordinateSystem = String(rawCoordinateSystem || '').trim().toUpperCase();
    const mapPoint = mapLatitude !== undefined && mapLongitude !== undefined &&
      Math.abs(mapLatitude) <= 90 && Math.abs(mapLongitude) <= 180 &&
      !(mapLatitude === 0 && mapLongitude === 0) && (coordinateSystem === 'GCJ-02' || coordinateSystem === 'WGS84' || coordinateSystem === 'WGS-84')
      ? { latitude: mapLatitude, longitude: mapLongitude, coordinateSystem: (coordinateSystem === 'GCJ-02' ? 'GCJ-02' : 'WGS84') as MapPoint['coordinateSystem'] }
      : undefined;
    const weatherLocation = location.weatherLocation || location.weather_location || location.weather;
    const weatherLocationObject = isRecord(weatherLocation) ? weatherLocation : null;
    const weatherLocationText = typeof weatherLocation === 'string' ? weatherLocation : '';
    const locationTextValues = getLocationTextValues(weatherLocationObject || weatherLocationText, location, area);
    const latitude = normalizeCoordinate(
      weatherLocationObject?.latitude ?? weatherLocationObject?.lat ?? location.latitude ?? location.lat,
    );
    const longitude = normalizeCoordinate(
      weatherLocationObject?.longitude ?? weatherLocationObject?.lon ?? weatherLocationObject?.lng ?? location.longitude ?? location.lon ?? location.lng,
    );
    const countryCode = normalizeCountryCode(
      weatherLocationObject?.countryCode ||
        weatherLocationObject?.country_code ||
        weatherLocationObject?.country ||
        location.countryCode ||
        location.country_code ||
        location.country ||
        '',
    ) || inferCountryCodeFromLocation(locationTextValues);
    const admin1 =
      weatherLocationObject?.admin1 ||
      weatherLocationObject?.prefecture ||
      weatherLocationObject?.province ||
      weatherLocationObject?.state ||
      location.admin1 ||
      location.prefecture ||
      location.province ||
      location.state ||
      (countryCode === 'JP' ? inferJapanPrefecture(locationTextValues) : '') ||
      '';
    const admin2 =
      weatherLocationObject?.admin2 ||
      weatherLocationObject?.county ||
      weatherLocationObject?.city ||
      location.admin2 ||
      location.county ||
      location.city ||
      (countryCode === 'JP' ? inferJapanCity(locationTextValues) : '') ||
      '';
    const weatherLabel = inferWeatherLabel(location);
    const explicitWeatherQuery =
      location.weatherQuery ||
      location.weather_query ||
      weatherLocationText ||
      weatherLocationObject?.query ||
      weatherLocationObject?.label ||
      weatherLocationObject?.name;
    const topLevelAdminHint = Boolean(
      location.weatherLabel ||
        location.weather_label ||
        location.city ||
        location.district ||
        location.area ||
        location.admin1 ||
        location.admin2 ||
        location.prefecture ||
        location.province ||
        location.state ||
        location.countryCode ||
        location.country_code ||
        location.country,
    );
    const query =
      explicitWeatherQuery ||
      (topLevelAdminHint ? weatherLabel || admin2 || admin1 || area : '') ||
      location.query ||
      weatherLabel ||
      area ||
      location.label ||
      location.name ||
      '';

    return {
      label: location.label || location.name || location.query || area || '待定地点',
      query,
      weatherLabel,
      latitude,
      longitude,
      countryCode,
      admin1,
      admin2,
      address: location.address || location.addr || location.full_address || '',
      mapPoint,
    };
  }

  return { label: area || '待定地点', query: area || '', address: '' };
}

export function hasCoordinates(location: Pick<NormalizedLocation, 'latitude' | 'longitude'> | WeatherLocationLike) {
  const latitude = normalizeCoordinate(location.latitude);
  const longitude = normalizeCoordinate(location.longitude);
  if (latitude === undefined || longitude === undefined) return false;

  // AI/imported data often uses 0,0 as an empty coordinate placeholder.
  return !(latitude === 0 && longitude === 0);
}

export function getWeatherLocationKey(location: WeatherLocationLike) {
  if (hasCoordinates(location)) return `${normalizeCoordinate(location.latitude)},${normalizeCoordinate(location.longitude)}`;
  const source = location as WeatherLocationLike & {
    address?: string;
    countryCode?: string;
    country_code?: string;
    country?: string;
    admin1?: string;
    admin2?: string;
  };
  const textValues = getLocationTextValues(source);
  const countryCode = normalizeCountryCode(source.countryCode || source.country_code || source.country || '') || inferCountryCodeFromLocation(textValues);
  const admin1 = source.admin1 || (countryCode === 'JP' ? inferJapanPrefecture(textValues) : '');
  const admin2 = source.admin2 || (countryCode === 'JP' ? inferJapanCity(textValues) : '');

  if (countryCode && admin1 && admin2) {
    const normalizedAdmin1 = normalizeWeatherKeyPart(admin1);
    const normalizedAdmin2 = normalizeWeatherKeyPart(admin2);
    if (normalizedAdmin1 === normalizedAdmin2) {
      return [countryCode, admin2].map(normalizeWeatherKeyPart).join(':');
    }
    return [countryCode, admin1, admin2].map(normalizeWeatherKeyPart).join(':');
  }

  if (countryCode && admin2) {
    return [countryCode, admin2].map(normalizeWeatherKeyPart).join(':');
  }

  if (location.query) return location.query;
  return location.label || '';
}

function hasOwnWeatherSource(location: unknown) {
  if (!isRecord(location)) return false;

  const weatherLocation = location.weatherLocation || location.weather_location || location.weather;
  if (typeof weatherLocation === 'string') return Boolean(weatherLocation.trim());
  if (isRecord(weatherLocation)) {
    return Boolean(
      weatherLocation.query ||
        weatherLocation.label ||
        weatherLocation.name ||
        weatherLocation.weatherLabel ||
        weatherLocation.weather_label ||
        weatherLocation.city ||
        weatherLocation.district ||
        weatherLocation.area ||
        weatherLocation.admin1 ||
        weatherLocation.admin2 ||
        weatherLocation.prefecture ||
        weatherLocation.province ||
        weatherLocation.state ||
        weatherLocation.country ||
        weatherLocation.countryCode ||
        weatherLocation.country_code ||
        hasCoordinates(weatherLocation),
    );
  }

  return Boolean(
    hasCoordinates(location) ||
      location.weatherQuery ||
      location.weather_query ||
      location.weatherLabel ||
      location.weather_label ||
      location.city ||
      location.district ||
      location.area ||
      location.admin1 ||
      location.admin2 ||
      location.countryCode ||
      location.country_code ||
      location.country,
  );
}

function normalizeStopLocation(rawLocation: unknown, fallbackLocation: NormalizedLocation): NormalizedLocation {
  if (!rawLocation) return { ...fallbackLocation, mapPoint: undefined };

  if (typeof rawLocation === 'string') {
    return {
      ...fallbackLocation,
      label: rawLocation,
      weatherLabel: getWeatherLocationLabel(fallbackLocation),
      mapPoint: undefined,
    };
  }

  if (hasOwnWeatherSource(rawLocation)) {
    return normalizeLocation(rawLocation, getWeatherLocationLabel(fallbackLocation));
  }

  const displayLocation = normalizeLocation(rawLocation, fallbackLocation.label);
  return {
    ...fallbackLocation,
    label: displayLocation.label,
    weatherLabel: getWeatherLocationLabel(fallbackLocation),
    address: displayLocation.address || fallbackLocation.address || '',
    mapPoint: displayLocation.mapPoint,
  };
}

export function normalizeStopTransfer(value: unknown): StopTransfer | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const duration = value.trim();
    return duration ? { departAt: '', arriveAt: '', duration, mode: '', note: '', via: [] } : null;
  }

  if (!isRecord(value)) return null;
  const duration = String(value.duration || value.time || value.travel_time || value.travelTime || '').trim();
  const mode = String(value.mode || value.method || value.transport || '').trim();
  const rawPreferredRouteMode = String(value.preferred_route_mode || value.preferredRouteMode || '').trim().toLowerCase();
  const preferredRouteMode: PreferredRouteMode | null = rawPreferredRouteMode === 'walking' || rawPreferredRouteMode === 'driving' || rawPreferredRouteMode === 'transit'
    ? rawPreferredRouteMode : null;
  const note = String(value.note || value.description || value.detail || '').trim();
  const rawVia = value.via || value.waypoints || value.route_via || value.routeVia;
  const via = (Array.isArray(rawVia) ? rawVia : rawVia ? [rawVia] : [])
    .map((point) => normalizeLocation(point))
    .filter((point) => Boolean(point.label && (point.mapPoint || point.address || point.query)));
  const departAt = String(
    value.depart_at || value.departAt || value.departure || value.depart || value.departure_at || value.departureAt || value.departure_time || value.departureTime || value.start_at || value.startAt || value.start_time || value.startTime || '',
  ).trim();
  const arriveAt = String(
    value.arrive_at || value.arriveAt || value.arrival || value.arrive || value.arrival_at || value.arrivalAt || value.arrival_time || value.arrivalTime || value.end_at || value.endAt || value.end_time || value.endTime || '',
  ).trim();
  if (!duration && !mode && !preferredRouteMode && !note && !departAt && !arriveAt && !via.length) return null;
  return { departAt, arriveAt, duration, mode, preferredRouteMode, note, via };
}

export function formatStopTransfer(transfer?: StopTransfer | null) {
  if (!transfer) return '';
  return [transfer.mode, transfer.duration].filter(Boolean).join(' · ');
}

function normalizeNumericText(value: unknown) {
  return String(value || '').replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0));
}

export function parseClockTime(value: unknown) {
  const match = normalizeNumericText(value).match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 47 || minutes > 59) return null;
  return (hours % 24) * 60 + minutes;
}

function formatClockTime(totalMinutes: number) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function parseDurationMinutes(value: unknown) {
  const text = normalizeNumericText(value).toLowerCase();
  if (!text.trim()) return null;

  let total = 0;
  let matched = false;
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(小时|小時|時間|hours?|hrs?|hr|h)/i);
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*(分钟|分鐘|分|min(?:ute)?s?|m)/i);

  if (hourMatch) {
    total += Number(hourMatch[1]) * 60;
    matched = true;
  }

  if (minuteMatch) {
    total += Number(minuteMatch[1]);
    matched = true;
  }

  if (!matched) {
    const plainNumber = text.match(/\d+(?:\.\d+)?/);
    if (plainNumber) {
      total = Number(plainNumber[0]);
      matched = true;
    }
  }

  return matched && Number.isFinite(total) && total > 0 ? total : null;
}

export function formatStopTransferDeparture(transfer?: StopTransfer | null, fallbackArriveAt = '', language: Language = 'zh') {
  if (!transfer) return '';
  const departAt = transfer.departAt || '';
  if (departAt) return departAt;

  const arriveAt = transfer.arriveAt || fallbackArriveAt;
  const arriveMinutes = parseClockTime(arriveAt);
  const durationMinutes = parseDurationMinutes(transfer.duration);
  if (arriveMinutes === null || durationMinutes === null) return '';

  const estimatedTime = formatClockTime(arriveMinutes - durationMinutes);
  return language === 'en' ? `~ ${estimatedTime}` : `约 ${estimatedTime}`;
}

export function normalizePlanStops(stops: unknown, fallbackLocation: NormalizedLocation): PlanStop[] {
  if (!Array.isArray(stops)) return [];

  return stops
    .filter(Boolean)
    .map((stop, index) => {
      if (typeof stop === 'string') {
        return {
          id: `stop-${index + 1}`,
          time: '',
          title: stop,
          location: normalizeStopLocation(stop, fallbackLocation),
          note: '',
          transferFromPrevious: null,
          openingHours: '',
          weatherRelevant: true,
        };
      }

      const item = isRecord(stop) ? stop : {};
      const location = normalizeStopLocation(item.location || item.place || fallbackLocation, fallbackLocation);
      const time = item.time || item.time_window || item.window || (item.start && item.end ? `${item.start}-${item.end}` : item.start || '');
      const transferFromPrevious = normalizeStopTransfer(
        item.transfer_from_previous || item.transferFromPrevious || item.transfer || item.travel_from_previous || item.travelFromPrevious,
      );
      const openingHours = String(item.opening_hours || item.openingHours || item.business_hours || item.businessHours || item.hours || '').trim();

      return {
        id: item.id || `stop-${index + 1}`,
        time,
        title: item.title || item.name || location.label,
        location,
        note: item.note || item.description || '',
        transferFromPrevious,
        openingHours,
        weatherRelevant: item.weather_relevant !== false && item.weatherRelevant !== false,
        ...(['previous_night', 'tonight'].includes(item.lodging_anchor || item.lodgingAnchor) ? {
          lodgingAnchor: item.lodging_anchor || item.lodgingAnchor,
          lodgingId: String(item.lodging_id || item.lodgingId || ''),
        } : {}),
      };
    });
}

const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi;
const MARKDOWN_LINK_EXTRACT_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/i;
const BARE_URL_PATTERN = /https?:\/\/[^\s)）\]]+/gi;
const BARE_URL_EXTRACT_PATTERN = /https?:\/\/[^\s)）\]]+/i;
const URL_TRAILING_PUNCTUATION_PATTERN = /[.,，。；;!！?？、)）\]]+$/;

function normalizeHttpUrlToken(value: unknown, allowSearchUnwrap = true): string {
  const raw = String(value || '').trim().replace(URL_TRAILING_PUNCTUATION_PATTERN, '');
  if (!raw) return '';

  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';

    if (allowSearchUnwrap && /(^|\.)google\./i.test(url.hostname)) {
      const searchTarget = url.searchParams.get('q') || url.searchParams.get('url');
      const normalizedSearchTarget = normalizeHttpUrlToken(searchTarget, false);
      if (normalizedSearchTarget) return normalizedSearchTarget;
    }

    return url.toString();
  } catch {
    return '';
  }
}

export function normalizeExternalLinkUrl(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const markdownMatch = raw.match(MARKDOWN_LINK_EXTRACT_PATTERN);
  if (markdownMatch) {
    return normalizeHttpUrlToken(markdownMatch[1]) || normalizeHttpUrlToken(markdownMatch[2]);
  }

  return normalizeHttpUrlToken(raw) || normalizeHttpUrlToken(raw.match(BARE_URL_EXTRACT_PATTERN)?.[0]);
}

function getExternalLinkFallbackLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function normalizeReminderLinkLabel(label: unknown, url: string) {
  const text = String(label || '').trim();
  if (!text || /^https?:\/\//i.test(text)) return getExternalLinkFallbackLabel(url);
  return text;
}

function collectReminderLinksFromText(text: unknown) {
  const links: ReminderLink[] = [];
  const seen = new Set<string>();
  const addLink = (label: unknown, url: unknown) => {
    const normalizedUrl = normalizeExternalLinkUrl(url);
    if (!normalizedUrl || seen.has(normalizedUrl)) return;
    seen.add(normalizedUrl);
    links.push({
      label: normalizeReminderLinkLabel(label, normalizedUrl),
      url: normalizedUrl,
    });
  };

  String(text || '').replace(MARKDOWN_LINK_PATTERN, (_match, label, url) => {
    addLink(label, url);
    return '';
  });
  String(text || '').replace(BARE_URL_PATTERN, (url) => {
    addLink('', url);
    return '';
  });

  return links;
}

function stripLinksFromReminderText(text: unknown) {
  return String(text || '')
    .replace(MARKDOWN_LINK_PATTERN, (_match, label, url) => (normalizeExternalLinkUrl(url) ? label : ''))
    .replace(BARE_URL_PATTERN, '')
    .replace(/（\s*）/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([，。；、,.!?])/g, '$1')
    .trim();
}

function normalizeReminderLinks(item: unknown, text: unknown) {
  const source = isRecord(item) ? item : {};
  const explicitLinks = [
    ...toArray(source.links),
    ...toArray(source.urls),
    ...toArray(source.url || source.link),
  ];
  const seen = new Set<string>();

  return [
    ...explicitLinks.map((link) => {
      if (typeof link === 'string') {
        const url = normalizeExternalLinkUrl(link);
        return url ? { label: getExternalLinkFallbackLabel(url), url } : null;
      }

      if (!isRecord(link)) return null;
      const url = normalizeExternalLinkUrl(link.url || link.href || link.link);
      if (!url) return null;

      return {
        label: normalizeReminderLinkLabel(link.label || link.title || link.name, url),
        url,
      };
    }).filter(Boolean) as ReminderLink[],
    ...collectReminderLinksFromText(text),
  ].filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

export function normalizePlanReminders(value: unknown): PlanReminder[] {
  return toArray(value)
    .map((item, index) => {
      const rawText = typeof item === 'string' ? item : isRecord(item) ? item.text || item.title || item.note || item.description || '' : '';
      const links = normalizeReminderLinks(item, rawText);
      const text = stripLinksFromReminderText(rawText) || links[0]?.label || rawText;

      if (typeof item === 'string' || !isRecord(item)) {
        return { id: `reminder-${index + 1}`, time: '', text, links };
      }

      return {
        id: item.id || `reminder-${index + 1}`,
        time: item.time || item.at || '',
        text,
        links,
      };
    })
    .filter((item) => item.text || item.links.length);
}

export function normalizePlanTips(value: unknown) {
  return toArray(value)
    .map((item) => (typeof item === 'string' ? item : isRecord(item) ? item.text || item.title || item.note || item.description || '' : ''))
    .filter(Boolean);
}

export function normalizeBookingType(value: unknown): BookingType {
  const type = String(value || '').toLowerCase();
  if (['restaurant_reservation', 'restaurant', 'dining', 'meal', 'food', '餐厅', '餐厅预约', '饭店', '食事'].includes(type)) {
    return BookingType.RestaurantReservation;
  }
  if (['ticket', 'train', 'flight', 'boat', 'ferry', 'pass', '票', '车票', '门票'].includes(type)) return BookingType.Ticket;
  if (['confirm', 'confirmation', 'check', 'notice', '确认'].includes(type)) return BookingType.Confirmation;
  return BookingType.Reservation;
}

export function normalizeBookingStatus(value: unknown, item: AnyRecord = {}): BookingStatus {
  if (item.done || item.booked || item.reserved || item.purchased || item.confirmed) return BookingStatus.Done;

  const status = String(value || '').toLowerCase();
  if (['done', 'booked', 'reserved', 'purchased', 'confirmed', 'complete', 'completed', '已预约', '已订票', '已确认'].includes(status)) {
    return BookingStatus.Done;
  }
  if (['none', 'not_needed', 'optional', '无需', '无需预约'].includes(status)) return BookingStatus.None;
  return BookingStatus.Pending;
}

function normalizeBookingItem(item: unknown, index: number, fallbackType: BookingType | string = BookingType.Reservation): PlanBooking | null {
  if (typeof item === 'string') {
    return {
      id: `booking-${index + 1}`,
      type: normalizeBookingType(fallbackType),
      title: item,
      status: BookingStatus.Pending,
      address: '',
      url: '',
      cancelUrl: '',
      note: '',
    };
  }

  if (!isRecord(item)) return null;
  const type = normalizeBookingType(item.type || item.kind || fallbackType);
  const location = isRecord(item.location) ? item.location : null;

  return {
    id: item.id || `booking-${index + 1}`,
    type,
    title: item.title || item.name || item.label || (type === BookingType.Ticket ? '订票' : '预约'),
    status: normalizeBookingStatus(item.status, item),
    address: item.address || item.addr || location?.address || item.place || location?.label || '',
    url: normalizeExternalLinkUrl(item.url || item.link || item.booking_url || item.bookingUrl || item.reserve_url || item.reserveUrl),
    cancelUrl: normalizeExternalLinkUrl(item.cancel_url || item.cancelUrl || item.refund_url || item.refundUrl || item.manage_url || item.manageUrl),
    note: item.note || item.description || item.text || '',
  };
}

export function normalizePlanBookings(plan: AnyRecord): PlanBooking[] {
  const bookings = [
    ...toArray(plan.bookings),
    ...toArray(plan.reservations).map((item) => (
      isRecord(item) ? { ...item, type: item.type || item.kind || BookingType.Reservation } : item
    )),
    ...toArray(plan.appointments).map((item) => (
      isRecord(item) ? { ...item, type: item.type || item.kind || BookingType.Reservation } : item
    )),
    ...toArray(plan.tickets).map((item) => (
      isRecord(item) ? { ...item, type: item.type || item.kind || BookingType.Ticket } : item
    )),
  ];

  return bookings
    .map((item, index) => normalizeBookingItem(item, index))
    .filter((item): item is PlanBooking => Boolean(item?.title));
}

function uniqueLocations(locations: Array<WeatherLocationLike | null | undefined>) {
  const locationsByKey = new Map<string, NormalizedLocation | WeatherLocationLike>();

  locations.filter((location): location is WeatherLocationLike => Boolean(location)).forEach((location) => {
    if (!location.query && !hasCoordinates(location) && !location.label) return;

    const key = getWeatherLocationKey(location);
    if (!locationsByKey.has(key)) {
      locationsByKey.set(key, {
        ...location,
        weatherLabel: getWeatherLocationLabel(location),
      });
    }
  });

  return Array.from(locationsByKey.values());
}

export function getPlanWeatherLocations(plan: Pick<NormalizedPlan, 'stops' | 'location'>) {
  const stopLocations = toArray(plan.stops)
    .filter((stop) => stop.weatherRelevant)
    .map((stop) => stop.location);

  return uniqueLocations([...stopLocations, plan.location]);
}

export function normalizeWeatherRules(plan: AnyRecord): WeatherRules {
  if (plan.weather_rules) {
    const rawBest = toArray<string>(plan.weather_rules.best);
    const rawOk = toArray<string>(plan.weather_rules.ok);
    return {
      best: rawBest.filter((item) => !SEVERE_WEATHER.includes(item as WeatherCondition)),
      ok: uniq([...rawOk, ...rawBest.filter((item) => item === 'heavy_rain')]).filter((item) => !HARD_BLOCKED_WEATHER.includes(item as WeatherCondition)),
      blocked: uniq([...toArray<string>(plan.weather_rules.blocked), ...HARD_BLOCKED_WEATHER]),
    };
  }

  const legacyWeather = toArray<string>(plan.weather);
  const best = legacyWeather.filter((item) => item !== 'any');
  return {
    best: best.length ? best : ['sunny', 'partly_cloudy'],
    ok: legacyWeather.includes('any') ? ['sunny', 'partly_cloudy', 'cloudy', 'drizzle'] : ['cloudy'],
    blocked: ['heavy_rain', 'storm'],
  };
}

export function normalizePlan(planInput: unknown, index = 0, tripDates: TripDateLike[] = []): NormalizedPlan {
  const plan = isRecord(planInput) ? planInput : {};
  const tripDateIds = tripDates.map((date) => date.id);
  const availableDates = toArray<string>(plan.available_dates || plan.suitable_days);
  const priority = plan.must_go || plan.must ? PlanPriority.Must : plan.priority || PlanPriority.Preferred;
  const rawStops = Array.isArray(plan.stops) ? plan.stops : plan.itinerary;
  const firstStopWithLocation = Array.isArray(rawStops)
    ? rawStops.find((stop) => isRecord(stop) && (stop.location || stop.place))
    : null;
  const fallbackLocation = normalizeLocation(plan.location || firstStopWithLocation?.location || firstStopWithLocation?.place, plan.area);
  const stops = normalizePlanStops(rawStops, fallbackLocation);
  const primaryStop = stops.find((stop) => stop.weatherRelevant) || stops[0];
  const location = normalizeLocation(plan.location || primaryStop?.location || fallbackLocation, plan.area);
  const normalizedPriority = PLAN_PRIORITY_VALUES.includes(priority as PlanPriority)
    ? priority as PlanPriority
    : PlanPriority.Preferred;

  return {
    id: plan.id || `plan-${Date.now()}-${index}`,
    name: plan.name || '未命名计划',
    description: plan.description || '暂无说明。',
    priority: normalizedPriority,
    location,
    stops,
    available_dates: availableDates.length ? availableDates : tripDateIds,
    closed_dates: toArray<string>(plan.closed_dates || plan.unavailable_days),
    weather_rules: normalizeWeatherRules(plan),
    conflicts: toArray<string>(plan.conflicts || plan.mutually_exclusive_with),
    reminders: normalizePlanReminders(plan.reminders || plan.special_reminders || plan.alerts),
    tips: normalizePlanTips(plan.tips || plan.hints),
    bookings: normalizePlanBookings(plan),
    ...(normalizePlanLodging(plan.lodging) ? { lodging: normalizePlanLodging(plan.lodging) } : {}),
  };
}

import { QINGDAO_LOCATION, WEIHAI_LOCATION, YANTAI_LOCATION, type NormalizedLocation, type PreferredRouteMode, type StopTransfer } from './plan';
import { DEFAULT_MAP_PREFERENCES, type MapPreferences, type MapProvider, type MapRegion } from './mapPreferences';

export interface MapLink {
  url: string;
  provider: MapProvider | MainlandRouteProvider;
}

export type MapRouteMode = PreferredRouteMode;
export type MainlandRouteProvider = 'apple' | 'tencent';

export interface MainlandRouteLink {
  url: string;
  provider: MainlandRouteProvider;
}

export function inferMapRouteMode(value?: string | null): MapRouteMode | null {
  const mode = String(value || '').trim().toLowerCase();
  if (!mode) return null;
  if (/(walk|步行|散步|徒歩|foot)/.test(mode)) return 'walking';
  if (/(taxi|car|driv|驾|开车|出租|打车|网约车)/.test(mode)) return 'driving';
  if (/(transit|train|rail|metro|subway|tram|bus|ferry|公共|公交|地铁|电车|火车|高铁|巴士|轮渡)/.test(mode)) return 'transit';
  return null;
}

export function getPreferredMapRouteMode(transfer?: Pick<StopTransfer, 'mode' | 'preferredRouteMode'> | null): MapRouteMode | null {
  return transfer?.preferredRouteMode || inferMapRouteMode(transfer?.mode);
}

// Trips saved from the bundled example before countryCode was added still use these city queries.
const LEGACY_MAINLAND_CITY_QUERIES = new Set([
  QINGDAO_LOCATION.query.toLowerCase(), QINGDAO_LOCATION.weatherLabel,
  WEIHAI_LOCATION.query.toLowerCase(), WEIHAI_LOCATION.weatherLabel,
  YANTAI_LOCATION.query.toLowerCase(), YANTAI_LOCATION.weatherLabel,
]);

export function getMapRegion(location?: Partial<NormalizedLocation> | null): MapRegion {
  if (!location) return 'unknown';
  const countryCode = String(location.countryCode || '').trim().toUpperCase();
  if (countryCode) return ['CN', 'CHINA', '中国'].includes(countryCode) ? 'mainlandChina' : 'otherRegions';
  if (LEGACY_MAINLAND_CITY_QUERIES.has(String(location.query || '').trim().toLowerCase())) return 'mainlandChina';
  const placeText = [location.query, location.weatherLabel, location.weather_label, location.address, location.admin1, location.admin2]
    .filter(Boolean).join(' ');
  if (/(?:^|[\s,，])(?:中国|中华人民共和国|China)(?:$|[\s,，])/i.test(placeText)) return 'mainlandChina';
  return 'unknown';
}

export function getMapProvider(location?: Partial<NormalizedLocation> | null, preferences: MapPreferences = DEFAULT_MAP_PREFERENCES): MapProvider {
  return preferences[getMapRegion(location)];
}

export function getLocationSearchText(location?: Partial<NormalizedLocation> | null) {
  if (!location) return '';
  const label = location.label || '';
  const address = location.address || '';
  const weatherLocation = location.weatherLabel || location.weather_label || '';
  return [address, label].filter(Boolean).join(' ') || weatherLocation;
}

export function getLocationCopyText(location?: Partial<NormalizedLocation> | null) {
  if (!location) return '';
  return [location.label, location.address].filter(Boolean).join('\n') || getLocationSearchText(location);
}

export function getGoogleMapsUrl(location?: Partial<NormalizedLocation> | null) {
  const query = getLocationSearchText(location);
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '';
}

export function getGoogleMapsDirectionsUrl(
  origin?: Partial<NormalizedLocation> | null,
  destination?: Partial<NormalizedLocation> | null,
  mode: MapRouteMode = 'transit',
) {
  const originText = getLocationSearchText(origin);
  const destinationText = getLocationSearchText(destination);
  if (!originText || !destinationText) return '';
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originText)}&destination=${encodeURIComponent(destinationText)}&travelmode=${mode}`;
}

export function getAmapDirectionsUrl(
  origin?: Partial<NormalizedLocation> | null,
  destination?: Partial<NormalizedLocation> | null,
  mode: MapRouteMode = 'transit',
) {
  const from = origin?.mapPoint;
  const to = destination?.mapPoint;
  if (!from || !to || from.coordinateSystem !== 'GCJ-02' || to.coordinateSystem !== 'GCJ-02') return '';
  const fromText = `${from.longitude},${from.latitude},${getLocationSearchText(origin)}`;
  const toText = `${to.longitude},${to.latitude},${getLocationSearchText(destination)}`;
  const amapMode = mode === 'transit' ? 'bus' : mode === 'driving' ? 'car' : 'walk';
  return `https://uri.amap.com/navigation?from=${encodeURIComponent(fromText)}&to=${encodeURIComponent(toText)}&mode=${amapMode}&src=plan-gacha&callnative=1`;
}

export function getAppleMapsDirectionsUrl(
  origin?: Partial<NormalizedLocation> | null,
  destination?: Partial<NormalizedLocation> | null,
  mode: 'walking' | 'driving' = 'walking',
) {
  const from = getLocationSearchText(origin);
  const to = getLocationSearchText(destination);
  if (!from || !to) return '';
  return `https://maps.apple.com/?saddr=${encodeURIComponent(from)}&daddr=${encodeURIComponent(to)}&dirflg=${mode === 'walking' ? 'w' : 'd'}`;
}

export function getAppleMapsSearchUrl(location?: Partial<NormalizedLocation> | null) {
  const query = getLocationSearchText(location);
  return query ? `https://maps.apple.com/?q=${encodeURIComponent(query)}` : '';
}

export function getTencentMapsDirectionsUrl(
  origin?: Partial<NormalizedLocation> | null,
  destination?: Partial<NormalizedLocation> | null,
  mode: 'transit' | 'driving' = 'transit',
) {
  const from = origin?.mapPoint;
  const to = destination?.mapPoint;
  if (!from || !to || from.coordinateSystem !== 'GCJ-02' || to.coordinateSystem !== 'GCJ-02') return '';
  const fromName = getLocationSearchText(origin);
  const toName = getLocationSearchText(destination);
  if (!fromName || !toName) return '';
  const type = mode === 'transit' ? 'bus' : 'drive';
  return `https://apis.map.qq.com/uri/v1/routeplan?type=${type}&from=${encodeURIComponent(fromName)}&fromcoord=${from.latitude},${from.longitude}&to=${encodeURIComponent(toName)}&tocoord=${to.latitude},${to.longitude}&referer=plan-gacha`;
}

export function getMainlandRouteAlternative(
  origin: Partial<NormalizedLocation> | null | undefined,
  destination: Partial<NormalizedLocation> | null | undefined,
  mode: MapRouteMode,
): MainlandRouteLink {
  if (getMapRegion(origin) !== 'mainlandChina' || getMapRegion(destination) !== 'mainlandChina') {
    return { url: '', provider: mode === 'walking' ? 'apple' : 'tencent' };
  }
  if (mode === 'walking') return { url: getAppleMapsDirectionsUrl(origin, destination), provider: 'apple' };
  return { url: getTencentMapsDirectionsUrl(origin, destination, mode), provider: 'tencent' };
}

export function getAmapSearchUrl(location?: Partial<NormalizedLocation> | null) {
  const keyword = getLocationSearchText(location);
  return keyword ? `https://uri.amap.com/search?keyword=${encodeURIComponent(keyword)}&view=map&src=plan-gacha` : '';
}

export function getMapSearchLink(location: Partial<NormalizedLocation> | null | undefined, preferences: MapPreferences): MapLink {
  const provider = getMapProvider(location, preferences);
  if (provider === 'recommended') {
    return getMapRegion(location) === 'mainlandChina'
      ? { url: getAppleMapsSearchUrl(location), provider: 'apple' }
      : { url: getGoogleMapsUrl(location), provider: 'google' };
  }
  return {
    url: provider === 'amap' ? getAmapSearchUrl(location) : getGoogleMapsUrl(location),
    provider,
  };
}

export function getMapDirectionsLink(
  origin: Partial<NormalizedLocation> | null | undefined,
  destination: Partial<NormalizedLocation> | null | undefined,
  preferences: MapPreferences,
  mode: MapRouteMode = 'transit',
): MapLink {
  const provider = getMapProvider(destination, preferences);
  const hasBothPlaces = Boolean(getLocationSearchText(origin) && getLocationSearchText(destination));
  if (provider === 'recommended') {
    if (!hasBothPlaces) return { url: '', provider: mode === 'walking' ? 'apple' : 'tencent' };
    if (getMapRegion(origin) === 'mainlandChina' && getMapRegion(destination) === 'mainlandChina') {
      return getMainlandRouteAlternative(origin, destination, mode);
    }
    return { url: getGoogleMapsDirectionsUrl(origin, destination, mode), provider: 'google' };
  }
  if (!hasBothPlaces) return { url: '', provider };
  return {
    url: provider === 'amap' ? getAmapDirectionsUrl(origin, destination, mode) : getGoogleMapsDirectionsUrl(origin, destination, mode),
    provider,
  };
}

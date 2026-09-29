import { QINGDAO_LOCATION, WEIHAI_LOCATION, YANTAI_LOCATION, type NormalizedLocation, type PreferredRouteMode, type StopTransfer } from './plan';
import { DEFAULT_MAP_PREFERENCES, type MapPreferences, type MapProvider, type MapRegion } from './mapPreferences';
import { wgs84ToGcj02 } from './coordinates';

export interface MapLink {
  url: string;
  provider: MapProvider;
}

export type MapRouteMode = PreferredRouteMode;

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

export function getMapProvider(
  location?: Partial<NormalizedLocation> | null,
  preferences: MapPreferences = DEFAULT_MAP_PREFERENCES,
  fallbackRegion: MapRegion = 'unknown',
): MapProvider {
  const region = getMapRegion(location);
  return preferences[region === 'unknown' ? fallbackRegion : region];
}

export function getMapProviderNameKey(provider: MapLink['provider']) {
  if (provider === 'amap') return 'amapName';
  if (provider === 'baidu') return 'baiduMapsName';
  return 'googleMapsName';
}

function getGcjPoint(location?: Partial<NormalizedLocation> | null, fallbackRegion: MapRegion = 'unknown') {
  const point = location?.mapPoint;
  if (!point) return null;
  if (point.coordinateSystem === 'GCJ-02') return point;
  const region = getMapRegion(location);
  return region === 'mainlandChina' || (region === 'unknown' && fallbackRegion === 'mainlandChina')
    ? wgs84ToGcj02(point) : null;
}

function getGoogleRoutePlace(location?: Partial<NormalizedLocation> | null) {
  const point = location?.mapPoint;
  if (point?.coordinateSystem === 'WGS84') return `${point.latitude},${point.longitude}`;
  return getLocationSearchText(location);
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
  via: Partial<NormalizedLocation>[] = [],
) {
  const originText = getGoogleRoutePlace(origin);
  const destinationText = getGoogleRoutePlace(destination);
  if (!originText || !destinationText) return '';
  if (via.length > 3 || (via.length && mode !== 'driving')) return '';
  const waypoints = via.map(getGoogleRoutePlace);
  if (waypoints.some((point) => !point)) return '';
  const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originText)}&destination=${encodeURIComponent(destinationText)}&travelmode=${mode}`
    + (waypoints.length ? `&waypoints=${encodeURIComponent(waypoints.join('|'))}` : '');
  return url.length <= 2048 ? url : '';
}

export function getAmapDirectionsUrl(
  origin?: Partial<NormalizedLocation> | null,
  destination?: Partial<NormalizedLocation> | null,
  mode: MapRouteMode = 'transit',
  via: Partial<NormalizedLocation>[] = [],
) {
  const from = getGcjPoint(origin);
  const to = getGcjPoint(destination);
  if (!from || !to || via.length > 1 || (via.length && mode !== 'driving')) return '';
  const viaRegion = getMapRegion(origin) === 'mainlandChina' && getMapRegion(destination) === 'mainlandChina'
    ? 'mainlandChina' : 'unknown';
  const viaPoint = via.length ? getGcjPoint(via[0], viaRegion) : null;
  if (via.length && !viaPoint) return '';
  const fromText = `${from.longitude},${from.latitude},${getLocationSearchText(origin)}`;
  const toText = `${to.longitude},${to.latitude},${getLocationSearchText(destination)}`;
  const amapMode = mode === 'transit' ? 'bus' : mode === 'driving' ? 'car' : 'walk';
  const viaText = viaPoint ? `&via=${encodeURIComponent(`${viaPoint.longitude},${viaPoint.latitude},${getLocationSearchText(via[0])}`)}` : '';
  return `https://uri.amap.com/navigation?from=${encodeURIComponent(fromText)}&to=${encodeURIComponent(toText)}${viaText}&mode=${amapMode}&src=plan-gacha&callnative=1`;
}

function getBaiduRoutePlace(location: Partial<NormalizedLocation>) {
  const point = getGcjPoint(location);
  if (point) {
    const name = location.label || getLocationSearchText(location);
    return `name:${name}|latlng:${point.latitude},${point.longitude}`;
  }
  return getLocationSearchText(location);
}

function getBaiduRegion(location?: Partial<NormalizedLocation> | null) {
  return String(location?.admin2 || location?.weatherLabel || location?.weather_label || '').trim();
}

export function getBaiduMapsDirectionsUrl(
  origin?: Partial<NormalizedLocation> | null,
  destination?: Partial<NormalizedLocation> | null,
  mode: MapRouteMode = 'transit',
  via: Partial<NormalizedLocation>[] = [],
) {
  if (!origin || !destination || !getLocationSearchText(origin) || !getLocationSearchText(destination) || via.length) return '';
  const params = new URLSearchParams({
    origin: getBaiduRoutePlace(origin),
    destination: getBaiduRoutePlace(destination),
    mode,
    output: 'html',
    src: 'webapp.plan.gacha',
  });
  if (getGcjPoint(origin) || getGcjPoint(destination)) {
    params.set('coord_type', 'gcj02');
  }
  const originRegion = getBaiduRegion(origin);
  const destinationRegion = getBaiduRegion(destination);
  if (originRegion && destinationRegion && originRegion === destinationRegion) params.set('region', originRegion);
  else {
    if (originRegion) params.set('origin_region', originRegion);
    if (destinationRegion) params.set('destination_region', destinationRegion);
  }
  return `https://api.map.baidu.com/direction?${params}`;
}

export function getAmapSearchUrl(location?: Partial<NormalizedLocation> | null) {
  const keyword = getLocationSearchText(location);
  return keyword ? `https://uri.amap.com/search?keyword=${encodeURIComponent(keyword)}&view=map&src=plan-gacha` : '';
}

export function getBaiduMapsSearchUrl(location?: Partial<NormalizedLocation> | null) {
  const query = getLocationSearchText(location);
  if (!query) return '';
  const params = new URLSearchParams({ query, output: 'html', src: 'webapp.plan.gacha' });
  const region = getBaiduRegion(location);
  if (region) params.set('region', region);
  return `https://api.map.baidu.com/place/search?${params}`;
}

export function getMapSearchLink(
  location: Partial<NormalizedLocation> | null | undefined,
  preferences: MapPreferences,
  fallbackRegion: MapRegion = 'unknown',
): MapLink {
  const locationRegion = getMapRegion(location);
  const region = locationRegion === 'unknown' ? fallbackRegion : locationRegion;
  const provider = preferences[region];
  return {
    url: provider === 'amap' ? getAmapSearchUrl(location)
      : provider === 'baidu' ? getBaiduMapsSearchUrl(location) : getGoogleMapsUrl(location),
    provider,
  };
}

export function getMapDirectionsLink(
  origin: Partial<NormalizedLocation> | null | undefined,
  destination: Partial<NormalizedLocation> | null | undefined,
  preferences: MapPreferences,
  mode: MapRouteMode = 'transit',
  via: Partial<NormalizedLocation>[] = [],
): MapLink {
  const provider = getMapProvider(destination, preferences);
  const hasBothPlaces = Boolean(getLocationSearchText(origin) && getLocationSearchText(destination));
  if (!hasBothPlaces) return { url: '', provider };
  return {
    url: provider === 'amap' ? getAmapDirectionsUrl(origin, destination, mode, via)
      : provider === 'baidu' ? getBaiduMapsDirectionsUrl(origin, destination, mode, via)
        : getGoogleMapsDirectionsUrl(origin, destination, mode, via),
    provider,
  };
}

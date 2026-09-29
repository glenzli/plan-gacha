import { describe, expect, it } from 'vitest';
import { getAmapDirectionsUrl, getBaiduMapsDirectionsUrl, getGoogleMapsDirectionsUrl, getMapDirectionsLink, getMapRegion, getMapSearchLink, getPreferredMapRouteMode, inferMapRouteMode } from './locationLinks';
import { wgs84ToGcj02 } from './coordinates';
import { DEFAULT_MAP_PREFERENCES } from './mapPreferences';
import { normalizePlan, QINGDAO_LOCATION } from './plan';

describe('regional map links', () => {
  const china = { label: '故宫博物院', address: '北京市东城区景山前街4号', countryCode: 'CN' };
  const japan = { label: '清水寺', address: '京都市东山区清水1丁目', countryCode: 'JP' };

  it('uses country metadata and leaves unknown locations on Google by default', () => {
    expect(getMapRegion(china)).toBe('mainlandChina');
    expect(getMapRegion(japan)).toBe('otherRegions');
    expect(getMapRegion({ label: 'Central Station' })).toBe('unknown');
    expect(getMapRegion({ label: '栈桥', query: 'Qingdao', weatherLabel: '青岛市' })).toBe('mainlandChina');
    expect(getMapRegion({ label: '栈桥', query: '青岛市', weatherLabel: '青岛市' })).toBe('mainlandChina');
    expect(getMapSearchLink(china, DEFAULT_MAP_PREFERENCES).url).toContain('uri.amap.com/search?keyword=');
    expect(getMapSearchLink(japan, DEFAULT_MAP_PREFERENCES).url).toContain('google.com/maps/search/');
    expect(getMapSearchLink({ label: 'Central Station' }, DEFAULT_MAP_PREFERENCES).provider).toBe('google');
  });

  it('selects Baidu for mainland China without changing Google elsewhere', () => {
    const preferences = { ...DEFAULT_MAP_PREFERENCES, mainlandChina: 'baidu' as const };
    expect(getMapSearchLink(china, preferences).provider).toBe('baidu');
    expect(getMapSearchLink(japan, preferences).provider).toBe('google');
    expect(getMapSearchLink({ label: 'Central Station' }, preferences).provider).toBe('google');
  });

  it('opens Google routes in the selected transport mode and leaves imprecise AMap places to search', () => {
    const google = getMapDirectionsLink({ label: '京都站', countryCode: 'JP' }, japan, DEFAULT_MAP_PREFERENCES);
    expect(google.url).toContain('google.com/maps/dir/?api=1');
    expect(google.url).toContain('travelmode=transit');
    expect(getMapDirectionsLink({ label: '京都站', countryCode: 'JP' }, japan, DEFAULT_MAP_PREFERENCES, 'walking').url)
      .toContain('travelmode=walking');
    expect(getMapDirectionsLink({ label: '京都站', countryCode: 'JP' }, japan, DEFAULT_MAP_PREFERENCES, 'driving').url)
      .toContain('travelmode=driving');

    const amap = getMapDirectionsLink({ label: '北京站', countryCode: 'CN' }, china, DEFAULT_MAP_PREFERENCES);
    expect(amap.url).toBe('');
    expect(getMapSearchLink(china, DEFAULT_MAP_PREFERENCES).url)
      .toContain(encodeURIComponent('北京市东城区景山前街4号 故宫博物院'));
    expect(getMapDirectionsLink(null, china, DEFAULT_MAP_PREFERENCES).url).toBe('');
  });

  it('maps itinerary transport labels to route modes', () => {
    expect(inferMapRouteMode('地铁')).toBe('transit');
    expect(inferMapRouteMode('近铁电车')).toBe('transit');
    expect(inferMapRouteMode('自驾')).toBe('driving');
    expect(inferMapRouteMode('出租车')).toBe('driving');
    expect(inferMapRouteMode('游玩型步行')).toBe('walking');
    expect(inferMapRouteMode('')).toBeNull();
    expect(getPreferredMapRouteMode({ mode: '出租车', preferredRouteMode: 'transit' })).toBe('transit');
    expect(getPreferredMapRouteMode({ mode: '出租车' })).toBe('driving');
  });

  it('uses explicit GCJ-02 stop coordinates for each AMap route mode', () => {
    const origin = { label: '北京站', countryCode: 'CN', mapPoint: { longitude: 116.427, latitude: 39.903, coordinateSystem: 'GCJ-02' as const } };
    const destination = { ...china, mapPoint: { longitude: 116.397, latitude: 39.916, coordinateSystem: 'GCJ-02' as const } };
    for (const [mode, amapMode] of [['transit', 'bus'], ['driving', 'car'], ['walking', 'walk']] as const) {
      const link = getMapDirectionsLink(origin, destination, DEFAULT_MAP_PREFERENCES, mode);
      expect(link.url).toContain('uri.amap.com/navigation?');
      expect(link.url).toContain(`mode=${amapMode}`);
      expect(link.url).toContain(encodeURIComponent('116.427,39.903,北京站'));
      expect(link.url).toContain('callnative=1');
    }
  });

  it('opens Baidu search and all route modes with GCJ-02 coordinates or place names', () => {
    const baidu = { ...DEFAULT_MAP_PREFERENCES, mainlandChina: 'baidu' as const };
    const origin = { label: '青岛站', weatherLabel: '青岛市', countryCode: 'CN', mapPoint: { longitude: 120.312786, latitude: 36.064812, coordinateSystem: 'GCJ-02' as const } };
    const destination = { label: '栈桥景区', weatherLabel: '青岛市', countryCode: 'CN', mapPoint: { longitude: 120.3193, latitude: 36.061736, coordinateSystem: 'GCJ-02' as const } };
    for (const mode of ['transit', 'driving', 'walking'] as const) {
      const link = getMapDirectionsLink(origin, destination, baidu, mode);
      const url = new URL(link.url);
      expect(link.provider).toBe('baidu');
      expect(url.pathname).toBe('/direction');
      expect(url.searchParams.get('origin')).toBe('name:青岛站|latlng:36.064812,120.312786');
      expect(url.searchParams.get('destination')).toBe('name:栈桥景区|latlng:36.061736,120.3193');
      expect(url.searchParams.get('coord_type')).toBe('gcj02');
      expect(url.searchParams.get('mode')).toBe(mode);
      expect(url.searchParams.get('region')).toBe('青岛市');
      expect(url.searchParams.get('output')).toBe('html');
      expect(url.searchParams.get('src')).toBe('webapp.plan.gacha');
    }
    const textRoute = new URL(getMapDirectionsLink(
      { label: '青岛站', countryCode: 'CN' }, { label: '栈桥景区', countryCode: 'CN' }, baidu, 'walking',
    ).url);
    expect(textRoute.searchParams.get('origin')).toBe('青岛站');
    expect(textRoute.searchParams.get('destination')).toBe('栈桥景区');
    expect(textRoute.searchParams.has('coord_type')).toBe(false);

    const hotel = { label: '青岛栈桥青岛站西广场轻居酒店', address: '青岛市观城路57号', weatherLabel: '青岛市' };
    const hotelLink = getMapSearchLink(hotel, baidu, 'mainlandChina');
    const hotelUrl = new URL(hotelLink.url);
    expect(hotelLink.provider).toBe('baidu');
    expect(hotelUrl.pathname).toBe('/place/search');
    expect(hotelUrl.searchParams.get('query')).toBe('青岛市观城路57号 青岛栈桥青岛站西广场轻居酒店');
    expect(hotelUrl.searchParams.get('region')).toBe('青岛市');
    expect(getMapSearchLink({ ...hotel, countryCode: 'JP' }, baidu, 'mainlandChina').provider).toBe('google');
    expect(getMapSearchLink(hotel, DEFAULT_MAP_PREFERENCES, 'mainlandChina').provider).toBe('amap');
  });

  it('keeps one required AMap driving waypoint and refuses routes that would drop it', () => {
    const origin = { label: '栈桥景区', address: '青岛市市南区太平路12号', countryCode: 'CN', mapPoint: { longitude: 120.3193, latitude: 36.061736, coordinateSystem: 'GCJ-02' as const } };
    const destination = { label: '团岛市场', address: '青岛市市南区四川路31号', countryCode: 'CN', mapPoint: { longitude: 120.298243, latitude: 36.061199, coordinateSystem: 'GCJ-02' as const } };
    const via = { label: '沿海路口', countryCode: 'CN', mapPoint: { longitude: 120.31, latitude: 36.06, coordinateSystem: 'GCJ-02' as const } };
    expect(new URL(getAmapDirectionsUrl(origin, destination, 'driving', [via])).searchParams.get('via'))
      .toBe('120.31,36.06,沿海路口');
    expect(getAmapDirectionsUrl(origin, destination, 'walking', [via])).toBe('');
    expect(getAmapDirectionsUrl(origin, destination, 'driving', [via, via])).toBe('');
    expect(getBaiduMapsDirectionsUrl(origin, destination, 'driving', [via])).toBe('');
    const gpsVia = { label: 'GPS 途经点', mapPoint: { longitude: 120.31, latitude: 36.06, coordinateSystem: 'WGS84' as const } };
    const converted = wgs84ToGcj02(gpsVia.mapPoint);
    expect(new URL(getAmapDirectionsUrl(origin, destination, 'driving', [gpsVia])).searchParams.get('via'))
      .toBe(`${converted?.longitude},${converted?.latitude},GPS 途经点`);
  });

  it('converts explicit WGS84 place points for AMap without using weather coordinates', () => {
    const gps = { longitude: 116.404, latitude: 39.915, coordinateSystem: 'WGS84' as const };
    const converted = wgs84ToGcj02(gps);
    expect(converted?.longitude).toBeCloseTo(116.41024449916938, 6);
    expect(converted?.latitude).toBeCloseTo(39.91640428150164, 6);
    expect(wgs84ToGcj02({ longitude: 139.6917, latitude: 35.6895, coordinateSystem: 'WGS84' })).toBeNull();

    const origin = { label: '北京起点', countryCode: 'CN', mapPoint: gps };
    const destination = { label: '北京终点', countryCode: 'CN', mapPoint: { longitude: 116.42, latitude: 39.92, coordinateSystem: 'GCJ-02' as const } };
    expect(new URL(getAmapDirectionsUrl(origin, destination, 'driving')).searchParams.get('from'))
      .toBe(`${converted?.longitude},${converted?.latitude},北京起点`);
    expect(getAmapDirectionsUrl({ ...origin, mapPoint: undefined, latitude: gps.latitude, longitude: gps.longitude }, destination)).toBe('');
  });

  it('opens Google driving routes through ordered waypoints with a mobile-safe limit', () => {
    const origin = { label: 'A', countryCode: 'JP' };
    const destination = { label: 'D', countryCode: 'JP' };
    const via = [{ label: 'B' }, { label: 'C' }];
    const route = new URL(getGoogleMapsDirectionsUrl(origin, destination, 'driving', via));
    expect(route.searchParams.get('travelmode')).toBe('driving');
    expect(route.searchParams.get('waypoints')).toBe('B|C');
    expect(getGoogleMapsDirectionsUrl(origin, destination, 'driving', Array(4).fill(via[0]))).toBe('');
    expect(getGoogleMapsDirectionsUrl(origin, destination, 'transit', via)).toBe('');
  });

  it('marks the bundled China trip as mainland China without treating city coordinates as a stop', () => {
    const plan = normalizePlan({
      id: 'domestic', name: '北京', location: QINGDAO_LOCATION,
      stops: [{ title: '栈桥', location: { label: '栈桥' } }],
    }, 0, [{ id: '2026-09-28' }]);
    expect(getMapRegion(plan.stops[0].location)).toBe('mainlandChina');
    expect(plan.stops[0].location.mapPoint).toBeUndefined();

    const oldPlan = normalizePlan({
      id: 'old-domestic', name: '青岛',
      location: { label: '青岛市', query: 'Qingdao', weatherLabel: '青岛市' },
      stops: [{ title: '栈桥', location: { label: '栈桥' } }],
    }, 0, [{ id: '2026-09-28' }]);
    expect(getMapRegion(oldPlan.stops[0].location)).toBe('mainlandChina');
  });

  it('preserves an explicit stop map point without copying the plan weather coordinates', () => {
    const plan = normalizePlan({
      id: 'domestic-map', name: '北京', location: QINGDAO_LOCATION,
      stops: [
        { title: '甲', location: { label: '甲', map_point: { longitude: 116.4, latitude: 39.9, coordinate_system: 'GCJ-02' } } },
        { title: '乙', location: { label: '乙' } },
      ],
    }, 0, [{ id: '2026-09-28' }]);
    expect(plan.stops[0].location.mapPoint).toEqual({ longitude: 116.4, latitude: 39.9, coordinateSystem: 'GCJ-02' });
    expect(plan.stops[1].location.mapPoint).toBeUndefined();
    expect(getMapDirectionsLink(plan.stops[0].location, plan.stops[1].location, DEFAULT_MAP_PREFERENCES).url).toBe('');
  });
});

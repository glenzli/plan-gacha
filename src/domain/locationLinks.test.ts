import { describe, expect, it } from 'vitest';
import { getMainlandRouteAlternative, getMapDirectionsLink, getMapRegion, getMapSearchLink, getPreferredMapRouteMode, inferMapRouteMode } from './locationLinks';
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

  it('uses the selected provider for each region', () => {
    const preferences = { mainlandChina: 'google', otherRegions: 'amap', unknown: 'amap' } as const;
    expect(getMapSearchLink(china, preferences).provider).toBe('google');
    expect(getMapSearchLink(japan, preferences).provider).toBe('amap');
    expect(getMapSearchLink({ label: 'Central Station' }, preferences).provider).toBe('amap');
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

  it('offers mode-correct mainland alternatives without sending GCJ-02 coordinates to Apple Maps', () => {
    const origin = { label: '栈桥景区', address: '青岛市市南区太平路12号', countryCode: 'CN', mapPoint: { longitude: 120.3193, latitude: 36.061736, coordinateSystem: 'GCJ-02' as const } };
    const destination = { label: '团岛市场', address: '青岛市市南区四川路31号', countryCode: 'CN', mapPoint: { longitude: 120.298243, latitude: 36.061199, coordinateSystem: 'GCJ-02' as const } };
    const walking = getMainlandRouteAlternative(origin, destination, 'walking');
    expect(walking.provider).toBe('apple');
    expect(walking.url).toContain('maps.apple.com/?saddr=');
    expect(walking.url).toContain('dirflg=w');
    expect(walking.url).not.toContain('120.3193');

    for (const [mode, type] of [['transit', 'bus'], ['driving', 'drive']] as const) {
      const link = getMainlandRouteAlternative(origin, destination, mode);
      expect(link.provider).toBe('tencent');
      expect(link.url).toContain(`type=${type}`);
      expect(link.url).toContain('fromcoord=36.061736,120.3193');
      expect(link.url).toContain('tocoord=36.061199,120.298243');
    }
    expect(getMainlandRouteAlternative(origin, { ...destination, countryCode: 'JP' }, 'walking').url).toBe('');
    const recommended = { ...DEFAULT_MAP_PREFERENCES, mainlandChina: 'recommended' as const };
    expect(getMapSearchLink(origin, recommended)).toEqual({
      provider: 'apple',
      url: expect.stringContaining('maps.apple.com/?q='),
    });
    expect(getMapDirectionsLink(origin, destination, recommended, 'walking').provider).toBe('apple');
    expect(getMapDirectionsLink(origin, destination, recommended, 'transit').provider).toBe('tencent');
    expect(getMapDirectionsLink(origin, destination, recommended, 'driving').provider).toBe('tencent');
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

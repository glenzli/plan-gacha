import { describe, expect, it } from 'vitest';
import { createExamplePlans } from './exampleData';
import { getMapDirectionsLink, inferMapRouteMode } from './locationLinks';
import { DEFAULT_MAP_PREFERENCES } from './mapPreferences';
import { normalizePlan } from './plan';

describe('bundled trip example', () => {
  const plans = createExamplePlans('2026-09-28')
    .map((plan, index) => normalizePlan(plan, index, [{ id: '2026-09-28' }]));

  it('has a precise AMap point and usable direct route for every leg', () => {
    for (const plan of plans) {
      expect(plan.stops.length).toBeGreaterThan(1);
      expect(plan.stops[0].transferFromPrevious).toBeNull();
      for (const [index, stop] of plan.stops.entries()) {
        expect(stop.location.mapPoint?.coordinateSystem, `${plan.id}: ${stop.title}`).toBe('GCJ-02');
        if (index === 0) continue;
        const previous = plan.stops[index - 1];
        expect(stop.transferFromPrevious?.departAt, `${plan.id}: ${stop.title}`).toBeTruthy();
        expect(stop.transferFromPrevious?.duration, `${plan.id}: ${stop.title}`).toBeTruthy();
        const mode = inferMapRouteMode(stop.transferFromPrevious?.mode);
        expect(mode, `${plan.id}: ${stop.title}`).not.toBeNull();
        expect(stop.transferFromPrevious?.preferredRouteMode, `${plan.id}: ${stop.title}`).toBe(mode);
        expect(getMapDirectionsLink(previous.location, stop.location, DEFAULT_MAP_PREFERENCES, mode!).url)
          .toContain('uri.amap.com/navigation?');
      }
    }
  });

  it('keeps Penglai weather lookup separate from route coordinates', () => {
    const penglai = plans.find((plan) => plan.id === 'yantai-penglai-backup');
    expect(penglai?.stops[2].location.latitude).toBe(37.817);
    expect(penglai?.stops[2].location.mapPoint?.latitude).toBe(37.824795);
    expect(penglai?.stops.at(-1)?.location.label).toBe('烟台站');
  });
});

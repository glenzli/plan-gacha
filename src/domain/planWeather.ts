import { getPlanWeatherLocations, getWeatherLocationKey, type NormalizedPlan } from './plan';
import { buildAggregatedWeatherSnapshot, buildWeatherSnapshot, evaluateWeatherForSnapshot, type WeatherSnapshot, type WeatherEvaluation } from './weather';
import type { WeatherDataMap } from '../types/weatherData';

export function getPlanWeatherSnapshot(plan: NormalizedPlan, dateId: string, weatherData: WeatherDataMap) {
  const snapshots = getPlanWeatherLocations(plan)
    .map((location) => {
      const key = getWeatherLocationKey(location);
      const autoDay = weatherData[key]?.dailyByDate?.[dateId];
      const snapshot = buildWeatherSnapshot(autoDay);
      return snapshot ? { location, snapshot } : null;
    })
    .filter((entry): entry is { location: ReturnType<typeof getPlanWeatherLocations>[number]; snapshot: WeatherSnapshot } => Boolean(entry));

  if (!snapshots.length) return null;
  return buildAggregatedWeatherSnapshot(snapshots);
}

export function evaluateWeather(plan: NormalizedPlan, dateId: string, weatherData: WeatherDataMap, language: string = 'zh'): WeatherEvaluation {
  const snapshot = getPlanWeatherSnapshot(plan, dateId, weatherData);
  return evaluateWeatherForSnapshot(plan, snapshot, language);
}


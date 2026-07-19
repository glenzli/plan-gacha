import type { ForecastDayLike } from '../domain/weather';

export interface WeatherCacheEntry {
  dailyByDate?: Record<string, ForecastDayLike | null | undefined>;
  fetchedAt?: number | string;
  [key: string]: unknown;
}

export type WeatherDataMap = Record<string, WeatherCacheEntry>;

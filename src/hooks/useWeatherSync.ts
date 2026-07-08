import { useCallback, useEffect, useRef, useState } from 'react';
import { STORAGE_KEYS } from '../domain/appStorage';
import { formatWeatherUpdateWarning } from '../domain/dayInsight';
import { getPlanWeatherLocations, getWeatherLocationKey, type NormalizedPlan } from '../domain/plan';
import {
  WEATHER_CACHE_HIT_KEY,
  WEATHER_ERRORS_KEY,
  fetchWeatherForPlans,
} from '../domain/weatherService';
import type { DisplayTripDate } from '../domain/display';
import type { TranslateFn } from '../types/ui';
import type { WeatherDataMap } from '../types/weatherData';

const WEATHER_BATCH_TIMEOUT_MS = 60000;

type WeatherFetchResult = WeatherDataMap & {
  [WEATHER_ERRORS_KEY]?: string[];
  [WEATHER_CACHE_HIT_KEY]?: boolean;
};

interface UseWeatherSyncOptions {
  initialWeatherData: WeatherDataMap;
  language: string;
  normalizedPlans: NormalizedPlan[];
  notify: (message: string) => void;
  startDateStr: string;
  t: TranslateFn;
  tripDates: DisplayTripDate[];
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function useWeatherSync({
  initialWeatherData,
  language,
  normalizedPlans,
  notify,
  startDateStr,
  t,
  tripDates,
}: UseWeatherSyncOptions) {
  const [weatherData, setWeatherData] = useState<WeatherDataMap>(initialWeatherData);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const autoWeatherKeyRef = useRef('');
  const weatherRequestIdRef = useRef(0);
  const weatherDataRef = useRef<WeatherDataMap>(initialWeatherData);

  useEffect(() => {
    weatherDataRef.current = weatherData;
  }, [weatherData]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.weatherCache, JSON.stringify(weatherData));
  }, [weatherData]);

  const refreshWeather = useCallback(async () => {
    if (!tripDates.length) return;
    const requestId = weatherRequestIdRef.current + 1;
    weatherRequestIdRef.current = requestId;
    setWeatherLoading(true);
    setWeatherError('');
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      if (weatherRequestIdRef.current !== requestId) return;
      timedOut = true;
      setWeatherLoading(false);
      setWeatherError(t('weatherTimeout'));
    }, WEATHER_BATCH_TIMEOUT_MS);

    try {
      const nextWeatherData = await fetchWeatherForPlans(
        normalizedPlans,
        tripDates,
        startDateStr,
        weatherDataRef.current,
        { forceRefresh: true },
      ) as WeatherFetchResult;
      if (!timedOut && weatherRequestIdRef.current === requestId) {
        setWeatherData(nextWeatherData);
        const warning = formatWeatherUpdateWarning(nextWeatherData[WEATHER_ERRORS_KEY] || [], language);
        setWeatherError(warning);
        notify(nextWeatherData[WEATHER_CACHE_HIT_KEY]
          ? t('weatherCacheValid')
          : warning
            ? t('weatherUpdatedPartial')
            : t('weatherUpdated'));
      }
    } catch (error) {
      if (!timedOut && weatherRequestIdRef.current === requestId) {
        const message = getErrorMessage(error);
        setWeatherError(message);
        notify(message);
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (!timedOut && weatherRequestIdRef.current === requestId) setWeatherLoading(false);
    }
  }, [language, normalizedPlans, notify, startDateStr, t, tripDates]);

  const clearWeatherError = useCallback(() => {
    setWeatherError('');
  }, []);

  const clearWeatherData = useCallback(() => {
    weatherRequestIdRef.current += 1;
    autoWeatherKeyRef.current = '';
    weatherDataRef.current = {};
    localStorage.removeItem(STORAGE_KEYS.weatherCache);
    setWeatherData({});
    setWeatherError('');
  }, []);

  useEffect(() => {
    if (!tripDates.length || !normalizedPlans.length || !window.navigator.onLine) return undefined;

    const lastDateId = tripDates[tripDates.length - 1]?.id;
    const locationKey = normalizedPlans
      .flatMap((plan) => getPlanWeatherLocations(plan))
      .map((location) => getWeatherLocationKey(location))
      .sort()
      .join('|');
    const autoWeatherKey = `${startDateStr}|${lastDateId}|${locationKey}`;

    if (autoWeatherKeyRef.current === autoWeatherKey) return undefined;
    autoWeatherKeyRef.current = autoWeatherKey;

    const requestId = weatherRequestIdRef.current + 1;
    weatherRequestIdRef.current = requestId;
    let cancelled = false;
    let timedOut = false;
    let settled = false;
    setWeatherLoading(true);
    setWeatherError('');
    const timeoutId = window.setTimeout(() => {
      if (weatherRequestIdRef.current !== requestId) return;
      timedOut = true;
      if (!cancelled) {
        setWeatherLoading(false);
        setWeatherError(t('autoWeatherTimeout'));
      }
    }, WEATHER_BATCH_TIMEOUT_MS);

    fetchWeatherForPlans(normalizedPlans, tripDates, startDateStr, weatherDataRef.current)
      .then((nextWeatherData) => {
        if (!cancelled && !timedOut && weatherRequestIdRef.current === requestId) {
          const weatherResult = nextWeatherData as WeatherFetchResult;
          setWeatherData(weatherResult);
          setWeatherError(formatWeatherUpdateWarning(weatherResult[WEATHER_ERRORS_KEY] || [], language));
        }
      })
      .catch((error) => {
        if (!cancelled && !timedOut && weatherRequestIdRef.current === requestId) {
          setWeatherError(t('autoWeatherFailed', { message: getErrorMessage(error) }));
        }
      })
      .finally(() => {
        settled = true;
        window.clearTimeout(timeoutId);
        if (!cancelled && !timedOut && weatherRequestIdRef.current === requestId) setWeatherLoading(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      if (!settled && autoWeatherKeyRef.current === autoWeatherKey) autoWeatherKeyRef.current = '';
      if (weatherRequestIdRef.current === requestId) setWeatherLoading(false);
    };
  }, [language, normalizedPlans, startDateStr, t, tripDates]);

  return {
    weatherData,
    setWeatherData,
    clearWeatherData,
    weatherLoading,
    weatherError,
    refreshWeather,
    clearWeatherError,
  };
}

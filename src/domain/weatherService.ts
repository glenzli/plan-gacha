import {
  getPlanWeatherLocations,
  getWeatherLocationKey,
  hasCoordinates,
  type NormalizedPlan,
  type TripDateLike,
} from './plan';
import { getWeatherLocationLabel, type WeatherLocationLike } from './weather';

const WEATHER_FETCH_TIMEOUT_MS = 20000;
const WEATHER_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const WEATHER_FETCH_CONCURRENCY = 4;
const WEATHER_DEBUG_STORAGE_KEY = 'planGacha.weatherDebug';
const weatherTranslationCache = new Map<string, string[]>();

export const WEATHER_ERRORS_KEY = Symbol('weatherErrors');
export const WEATHER_CACHE_HIT_KEY = Symbol('weatherCacheHit');

type AnyRecord = Record<string, any>;
type WeatherLocation = WeatherLocationLike & AnyRecord;

interface FetchWeatherForPlansOptions {
  forceRefresh?: boolean;
}

function isWeatherDebugEnabled() {
  if (typeof window === 'undefined') return false;

  try {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get('weatherDebug') === '1' ||
      params.get('debugWeather') === '1' ||
      window.localStorage.getItem(WEATHER_DEBUG_STORAGE_KEY) === '1'
    );
  } catch {
    return false;
  }
}

function logWeatherDebug(event: string, detail: AnyRecord = {}) {
  if (!isWeatherDebugEnabled()) return;
  console.info(`[plan-gacha:weather] ${event}`, detail);
}

function summarizeLocation(location: WeatherLocation = {}) {
  return {
    key: getWeatherLocationKey(location),
    label: getWeatherLocationLabel(location),
    query: location.query || '',
    weatherLabel: location.weatherLabel || location.weather_label || '',
    latitude: location.latitude,
    longitude: location.longitude,
    countryCode: location.countryCode || location.country_code || '',
    admin1: location.admin1 || '',
    admin2: location.admin2 || '',
    address: location.address || '',
    hasCoordinates: hasCoordinates(location),
  };
}

function summarizeGeocodeResult(result: AnyRecord | null) {
  if (!result) return null;
  return {
    name: result.name,
    countryCode: result.country_code,
    admin1: result.admin1,
    admin2: result.admin2 || result.admin3,
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone,
  };
}

function summarizeDailyByDate(dailyByDate: AnyRecord, dates: string[]) {
  return Object.fromEntries(
    dates.map((dateId) => {
      const day = dailyByDate?.[dateId] || {};
      return [
        dateId,
        {
          code: day.weatherCode,
          min: day.tempMin,
          max: day.tempMax,
          rain: day.precipitationProbability,
          wind: day.windMax,
        },
      ];
    }),
  );
}

function uniq<T>(values: T[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

const WEATHER_QUERY_CHAR_ALIASES: Record<string, string> = {
  长: '長',
  户: '戸',
  广: '広',
  岛: '島',
  滨: '浜',
  泽: '沢',
  龟: '亀',
  德: '徳',
  黑: '黒',
  乡: '郷',
  館: '館',
  阪: '阪',
};

const WEATHER_LOCATION_FALLBACKS: Record<string, WeatherLocation> = {
  大和郡山市: { weatherLabel: '大和郡山市', latitude: 34.6498, longitude: 135.7826, timezone: 'Asia/Tokyo' },
  箕面市: { weatherLabel: '箕面市', latitude: 34.8269, longitude: 135.4705, timezone: 'Asia/Tokyo' },
  京都市: { weatherLabel: '京都市', latitude: 35.0116, longitude: 135.7681, timezone: 'Asia/Tokyo' },
  京都市下京区: { weatherLabel: '京都市下京区', latitude: 34.9876, longitude: 135.7555, timezone: 'Asia/Tokyo' },
  大阪市: { weatherLabel: '大阪市', latitude: 34.6937, longitude: 135.5023, timezone: 'Asia/Tokyo' },
  大阪市北区: { weatherLabel: '大阪市北区', latitude: 34.7054, longitude: 135.4983, timezone: 'Asia/Tokyo' },
  河内長野市: { weatherLabel: '河内長野市', latitude: 34.4587, longitude: 135.5642, timezone: 'Asia/Tokyo' },
  kawachinagano: { weatherLabel: '河内長野市', latitude: 34.4587, longitude: 135.5642, timezone: 'Asia/Tokyo' },
  草津市: { weatherLabel: '草津市', latitude: 35.0131, longitude: 135.9598, timezone: 'Asia/Tokyo' },
  神戸市: { weatherLabel: '神戸市', latitude: 34.6901, longitude: 135.1955, timezone: 'Asia/Tokyo' },
  神戸市中央区: { weatherLabel: '神戸市中央区', latitude: 34.6951, longitude: 135.1979, timezone: 'Asia/Tokyo' },
  和歌山市: { weatherLabel: '和歌山市', latitude: 34.2305, longitude: 135.1708, timezone: 'Asia/Tokyo' },
};

export function normalizeWeatherSearchText(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, '')
    .replace(/[，、,].*$/, '')
    .replace(/[區]/g, '区')
    .replace(/[県]/g, '県')
    .replace(/[长户广岛滨泽龟德黑乡]/g, (char) => WEATHER_QUERY_CHAR_ALIASES[char] || char);
}

function getCountryNameFromCode(countryCode?: string) {
  const normalized = String(countryCode || '').trim().toUpperCase();
  if (normalized === 'JP') return 'Japan';
  if (normalized === 'CN') return 'China';
  if (normalized === 'KR') return 'South Korea';
  if (normalized === 'TW') return 'Taiwan';
  if (normalized === 'TH') return 'Thailand';
  if (normalized === 'SG') return 'Singapore';
  return normalized;
}

function expandWeatherSearchTerm(term: unknown, location: WeatherLocation = {}) {
  const value = String(term || '').trim();
  if (!value) return [];

  const countryName = getCountryNameFromCode(location.countryCode);
  const variants = [
    value,
    value.split(',')[0],
  ];

  if (location.admin1) {
    variants.push(`${value}, ${location.admin1}`);
    if (countryName) variants.push(`${value}, ${location.admin1}, ${countryName}`);
  }

  if (countryName) variants.push(`${value}, ${countryName}`);

  const normalized = normalizeWeatherSearchText(value);
  if (normalized && normalized !== value) variants.push(normalized);

  return variants;
}

function getWeatherSearchTerms(location: WeatherLocation) {
  const label = getWeatherLocationLabel(location);
  const rawTerms = uniq([
    location.query,
    label,
    location.admin2,
    location.admin1 && label ? `${label}, ${location.admin1}` : '',
    location.admin1 && location.countryCode ? `${label}, ${location.admin1}, ${getCountryNameFromCode(location.countryCode)}` : '',
    location.address,
    location.query?.split(',')[0],
  ]).filter(Boolean);

  const terms: string[] = [];
  rawTerms.forEach((term) => {
    const normalized = normalizeWeatherSearchText(term);
    terms.push(...expandWeatherSearchTerm(term, location), normalized);

    const cityMatch = normalized.match(/^(.+?市).+区$/);
    if (cityMatch) terms.push(cityMatch[1]);

    if (normalized.endsWith('市')) terms.push(normalized.slice(0, -1));
  });

  return uniq(terms);
}

function getWeatherLocationFallback(location: WeatherLocation) {
  const terms = getWeatherSearchTerms(location);
  const matchedTerm = terms.find((term) => WEATHER_LOCATION_FALLBACKS[normalizeWeatherSearchText(term)]);
  if (!matchedTerm) return null;

  const fallback = WEATHER_LOCATION_FALLBACKS[normalizeWeatherSearchText(matchedTerm)];
  return {
    ...location,
    ...fallback,
    query: fallback.weatherLabel,
    weatherLabel: getWeatherLocationLabel(location) || fallback.weatherLabel,
  };
}

function parseForecastDaily(data: AnyRecord) {
  const daily = data.daily || {};
  const times = daily.time || [];

  return Object.fromEntries(
    times.map((dateId: string, index: number) => [
      dateId,
      {
        dateId,
        weatherCode: daily.weather_code?.[index],
        tempMax: daily.temperature_2m_max?.[index],
        tempMin: daily.temperature_2m_min?.[index],
        apparentMax: daily.apparent_temperature_max?.[index],
        apparentMin: daily.apparent_temperature_min?.[index],
        precipitationSum: daily.precipitation_sum?.[index],
        precipitationProbability: daily.precipitation_probability_max?.[index],
        windMax: daily.wind_speed_10m_max?.[index],
        cloudCover: daily.cloud_cover_mean?.[index],
      },
    ]),
  );
}

function isWeatherCacheFresh(entry: AnyRecord, tripDates: TripDateLike[]) {
  if (!entry?.dailyByDate || !entry.fetchedAt) return false;

  const fetchedAt = new Date(entry.fetchedAt).getTime();
  if (!Number.isFinite(fetchedAt)) return false;
  if (Date.now() - fetchedAt > WEATHER_CACHE_TTL_MS) return false;

  return tripDates.every((date) => Boolean(entry.dailyByDate[date.id]));
}

async function fetchJson(url: URL, errorPrefix: string) {
  const controller = new AbortController();
  const requestUrl = url.toString();
  const timeoutId = window.setTimeout(() => controller.abort(), WEATHER_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(requestUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`${errorPrefix}失败`);
    return await response.json();
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`${errorPrefix}超时`, { cause: error });
    }
    if (error instanceof TypeError) {
      const host = new URL(requestUrl).host;
      throw new Error(`${errorPrefix}失败：无法连接 ${host}，可能是当前网络、DNS 或浏览器拦截导致。`, { cause: error });
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function translateWeatherSearchTerm(term: string) {
  const normalizedTerm = normalizeWeatherSearchText(term);
  if (!normalizedTerm || !Array.from(normalizedTerm).some((char) => char.charCodeAt(0) > 127)) return [];
  if (weatherTranslationCache.has(normalizedTerm)) return weatherTranslationCache.get(normalizedTerm) || [];

  const translatedTerms = [];
  const languagePairs = ['zh|en', 'ja|en'];

  for (const langpair of languagePairs) {
    try {
      const translateUrl = new URL('https://api.mymemory.translated.net/get');
      translateUrl.searchParams.set('q', normalizedTerm);
      translateUrl.searchParams.set('langpair', langpair);
      const data = await fetchJson(translateUrl, `地点翻译：${normalizedTerm}`);
      const translated = data?.responseData?.translatedText?.trim();
      if (translated && translated !== normalizedTerm && !translated.includes('MYMEMORY')) {
        translatedTerms.push(translated);
      }
    } catch {
      // Translation is only a fallback; keep the weather update path non-blocking.
    }
  }

  const result = uniq(translatedTerms);
  weatherTranslationCache.set(normalizedTerm, result);
  return result;
}

function scoreGeocodeResult(result: AnyRecord, term: string, location: WeatherLocation = {}) {
  const normalizedTerm = normalizeWeatherSearchText(term);
  const name = normalizeWeatherSearchText(result.name);
  const admin1 = normalizeWeatherSearchText(result.admin1);
  const admin2 = normalizeWeatherSearchText(result.admin2 || result.admin3);
  const countryCode = String(location.countryCode || '').trim().toUpperCase();
  let score = 0;

  if (name && normalizedTerm) {
    if (name === normalizedTerm) score += 90;
    else if (normalizedTerm.includes(name) || name.includes(normalizedTerm)) score += 55;
  }

  if (countryCode) {
    score += String(result.country_code || '').toUpperCase() === countryCode ? 80 : -80;
  }

  if (location.admin1) {
    const expectedAdmin1 = normalizeWeatherSearchText(location.admin1);
    if (expectedAdmin1 && admin1) {
      if (admin1 === expectedAdmin1) score += 55;
      else if (admin1.includes(expectedAdmin1) || expectedAdmin1.includes(admin1)) score += 30;
      else score -= 45;
    }
  }

  if (location.admin2) {
    const expectedAdmin2 = normalizeWeatherSearchText(location.admin2);
    if (expectedAdmin2 && admin2) {
      if (admin2 === expectedAdmin2) score += 35;
      else if (admin2.includes(expectedAdmin2) || expectedAdmin2.includes(admin2)) score += 18;
      else score -= 30;
    }
  }

  return score;
}

async function geocodeWeatherSearchTerms(searchTerms: string[], resolvedLabel: string, location: WeatherLocation = {}) {
  const languages = uniq(['zh', 'ja', 'en']);
  let bestResult: AnyRecord | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const term of searchTerms) {
    if (!String(term || '').trim()) continue;
    for (const geoLanguage of languages) {
      const geoUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
      geoUrl.searchParams.set('name', term);
      geoUrl.searchParams.set('count', '10');
      geoUrl.searchParams.set('language', geoLanguage);
      geoUrl.searchParams.set('format', 'json');
      const countryCode = String(location.countryCode || '').trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(countryCode)) {
        geoUrl.searchParams.set('countryCode', countryCode);
      }
      const geoData = await fetchJson(geoUrl, `地点查询：${resolvedLabel}`);
      const results = geoData.results || [];
      for (const result of results as AnyRecord[]) {
        const score = scoreGeocodeResult(result, term, location);
        if (score > bestScore) {
          bestResult = result;
          bestScore = score;
        }
      }

      if (bestScore >= 135) return bestResult;
    }
  }

  return bestScore >= 20 ? bestResult : null;
}

async function fetchWeatherForLocation(
  location: WeatherLocation,
  startDateStr: string,
  endDate: string,
  debugDates: string[] = [],
) {
  const forecastDates = debugDates.length ? debugDates : [startDateStr, endDate].filter(Boolean);
  let resolved = location;
  logWeatherDebug('location:start', {
    startDate: startDateStr,
    endDate,
    location: summarizeLocation(location),
  });

  if (!hasCoordinates(resolved)) {
    const resolvedLabel = getWeatherLocationLabel(resolved);
    const searchTerms = getWeatherSearchTerms(resolved);
    let first: AnyRecord | null = null;
    let geocodeError: unknown = null;

    logWeatherDebug('geocode:start', {
      label: resolvedLabel,
      countryCode: resolved.countryCode || resolved.country_code || '',
      searchTerms,
    });

    try {
      first = await geocodeWeatherSearchTerms(searchTerms, resolvedLabel, resolved);
      logWeatherDebug('geocode:primary-result', {
        label: resolvedLabel,
        result: summarizeGeocodeResult(first),
      });

      if (!first) {
        const translatedTerms: string[] = [];
        for (const term of searchTerms.slice(0, 3)) {
          translatedTerms.push(...await translateWeatherSearchTerm(term));
        }
        logWeatherDebug('geocode:translated-terms', {
          label: resolvedLabel,
          translatedTerms: uniq(translatedTerms),
        });
        first = await geocodeWeatherSearchTerms(uniq(translatedTerms), resolvedLabel, resolved);
        logWeatherDebug('geocode:translated-result', {
          label: resolvedLabel,
          result: summarizeGeocodeResult(first),
        });
      }
    } catch (error) {
      geocodeError = error;
      logWeatherDebug('geocode:error', {
        label: resolvedLabel,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    if (first) {
      resolved = {
        ...resolved,
        weatherLabel: resolved.weatherLabel || `${first.name}${first.admin1 ? `, ${first.admin1}` : ''}`,
        latitude: first.latitude,
        longitude: first.longitude,
        timezone: first.timezone,
        countryCode: resolved.countryCode || first.country_code,
        admin1: resolved.admin1 || first.admin1,
        admin2: resolved.admin2 || first.admin2,
      };
      logWeatherDebug('geocode:resolved', {
        original: summarizeLocation(location),
        resolved: summarizeLocation(resolved),
        result: summarizeGeocodeResult(first),
      });
    } else {
      const fallback = getWeatherLocationFallback(resolved);
      if (fallback) {
        resolved = fallback;
        logWeatherDebug('geocode:fallback', {
          original: summarizeLocation(location),
          fallback: summarizeLocation(resolved),
        });
      } else if (geocodeError) {
        throw geocodeError;
      } else {
        logWeatherDebug('geocode:not-found', {
          label: resolvedLabel,
          searchTerms,
        });
        throw new Error(`找不到地点：${resolvedLabel}`);
      }
    }
  } else {
    logWeatherDebug('geocode:skip-coordinates', {
      location: summarizeLocation(resolved),
    });
  }

  const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
  forecastUrl.searchParams.set('latitude', String(resolved.latitude));
  forecastUrl.searchParams.set('longitude', String(resolved.longitude));
  forecastUrl.searchParams.set(
    'daily',
    [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'apparent_temperature_max',
      'apparent_temperature_min',
      'precipitation_sum',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'cloud_cover_mean',
    ].join(','),
  );
  forecastUrl.searchParams.set('timezone', 'auto');
  forecastUrl.searchParams.set('start_date', startDateStr);
  forecastUrl.searchParams.set('end_date', endDate);

  logWeatherDebug('forecast:request', {
    location: summarizeLocation(resolved),
    startDate: startDateStr,
    endDate,
  });

  const forecastData = await fetchJson(forecastUrl, `天气查询：${getWeatherLocationLabel(resolved)}`);
  const dailyByDate = parseForecastDaily(forecastData);

  logWeatherDebug('forecast:success', {
    location: summarizeLocation(resolved),
    days: summarizeDailyByDate(dailyByDate, forecastDates),
  });

  return {
    ...resolved,
    label: getWeatherLocationLabel(resolved),
    dailyByDate,
    fetchedAt: new Date().toISOString(),
  };
}

async function mapSettledWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<TResult>,
) {
  const results = new Array<PromiseSettledResult<TResult>>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      try {
        results[currentIndex] = {
          status: 'fulfilled',
          value: await mapper(items[currentIndex], currentIndex),
        };
      } catch (error) {
        results[currentIndex] = {
          status: 'rejected',
          reason: error,
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

export async function fetchWeatherForPlans(
  normalizedPlans: NormalizedPlan[],
  tripDates: TripDateLike[],
  startDateStr: string,
  cachedWeatherData: Record<string, any> = {},
  options: FetchWeatherForPlansOptions = {},
) {
  if (!tripDates.length) return {};

  const endDate = tripDates[tripDates.length - 1].id;
  const locationsByKey = new Map<string, WeatherLocation>();

  normalizedPlans.forEach((plan) => {
    getPlanWeatherLocations(plan).forEach((location) => {
      if (!location.query && !hasCoordinates(location)) return;

      const key = getWeatherLocationKey(location);
      if (!locationsByKey.has(key)) {
        locationsByKey.set(key, {
          ...location,
          weatherLabel: getWeatherLocationLabel(location),
        });
      }
    });
  });

  const uniqueLocations = Array.from(locationsByKey.values());
  const nextWeatherData: Record<string, any> = {};
  const locationsToFetch: WeatherLocation[] = [];

  logWeatherDebug('batch:start', {
    forceRefresh: Boolean(options.forceRefresh),
    startDate: startDateStr,
    endDate,
    tripDates: tripDates.map((date) => date.id),
    locations: uniqueLocations.map((location) => {
      const key = getWeatherLocationKey(location);
      const cachedEntry = cachedWeatherData[key];
      return {
        ...summarizeLocation(location),
        hasCached: Boolean(cachedEntry?.dailyByDate),
        cacheFresh: isWeatherCacheFresh(cachedEntry, tripDates),
        cachedAt: cachedEntry?.fetchedAt || '',
      };
    }),
  });

  uniqueLocations.forEach((location) => {
    const key = getWeatherLocationKey(location);
    const cachedEntry = cachedWeatherData[key];

    if (!options.forceRefresh && isWeatherCacheFresh(cachedEntry, tripDates)) {
      nextWeatherData[key] = cachedEntry;
      logWeatherDebug('batch:cache-hit', {
        location: summarizeLocation(location),
        cachedAt: cachedEntry.fetchedAt,
      });
      return;
    }

    locationsToFetch.push(location);
  });

  const results = await mapSettledWithConcurrency(
    locationsToFetch,
    WEATHER_FETCH_CONCURRENCY,
    async (location) => ({
      key: getWeatherLocationKey(location),
      label: getWeatherLocationLabel(location),
      data: await fetchWeatherForLocation(location, startDateStr, endDate, tripDates.map((date) => date.id)),
    }),
  );

  const errors: string[] = [];

  results.forEach((result, index) => {
    const location = locationsToFetch[index];
    const key = getWeatherLocationKey(location);

    if (result.status === 'fulfilled') {
      nextWeatherData[result.value.key] = result.value.data;
      return;
    }

    const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
    const cachedEntry = cachedWeatherData[key];
    if (!options.forceRefresh && cachedEntry?.dailyByDate) nextWeatherData[key] = cachedEntry;
    errors.push(`${getWeatherLocationLabel(location)}：${reason}`);
    logWeatherDebug('batch:location-error', {
      location: summarizeLocation(location),
      reason,
      usedCachedFallback: Boolean(!options.forceRefresh && cachedEntry?.dailyByDate),
    });
  });

  if (!Object.keys(nextWeatherData).length && errors.length) {
    throw new Error(errors.join('；'));
  }

  Object.defineProperty(nextWeatherData, WEATHER_ERRORS_KEY, {
    value: errors,
    enumerable: false,
  });
  Object.defineProperty(nextWeatherData, WEATHER_CACHE_HIT_KEY, {
    value: !options.forceRefresh && locationsToFetch.length === 0 && uniqueLocations.length > 0,
    enumerable: false,
  });

  logWeatherDebug('batch:done', {
    forceRefresh: Boolean(options.forceRefresh),
    fetched: locationsToFetch.length,
    returned: Object.keys(nextWeatherData),
    errors,
  });

  return nextWeatherData;
}

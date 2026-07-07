export type Language = 'zh' | 'en' | string;

export type WeatherCondition =
  | 'unknown'
  | 'sunny'
  | 'partly_cloudy'
  | 'cloudy'
  | 'drizzle'
  | 'rain'
  | 'heavy_rain'
  | 'storm'
  | 'fog'
  | 'hot'
  | 'cold'
  | 'windy';

export type WeatherLevel = 'unknown' | 'blocked' | 'best' | 'ok' | 'mismatch' | string;

export interface WeatherLocationLike {
  weatherLabel?: string;
  weather_label?: string;
  city?: string;
  district?: string;
  area?: string;
  query?: string;
  label?: string;
  latitude?: number;
  longitude?: number;
}

export interface WeatherSnapshot {
  primary?: WeatherCondition;
  categories?: WeatherCondition[];
  entries?: Array<{
    location?: WeatherLocationLike;
    snapshot?: WeatherSnapshot | null;
  }>;
  tempMin?: number;
  tempMax?: number;
  precipitationProbability?: number;
  windMax?: number;
  summary?: string;
}

export interface TripDateLike {
  id: string;
  dayNumber: number;
}

export interface WeatherEvaluation {
  level: WeatherLevel;
  label?: string;
  snapshot: WeatherSnapshot | null;
}

export interface WeatherOverviewPlan {
  id: string;
  name: string;
}

export interface WeatherOverviewOptions<TPlan extends WeatherOverviewPlan> {
  tripDates: TripDateLike[];
  schedule: Record<string, { planId?: string } | null | undefined>;
  plansById: Map<string, TPlan>;
  evaluateWeather: (plan: TPlan, dateId: string) => WeatherEvaluation;
  language?: Language;
}

export interface ForecastDayLike {
  weatherCode?: number;
  tempMin?: number;
  tempMax?: number;
  apparentMin?: number;
  apparentMax?: number;
  precipitationSum?: number;
  precipitationProbability?: number;
  windMax?: number;
}

export interface WeatherRuleSetLike {
  best?: string[];
  ok?: string[];
  blocked?: string[];
}

export interface WeatherStopLike {
  title?: string;
  note?: string;
  weatherRelevant?: boolean;
  location?: WeatherLocationLike;
}

export interface WeatherPlanLike {
  name?: string;
  description?: string;
  tips?: string[];
  stops?: WeatherStopLike[];
  weather_rules?: WeatherRuleSetLike;
}

export const WEATHER_LABELS = {
  zh: {
    unknown: '未知',
    sunny: '晴',
    partly_cloudy: '少云',
    cloudy: '阴',
    drizzle: '小雨',
    rain: '雨',
    heavy_rain: '大雨',
    storm: '雷雨',
    fog: '雾',
    hot: '热',
    cold: '冷',
    windy: '大风',
  },
  en: {
    unknown: 'Unknown',
    sunny: 'Sunny',
    partly_cloudy: 'Partly cloudy',
    cloudy: 'Cloudy',
    drizzle: 'Drizzle',
    rain: 'Rain',
    heavy_rain: 'Heavy rain',
    storm: 'Storm',
    fog: 'Fog',
    hot: 'Hot',
    cold: 'Cold',
    windy: 'Windy',
  },
} as const;

export const WEATHER_STATUS_LABELS = {
  zh: {
    unknown: '天气待确认',
    blocked: '天气不合适',
    best: '天气很适合',
    ok: '天气可以',
    mismatch: '天气一般',
  },
  en: {
    unknown: 'Weather pending',
    blocked: 'Weather unsuitable',
    best: 'Great weather',
    ok: 'Weather works',
    mismatch: 'Weather is okay',
  },
} as const;

export const WEATHER_ICON_SYMBOLS = {
  sunny: '晴',
  partly_cloudy: '多云',
  cloudy: '阴',
  drizzle: '小雨',
  rain: '雨',
  heavy_rain: '大雨',
  storm: '雷雨',
  fog: '雾',
  hot: '高温',
  cold: '低温',
  windy: '风',
  unknown: '?',
} as const satisfies Record<WeatherCondition, string>;

const WEATHER_ICON_PRIORITY: WeatherCondition[] = [
  'storm',
  'heavy_rain',
  'rain',
  'drizzle',
  'windy',
  'fog',
  'hot',
  'cold',
  'sunny',
  'partly_cloudy',
  'cloudy',
];

export const HARD_BLOCKED_WEATHER: WeatherCondition[] = ['storm'];
export const SEVERE_WEATHER: WeatherCondition[] = ['storm', 'heavy_rain'];
export const SOFT_RAIN_WEATHER: WeatherCondition[] = ['drizzle', 'rain'];
export const RAIN_PROBABILITY_NOTICE = 31;
export const RAIN_PROBABILITY_BLOCK = 51;
export const RAIN_PROBABILITY_HIGH = 70;

const INDOOR_HINTS = ['室内', '馆内', '博物馆', '美术馆', '水族馆', '展馆', '商场', '购物', '咖啡', '餐厅', '避暑', '避雨', 'indoor', 'museum', 'aquarium', 'mall', 'shopping', 'cafe'];
const OUTDOOR_HINTS = ['户外', '室外', '森林', '瀑布', '溪谷', '溪流', '徒步', '远足', '散步', '公园', '湖畔', '海边', '海岸', '山', '露天', 'outside', 'outdoor', 'forest', 'waterfall', 'hike', 'trail', 'park', 'walk', 'lake', 'beach', 'coast', 'mountain'];

function normalizeLanguage(language: Language = 'zh'): 'zh' | 'en' {
  return language === 'en' ? 'en' : 'zh';
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function hasCategory(categories: string[], values: string[]) {
  return categories.some((category) => values.includes(category));
}

function includesAnyKeyword(text: string, keywords: string[]) {
  const normalized = String(text || '').toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function numberOrZero(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

export function getWeatherLabel(condition: WeatherCondition | string, language: Language = 'zh') {
  const labels = WEATHER_LABELS[normalizeLanguage(language)] as Record<string, string>;
  return labels[condition] || condition || labels.unknown;
}

export function getWeatherStatusLabel(level: WeatherLevel, language: Language = 'zh') {
  const labels = WEATHER_STATUS_LABELS[normalizeLanguage(language)] as Record<string, string>;
  return labels[level] || level;
}

export function getWeatherIconCondition(snapshot?: WeatherSnapshot | null): WeatherCondition {
  if (!snapshot) return 'unknown';
  if (Array.isArray(snapshot.entries) && snapshot.entries.length) {
    const conditions = snapshot.entries.map((entry) => getWeatherIconCondition(entry.snapshot));
    return WEATHER_ICON_PRIORITY.find((condition) => conditions.includes(condition)) || conditions[0] || 'unknown';
  }

  return snapshot.primary || 'unknown';
}

export function getWeatherIconLabel(condition: WeatherCondition | string) {
  return WEATHER_ICON_SYMBOLS[condition as WeatherCondition] || WEATHER_ICON_SYMBOLS.unknown;
}

export function classifyWeatherCode(code: number | undefined): WeatherCondition {
  if (code === 0) return 'sunny';
  if (code === 1 || code === 2) return 'partly_cloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (typeof code === 'number' && code >= 51 && code <= 57) return 'drizzle';
  if (typeof code === 'number' && [61, 63, 66, 67, 80, 81].includes(code)) return 'rain';
  if (code === 65 || code === 82) return 'heavy_rain';
  if (typeof code === 'number' && code >= 71 && code <= 86) return 'cold';
  if (typeof code === 'number' && code >= 95) return 'storm';
  return 'unknown';
}

export function pickPrimaryWeatherCategory(categories: WeatherCondition[]): WeatherCondition {
  return WEATHER_ICON_PRIORITY.find((condition) => categories.includes(condition)) || categories[0] || 'unknown';
}

export function getWeatherLocationLabel(location?: WeatherLocationLike) {
  if (!location) return '';
  return location.weatherLabel || location.weather_label || location.city || location.district || location.area || location.query || location.label || '';
}

export function formatWeatherDataMetrics(
  tempMin: number,
  tempMax: number,
  precipitationProbability: number | undefined,
  windMax: number | undefined,
  language: Language = 'zh',
) {
  const precipLabel = language === 'en' ? 'Rain ' : '降水';
  const windLabel = language === 'en' ? 'Wind ' : '风';
  return `${Math.round(tempMin)}-${Math.round(tempMax)}°C / ${precipLabel}${Math.round(precipitationProbability || 0)}% / ${windLabel}${Math.round(windMax || 0)}km/h`;
}

export function formatWeatherMetrics(
  primary: WeatherCondition | string,
  tempMin: number,
  tempMax: number,
  precipitationProbability: number | undefined,
  windMax: number | undefined,
  language: Language = 'zh',
) {
  return `${getWeatherLabel(primary, language)} ${formatWeatherDataMetrics(tempMin, tempMax, precipitationProbability, windMax, language)}`;
}

export function formatWeatherSummary(snapshot?: WeatherSnapshot | null, language: Language = 'zh'): string {
  if (!snapshot) return '';
  if (Array.isArray(snapshot.entries) && snapshot.entries.length) {
    return snapshot.entries
      .map((entry) => `${getWeatherLocationLabel(entry.location)} ${formatWeatherSummary(entry.snapshot, language)}`)
      .join(language === 'en' ? '; ' : '；');
  }

  if (Number.isFinite(snapshot.tempMin) && Number.isFinite(snapshot.tempMax)) {
    return formatWeatherMetrics(
      snapshot.primary || 'unknown',
      snapshot.tempMin as number,
      snapshot.tempMax as number,
      snapshot.precipitationProbability,
      snapshot.windMax,
      language,
    );
  }

  return snapshot.summary || '';
}

export function formatWeatherDataSummary(snapshot?: WeatherSnapshot | null, language: Language = 'zh'): string {
  if (!snapshot) return '';
  if (Array.isArray(snapshot.entries) && snapshot.entries.length) {
    return snapshot.entries
      .map((entry) => `${getWeatherLocationLabel(entry.location)} ${formatWeatherDataSummary(entry.snapshot, language)}`)
      .join(language === 'en' ? '; ' : '；');
  }

  if (Number.isFinite(snapshot.tempMin) && Number.isFinite(snapshot.tempMax)) {
    return formatWeatherDataMetrics(
      snapshot.tempMin as number,
      snapshot.tempMax as number,
      snapshot.precipitationProbability,
      snapshot.windMax,
      language,
    );
  }

  return snapshot.summary || '';
}

export function buildWeatherSnapshot(day?: ForecastDayLike | null, language: Language = 'zh'): WeatherSnapshot | null {
  if (!day) return null;

  const precipitationSum = numberOrZero(day.precipitationSum);
  const precipitationProbability = numberOrZero(day.precipitationProbability);
  const tempMin = numberOrZero(day.tempMin);
  const tempMax = numberOrZero(day.tempMax);
  const apparentMin = numberOrZero(day.apparentMin);
  const apparentMax = numberOrZero(day.apparentMax);
  const windMax = numberOrZero(day.windMax);
  const categories = new Set<WeatherCondition>([classifyWeatherCode(day.weatherCode)]);

  if (tempMax >= 32 || apparentMax >= 34) categories.add('hot');
  if (tempMin <= 5 || apparentMin <= 3) categories.add('cold');
  if (windMax >= 35) categories.add('windy');
  if (precipitationSum >= 12) categories.add('heavy_rain');
  if (precipitationSum > 0 && precipitationSum < 4 && precipitationProbability >= RAIN_PROBABILITY_NOTICE) categories.add('drizzle');
  if (precipitationSum >= 4 && precipitationSum < 12) categories.add('rain');
  if (precipitationProbability >= RAIN_PROBABILITY_HIGH && !categories.has('heavy_rain')) categories.add('rain');

  const normalizedCategories = Array.from(categories);
  const primary = pickPrimaryWeatherCategory(normalizedCategories);

  return {
    primary,
    categories: normalizedCategories,
    tempMin: Math.round(tempMin),
    tempMax: Math.round(tempMax),
    precipitationProbability: Math.round(precipitationProbability),
    windMax: Math.round(windMax),
    summary: formatWeatherMetrics(primary, tempMin, tempMax, precipitationProbability, windMax, language),
  };
}

export function buildAggregatedWeatherSnapshot(
  entries: Array<{ location?: WeatherLocationLike; snapshot: WeatherSnapshot }>,
): WeatherSnapshot | null {
  if (!entries.length) return null;
  if (entries.length === 1) return entries[0].snapshot;

  const categories = uniq(entries.flatMap((entry) => entry.snapshot.categories || [entry.snapshot.primary || 'unknown']));
  const summary = entries
    .map(({ location, snapshot }) => `${getWeatherLocationLabel(location)} ${snapshot.summary || formatWeatherSummary(snapshot)}`.trim())
    .join('；');

  return {
    primary: pickPrimaryWeatherCategory(categories),
    categories,
    summary,
    entries,
  };
}

export function getSnapshotPrecipitationProbability(snapshot?: WeatherSnapshot | null): number {
  if (!snapshot) return 0;
  if (snapshot.entries?.length) {
    return Math.max(...snapshot.entries.map((entry) => getSnapshotPrecipitationProbability(entry.snapshot)));
  }
  return Number.isFinite(snapshot.precipitationProbability) ? Number(snapshot.precipitationProbability) : 0;
}

export function getRainRisk(snapshot?: WeatherSnapshot | null) {
  const categories = snapshot?.categories || [];
  const precipitationProbability = getSnapshotPrecipitationProbability(snapshot);
  const hasSoftRain = hasCategory(categories, SOFT_RAIN_WEATHER);

  if (hasCategory(categories, ['storm', 'heavy_rain'])) return 'severe';
  if (!hasSoftRain && precipitationProbability < RAIN_PROBABILITY_HIGH) return 'none';
  if (precipitationProbability >= RAIN_PROBABILITY_BLOCK) return 'high';
  if (precipitationProbability >= RAIN_PROBABILITY_NOTICE) return 'notice';
  return hasSoftRain ? 'low' : 'none';
}

export function getPlanWeatherExposure(plan: WeatherPlanLike) {
  const stops = Array.isArray(plan.stops) ? plan.stops : [];
  const tips = Array.isArray(plan.tips) ? plan.tips : [];
  const headlineText = [plan.name, plan.description].join(' ');
  const detailText = [...tips, ...stops.flatMap((stop) => [stop.title, stop.note, stop.location?.label])].join(' ');
  const stopTexts = stops.map((stop) => [stop.title, stop.note, stop.location?.label].join(' '));
  const outdoorScore = (
    (includesAnyKeyword(headlineText, OUTDOOR_HINTS) ? 3 : 0) +
    stopTexts.filter((text) => includesAnyKeyword(text, OUTDOOR_HINTS)).length +
    stops.filter((stop) => stop.weatherRelevant).length
  );
  const indoorScore = (
    (includesAnyKeyword(headlineText, INDOOR_HINTS) ? 2 : 0) +
    (includesAnyKeyword(detailText, INDOOR_HINTS) ? 1 : 0) +
    stopTexts.filter((text) => includesAnyKeyword(text, INDOOR_HINTS)).length
  );

  if (outdoorScore >= indoorScore + 1) return 'outdoor';
  if (indoorScore >= outdoorScore + 2) return 'indoor';
  return 'mixed';
}

export function evaluateWeatherForSnapshot(
  plan: WeatherPlanLike,
  snapshot?: WeatherSnapshot | null,
  language: Language = 'zh',
): WeatherEvaluation {
  if (!snapshot) return { level: 'unknown', label: getWeatherStatusLabel('unknown', language), snapshot: null };

  const categories = snapshot.categories || [snapshot.primary || 'unknown'];
  const { best = [], ok = [], blocked = [] } = plan.weather_rules || {};
  const exposure = getPlanWeatherExposure(plan);
  const rainRisk = getRainRisk(snapshot);
  const hasHardWeather = hasCategory(categories, HARD_BLOCKED_WEATHER);
  const hasSevereWeather = hasCategory(categories, SEVERE_WEATHER);
  const hasSoftRainRuleBlock = categories.some((category) => SOFT_RAIN_WEATHER.includes(category) && blocked.includes(category));
  const hasStrictRuleBlock = categories.some((category) => (
    !SOFT_RAIN_WEATHER.includes(category) &&
    !SEVERE_WEATHER.includes(category) &&
    blocked.includes(category)
  ));

  if ((hasSevereWeather || rainRisk === 'severe') && exposure === 'outdoor') {
    return { level: 'blocked', label: getWeatherStatusLabel('blocked', language), snapshot };
  }

  if ((hasSevereWeather || rainRisk === 'severe') && exposure === 'indoor') {
    return { level: 'ok', label: getWeatherStatusLabel('ok', language), snapshot };
  }

  if ((hasHardWeather || hasSevereWeather || rainRisk === 'severe') && exposure === 'mixed') {
    return { level: 'mismatch', label: getWeatherStatusLabel('mismatch', language), snapshot };
  }

  if (rainRisk === 'high' && exposure === 'outdoor') {
    return { level: 'blocked', label: getWeatherStatusLabel('blocked', language), snapshot };
  }

  if (rainRisk === 'high' && exposure === 'mixed') {
    return { level: 'mismatch', label: getWeatherStatusLabel('mismatch', language), snapshot };
  }

  if (rainRisk === 'notice' && exposure !== 'indoor') {
    return { level: 'mismatch', label: getWeatherStatusLabel('mismatch', language), snapshot };
  }

  if (hasSoftRainRuleBlock && rainRisk === 'high' && exposure !== 'indoor') {
    const level = exposure === 'outdoor' ? 'blocked' : 'mismatch';
    return { level, label: getWeatherStatusLabel(level, language), snapshot };
  }

  if ((hasStrictRuleBlock || hasSoftRainRuleBlock) && exposure === 'indoor') {
    return { level: 'ok', label: getWeatherStatusLabel('ok', language), snapshot };
  }

  if (hasStrictRuleBlock && exposure !== 'indoor') {
    return { level: 'blocked', label: getWeatherStatusLabel('blocked', language), snapshot };
  }

  if (categories.some((category) => best.includes(category))) {
    return { level: 'best', label: getWeatherStatusLabel('best', language), snapshot };
  }

  if (ok.includes('any') || categories.some((category) => ok.includes(category))) {
    return { level: 'ok', label: getWeatherStatusLabel('ok', language), snapshot };
  }

  return { level: 'mismatch', label: getWeatherStatusLabel('mismatch', language), snapshot };
}

export function getWeatherOverviewGroup(condition: WeatherCondition) {
  if (condition === 'sunny' || condition === 'partly_cloudy') return 'clear';
  if (condition === 'drizzle' || condition === 'rain' || condition === 'heavy_rain') return 'rain';
  if (condition === 'storm') return 'storm';
  if (condition === 'cloudy') return 'cloudy';
  if (condition === 'hot') return 'hot';
  if (condition === 'cold') return 'cold';
  if (condition === 'fog') return 'fog';
  if (condition === 'windy') return 'wind';
  return 'unknown';
}

export function formatWeatherOverviewStatus(rows: Array<{ level: WeatherLevel }>, language: Language = 'zh') {
  const suitable = rows.filter((row) => row.level === 'best' || row.level === 'ok').length;
  const notice = rows.filter((row) => row.level === 'mismatch').length;
  const blocked = rows.filter((row) => row.level === 'blocked').length;
  const unknown = rows.filter((row) => row.level === 'unknown').length;

  if (language === 'en') {
    return [
      suitable ? `${suitable} usable` : '',
      notice ? `${notice} not ideal` : '',
      blocked ? `${blocked} unsuitable` : '',
      unknown ? `${unknown} unknown` : '',
    ].filter(Boolean).join(', ');
  }

  return [
    suitable ? `${suitable} 天可用` : '',
    notice ? `${notice} 天一般` : '',
    blocked ? `${blocked} 天不合适` : '',
    unknown ? `${unknown} 天待确认` : '',
  ].filter(Boolean).join('，');
}

function formatWeatherOverviewPart(
  group: string,
  rows: Array<{ date: TripDateLike }>,
  language: Language = 'zh',
) {
  const count = rows.length;
  const dayLabels = rows.map((row) => `D${row.date.dayNumber}`);
  const shouldListDays = count <= 3 || ['rain', 'storm', 'hot', 'cold', 'fog', 'wind', 'unknown'].includes(group);

  if (language === 'en') {
    const labels: Record<string, string> = {
      clear: 'clear/cloudy',
      cloudy: 'overcast',
      rain: 'rain',
      storm: 'storm',
      hot: 'hot',
      cold: 'cold',
      fog: 'fog',
      wind: 'windy',
      unknown: 'unknown',
    };
    if (shouldListDays) return `${dayLabels.join(', ')} ${labels[group] || group}`;
    return `${count} ${count === 1 ? 'day' : 'days'} ${labels[group] || group}`;
  }

  const labels: Record<string, string> = {
    clear: '晴/多云',
    cloudy: '阴天',
    rain: '有雨',
    storm: '雷雨',
    hot: '高温',
    cold: '低温',
    fog: '有雾',
    wind: '风大',
    unknown: '待确认',
  };
  if (shouldListDays) return `${dayLabels.join('、')} ${labels[group] || group}`;
  return `${count} 天${labels[group] || group}`;
}

export function buildWeatherOverview<TPlan extends WeatherOverviewPlan>({
  tripDates,
  schedule,
  plansById,
  evaluateWeather,
  language = 'zh',
}: WeatherOverviewOptions<TPlan>) {
  const scheduledRows = tripDates
    .map((date) => {
      const plan = plansById.get(schedule[date.id]?.planId || '');
      if (!plan) return null;
      const weather = evaluateWeather(plan, date.id);
      const condition = getWeatherIconCondition(weather.snapshot);
      return {
        date,
        plan,
        level: weather.level,
        condition,
        snapshot: weather.snapshot,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (!scheduledRows.length) {
    return {
      summary: language === 'en'
        ? 'No scheduled days yet. Weather overview will appear after days are assigned.'
        : '还没有已安排日期，安排后会按地点生成天气概览。',
    };
  }

  const rowsWithWeather = scheduledRows.filter((row) => row.snapshot);
  if (!rowsWithWeather.length) {
    return {
      summary: language === 'en'
        ? `${scheduledRows.length}/${tripDates.length} days scheduled. No weather fetched yet.`
        : `已排 ${scheduledRows.length}/${tripDates.length} 天，尚未获取天气。`,
    };
  }

  const groupRows = rowsWithWeather.reduce((rowsByGroup, row) => {
    const group = getWeatherOverviewGroup(row.condition);
    rowsByGroup.set(group, [...(rowsByGroup.get(group) || []), row]);
    return rowsByGroup;
  }, new Map<string, typeof rowsWithWeather>());
  const conditionSummary = ['clear', 'cloudy', 'rain', 'storm', 'hot', 'cold', 'fog', 'wind', 'unknown']
    .map((group) => {
      const rows = groupRows.get(group);
      return rows?.length ? formatWeatherOverviewPart(group, rows, language) : '';
    })
    .filter(Boolean)
    .join(language === 'en' ? ', ' : '，');
  const statusSummary = formatWeatherOverviewStatus(scheduledRows, language);
  const summary = language === 'en'
    ? `${scheduledRows.length}/${tripDates.length} days scheduled: ${conditionSummary || 'weather available'}.${statusSummary ? ` ${statusSummary}.` : ''}`
    : `已排 ${scheduledRows.length}/${tripDates.length} 天：${conditionSummary || '已获取天气'}。${statusSummary ? `${statusSummary}。` : ''}`;

  return { summary };
}

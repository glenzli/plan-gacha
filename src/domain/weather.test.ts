import { describe, expect, it } from 'vitest';
import {
  buildWeatherOverview,
  buildWeatherSnapshot,
  classifyWeatherCode,
  evaluateWeatherForSnapshot,
  formatWeatherDataSummary,
  formatWeatherSummary,
  getRainRisk,
  getWeatherIconCondition,
  type WeatherCondition,
  type WeatherEvaluation,
  type WeatherOverviewPlan,
} from './weather';

const tripDates = Array.from({ length: 10 }, (_, index) => ({
  id: `2026-07-${String(index + 10).padStart(2, '0')}`,
  dayNumber: index + 1,
}));

function snapshot(primary: WeatherCondition, precipitationProbability = 0) {
  return {
    primary,
    categories: [primary],
    tempMin: 22,
    tempMax: 28,
    precipitationProbability,
    windMax: 12,
  };
}

describe('weather display helpers', () => {
  it('keeps weather condition in the badge and removes it from metric text', () => {
    const rainy = snapshot('drizzle', 42);

    expect(formatWeatherSummary(rainy, 'zh')).toBe('小雨 22-28°C / 降水42% / 风12km/h');
    expect(formatWeatherDataSummary(rainy, 'zh')).toBe('22-28°C / 降水42% / 风12km/h');
  });

  it('uses the highest priority condition for multi-place plans', () => {
    expect(getWeatherIconCondition({
      entries: [
        { location: { label: 'Osaka' }, snapshot: snapshot('cloudy') },
        { location: { label: 'Kyoto' }, snapshot: snapshot('storm', 80) },
      ],
    })).toBe('storm');
  });
});

describe('weather evaluation', () => {
  it('classifies Open-Meteo weather codes and high precipitation risk', () => {
    expect(classifyWeatherCode(95)).toBe('storm');
    expect(classifyWeatherCode(65)).toBe('heavy_rain');

    const highRain = buildWeatherSnapshot({
      weatherCode: 3,
      tempMin: 23,
      tempMax: 28,
      apparentMin: 23,
      apparentMax: 29,
      precipitationProbability: 75,
      precipitationSum: 0,
      windMax: 12,
    });

    expect(highRain?.primary).toBe('rain');
    expect(highRain?.categories).toContain('rain');
    expect(getRainRisk(highRain)).toBe('high');
  });

  it('blocks severe weather for outdoor plans but allows indoor plans', () => {
    const storm = snapshot('storm', 80);
    const outdoorPlan = {
      name: '森林瀑布徒步',
      description: '主打户外溪谷和森林步行。',
      weather_rules: { best: ['sunny'], ok: ['cloudy', 'drizzle'], blocked: ['heavy_rain', 'storm'] },
      stops: [{ title: '瀑布步道', note: '户外徒步', weatherRelevant: true, location: { label: 'Minoh Falls' } }],
      tips: [],
    };
    const indoorPlan = {
      name: '京都铁路博物馆',
      description: '全天候室内展馆。',
      weather_rules: { best: ['sunny'], ok: ['any'], blocked: ['heavy_rain', 'storm'] },
      stops: [{ title: '馆内参观', note: '室内避雨', weatherRelevant: false, location: { label: 'Museum' } }],
      tips: ['室内活动'],
    };

    expect(evaluateWeatherForSnapshot(outdoorPlan, storm, 'zh').level).toBe('blocked');
    expect(evaluateWeatherForSnapshot(indoorPlan, storm, 'zh').level).toBe('ok');
  });
});

describe('weather overview', () => {
  it('summarizes scheduled days and lists rainy D-days inline', () => {
    const plans = new Map<string, WeatherOverviewPlan>(
      Array.from({ length: 8 }, (_, index) => [`p${index + 1}`, { id: `p${index + 1}`, name: `Plan ${index + 1}` }]),
    );
    const schedule = Object.fromEntries(
      tripDates.slice(0, 8).map((date, index) => [date.id, { planId: `p${index + 1}` }]),
    );
    const byDate = new Map<string, WeatherEvaluation>(
      tripDates.slice(0, 8).map((date, index) => [
        date.id,
        {
          level: 'ok',
          snapshot: index >= 6 ? snapshot('rain', 65) : snapshot('cloudy', 10),
        },
      ]),
    );

    expect(buildWeatherOverview({
      tripDates,
      schedule,
      plansById: plans,
      language: 'zh',
      evaluateWeather: (_plan, dateId) => byDate.get(dateId) as WeatherEvaluation,
    }).summary).toBe('已排 8/10 天：6 天阴天，D7、D8 有雨。8 天可用。');
  });

  it('reports an empty weather state before fetching', () => {
    const plans = new Map([['p1', { id: 'p1', name: 'Plan 1' }]]);

    expect(buildWeatherOverview({
      tripDates,
      schedule: { [tripDates[0].id]: { planId: 'p1' } },
      plansById: plans,
      language: 'zh',
      evaluateWeather: () => ({ level: 'unknown', snapshot: null }),
    }).summary).toBe('已排 1/10 天，尚未获取天气。');
  });
});

// @ts-nocheck
import { getDateHardIssues } from './planning';
import {
  getPlanWeatherLocations,
  getWeatherLocationKey,
} from './plan';
import {
  buildAggregatedWeatherSnapshot,
  buildWeatherSnapshot,
  evaluateWeatherForSnapshot,
  formatWeatherDataSummary,
  getWeatherIconCondition,
} from './weather';
import {
  DEFAULT_LANGUAGE,
  translate,
  translateIssue,
} from './display';

export function getPlanWeatherSnapshot(plan, dateId, weatherData) {
  const snapshots = getPlanWeatherLocations(plan)
    .map((location) => {
      const key = getWeatherLocationKey(location);
      const autoDay = weatherData[key]?.dailyByDate?.[dateId];
      const snapshot = buildWeatherSnapshot(autoDay);
      return snapshot ? { location, snapshot } : null;
    })
    .filter(Boolean);

  if (!snapshots.length) return null;
  return buildAggregatedWeatherSnapshot(snapshots);
}

export function evaluateWeather(plan, dateId, weatherData, language = DEFAULT_LANGUAGE) {
  const snapshot = getPlanWeatherSnapshot(plan, dateId, weatherData);
  return evaluateWeatherForSnapshot(plan, snapshot, language);
}

export function getDayInsight(plan, dateId, schedule, plansById, weatherData, language = DEFAULT_LANGUAGE) {
  if (!plan) {
    return {
      level: 'empty',
      label: '',
      weatherText: translate('temporarySlot', language),
      riskText: '',
      issueCount: 0,
    };
  }

  const weather = evaluateWeather(plan, dateId, weatherData, language);
  const issues = getDateHardIssues(plan, dateId, schedule, plansById, weatherData, evaluateWeather, {
    ignoreOccupancy: true,
  });
  const hasHardIssue = issues.length > 0;
  const isCritical = hasHardIssue && plan.priority === 'must';
  const weatherText = weather.snapshot ? formatWeatherDataSummary(weather.snapshot, language) : translate('noWeather', language);
  const weatherCondition = getWeatherIconCondition(weather.snapshot);

  return {
    level: isCritical ? 'critical' : hasHardIssue ? 'danger' : weather.level,
    label: hasHardIssue ? translate('adjustRecommended', language) : '',
    weatherText,
    weatherCondition,
    riskText: issues[0] ? translateIssue(issues[0], language) : (weather.level === 'mismatch' ? translate('weatherNotIdeal', language) : weather.level === 'unknown' ? translate('confirmWeather', language) : ''),
    riskTone: issues.length ? 'danger' : weather.level === 'mismatch' || weather.level === 'unknown' ? 'notice' : '',
    issueCount: issues.length,
  };
}

export function getCalendarDayState(plan, insight, language = DEFAULT_LANGUAGE) {
  if (!plan) return { key: 'empty', label: '', ariaLabel: translate('assignedAriaEmpty', language) };

  if (insight.issueCount > 0 || ['danger', 'critical'].includes(insight.level)) {
    return { key: 'adjust', label: translate('adjust', language), ariaLabel: translate('assignedAriaAdjust', language) };
  }

  if (['blocked', 'unknown', 'mismatch'].includes(insight.level)) {
    return { key: 'notice', label: '', ariaLabel: translate('assignedAriaNotice', language) };
  }

  return { key: 'planned', label: '', ariaLabel: translate('assignedAriaPlanned', language) };
}

export function formatWeatherUpdateWarning(errors, language = DEFAULT_LANGUAGE) {
  return errors.length ? translate('partialWeatherFailed', language, { errors: errors.join(language === 'en' ? '; ' : '；') }) : '';
}

import appI18n from '../i18n';
import { addDays, getTodayId, parseDateId } from './date';
import {
  BOOKING_TYPE_VALUES,
  toArray,
  type NormalizedPlan,
  type PlanBooking,
} from './plan';
import { clampTripDays } from './trip';

export const DEFAULT_LANGUAGE = 'zh';
export const SUPPORTED_LANGUAGES = ['zh', 'en'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
type TranslationVars = Record<string, unknown>;

export function normalizeLanguage(value: unknown): SupportedLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
    ? value as SupportedLanguage
    : DEFAULT_LANGUAGE;
}

export function getLocale(language: string = DEFAULT_LANGUAGE) {
  return language === 'en' ? 'en-US' : 'zh-CN';
}

export function translate(key: string, language: string = DEFAULT_LANGUAGE, vars: TranslationVars = {}) {
  return appI18n.getFixedT(normalizeLanguage(language))(key, vars);
}

export function getPriorityLabel(priority: string, language: string = DEFAULT_LANGUAGE) {
  return translate(`priority.${priority}`, language, { defaultValue: priority });
}

export function getBookingTypeMeta(type: unknown, language: string = DEFAULT_LANGUAGE) {
  const normalizedType = String(type || '');
  const bookingType = BOOKING_TYPE_VALUES.has(normalizedType) ? normalizedType : 'reservation';
  return {
    pending: translate(`bookingTypes.${bookingType}.pending`, language),
    done: translate(`bookingTypes.${bookingType}.done`, language),
    link: translate(`bookingTypes.${bookingType}.link`, language),
    doneAction: translate(`bookingTypes.${bookingType}.doneAction`, language),
  };
}

export function getPlanBookingBadge(plan: Pick<NormalizedPlan, 'bookings'> | null | undefined, language: string = DEFAULT_LANGUAGE) {
  const actionableBookings = toArray<PlanBooking>(plan?.bookings).filter((booking) => booking.status !== 'none');
  if (!actionableBookings.length) return null;

  const pendingBookings = actionableBookings.filter((booking) => booking.status !== 'done');
  if (pendingBookings.length) {
    return {
      status: 'pending',
      label: pendingBookings.length === 1
        ? getBookingTypeMeta(pendingBookings[0].type, language).pending
        : translate('bookingNeededBadge', language, { count: pendingBookings.length }),
    };
  }

  return {
    status: 'done',
    label: actionableBookings.length === 1
      ? getBookingTypeMeta(actionableBookings[0].type, language).done
      : translate('bookingDoneBadge', language),
  };
}

export function getAiModeText(mode: string, language: string = DEFAULT_LANGUAGE) {
  const modeKey = ['replan', 'generate'].includes(mode) ? mode : 'replan';
  return {
    label: translate(`aiPlannerModes.${modeKey}.label`, language),
    helper: translate(`aiPlannerModes.${modeKey}.helper`, language),
    placeholder: translate(`aiPlannerModes.${modeKey}.placeholder`, language),
  };
}

export function translateIssue(issue: string, language: string = DEFAULT_LANGUAGE) {
  const exactMap: Record<string, string> = {
    不在可去日期: 'dateNotAllowed',
    '当天不可用/闭馆': 'closedOrUnavailable',
    当天已有安排: 'dayOccupied',
    日期不适合: 'dateNotSuitable',
    天气未知: 'weatherUnknown',
    天气不合适: 'weatherNotSuitable',
    同一计划被移动: 'samePlanMoved',
    计划互斥: 'planConflict',
    天气不是最理想: 'weatherNotIdeal',
    先确认天气: 'confirmWeather',
  };
  if (exactMap[issue]) return translate(exactMap[issue], language);

  const scheduledMatch = issue.match(/^已安排在 (.+)$/);
  if (scheduledMatch) return translate('alreadyScheduledOn', language, { date: scheduledMatch[1] });

  const conflictMatch = issue.match(/^与 (.+) 互斥$/);
  if (conflictMatch) return translate('conflictsWith', language, { name: conflictMatch[1] });

  return issue;
}

export function translateRiskTitle(title: string, language: string = DEFAULT_LANGUAGE) {
  const titleMap: Record<string, string> = {
    必去计划没有可安排日期: 'mustNoAvailableDate',
    必去未排: 'mustUnscheduled',
    '预约/订票未完成': 'bookingIncomplete',
    天气不合适: 'weatherNotSuitable',
    当天不可用: 'dayUnavailable',
    日期不合适: 'incompatibleDate',
    和其他安排冲突: 'arrangementConflict',
    已经排在别的日期: 'scheduledElsewhere',
    旅行清单未完成: 'checklistIncomplete',
    住宿信息未填写: 'lodgingMissing',
    需要调整: 'needsAdjustment',
  };

  return titleMap[title] ? translate(titleMap[title], language) : title;
}

export function getInclusiveDateSpan(startDateId: string, endDateId: string) {
  const start = parseDateId(startDateId);
  const end = parseDateId(endDateId);
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  return clampTripDays(diff);
}

export function formatTripRange(startDateStr: string, tripDays: number, language: string = DEFAULT_LANGUAGE) {
  const start = parseDateId(startDateStr);
  const endId = addDays(startDateStr, Math.max(tripDays - 1, 0));
  const end = parseDateId(endId);
  const locale = getLocale(language);
  const startText = start.toLocaleDateString(locale, { month: 'numeric', day: 'numeric' });
  const endText = end.toLocaleDateString(locale, { month: 'numeric', day: 'numeric' });
  return `${startText} - ${endText}`;
}

export interface DisplayTripDate {
  id: string;
  display: string;
  dayNumber: number;
}

export function createTripDates(startDateStr: string, tripDays: number, language: string = DEFAULT_LANGUAGE): DisplayTripDate[] {
  if (!startDateStr || tripDays < 1) return [];

  return Array.from({ length: tripDays }, (_, index) => {
    const id = addDays(startDateStr, index);
    const date = parseDateId(id);
    const display = date.toLocaleDateString(getLocale(language), {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
    });
    return { id, display, dayNumber: index + 1 };
  });
}

export function formatMiniDate(dateId: string) {
  const date = parseDateId(dateId);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function getSmartSelectedDate(startDate: string, tripDays: number, today = getTodayId()) {
  const tripDateIds = createTripDates(startDate, tripDays).map((date) => date.id);
  if (tripDateIds.includes(today)) return today;
  if (today < startDate) return tripDateIds[0] || startDate;
  return tripDateIds[tripDateIds.length - 1] || startDate;
}

export function uniq<T>(values: T[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

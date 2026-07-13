import { CHECKLIST_STATUS } from './checklist';
import { getTodayId } from './date';
import { hasUsefulLodgingInfo, ScheduleEntryStatus, type NormalizedSchedule } from './trip';
import type { NormalizedPlan } from './plan';
import type { DisplayTripDate } from './display';
import type { RiskItem } from './risk';
import type { WeatherEvaluation } from './weather';
import type { WeatherDataMap } from '../types/weatherData';

type AnyRecord = Record<string, any>;
type Language = 'zh' | 'en' | string;
type WeatherEvaluator = (
  plan: NormalizedPlan,
  dateId: string,
  weatherData: WeatherDataMap,
  language?: string,
) => WeatherEvaluation;

export interface AssignmentClearItem {
  dateId: string;
  plan: NormalizedPlan;
  reason: string;
}

export interface AssignmentPreview {
  blocks: AssignmentBlockItem[];
  clears: AssignmentClearItem[];
  nextSchedule: NormalizedSchedule;
}

export const AssignmentBlockReason = {
  PlanAlreadyVisited: 'plan_already_visited',
  ConflictsWithVisitedPlan: 'conflicts_with_visited_plan',
} as const;

export type AssignmentBlockReason = typeof AssignmentBlockReason[keyof typeof AssignmentBlockReason];

export interface AssignmentBlockItem {
  dateId: string;
  plan: NormalizedPlan;
  reason: AssignmentBlockReason;
}

interface AssignmentPreviewOptions {
  todayId?: string;
}

const PRIORITY_RANK: Record<string, number> = {
  must: 4,
  preferred: 3,
  backup: 2,
  optional: 1,
};

function uniq<T>(values: T[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getPendingBookings(plan: AnyRecord | null | undefined) {
  return (Array.isArray(plan?.bookings) ? plan.bookings : []).filter((booking: AnyRecord) => booking.status === 'pending');
}

export function planConflicts(a: AnyRecord, b: AnyRecord) {
  return a.conflicts.includes(b.id) || b.conflicts.includes(a.id);
}

export function getDateHardIssues(
  plan: NormalizedPlan,
  dateId: string,
  schedule: NormalizedSchedule,
  plansById: Map<string, NormalizedPlan>,
  weatherData: WeatherDataMap,
  evaluateWeather: WeatherEvaluator,
  options: AnyRecord = {},
) {
  const issues = [];
  const entry = schedule[dateId];
  const currentPlanId = entry?.planId;

  if (!plan.available_dates.includes(dateId)) issues.push('不在可去日期');
  if (plan.closed_dates.includes(dateId)) issues.push('当天不可用/闭馆');

  if (!options.ignoreOccupancy && currentPlanId && currentPlanId !== plan.id) {
    issues.push('当天已有安排');
  }

  Object.entries(schedule).forEach(([otherDateId, otherEntry]) => {
    if (!otherEntry?.planId || otherEntry.status === ScheduleEntryStatus.Abandoned || otherDateId === dateId) return;
    const otherPlan = plansById.get(otherEntry.planId);
    if (!otherPlan) return;
    if (otherPlan.id === plan.id) issues.push(`已安排在 ${otherDateId}`);
    if (planConflicts(plan, otherPlan)) issues.push(`与 ${otherPlan.name} 互斥`);
  });

  const weather = evaluateWeather(plan, dateId, weatherData);
  if (weather.level === 'blocked') issues.push(weather.label);

  return uniq(issues);
}

function getFeasibleDates(
  plan: NormalizedPlan,
  tripDates: DisplayTripDate[],
  schedule: NormalizedSchedule,
  plansById: Map<string, NormalizedPlan>,
  weatherData: WeatherDataMap,
  evaluateWeather: WeatherEvaluator,
) {
  return tripDates
    .filter((date) => getDateHardIssues(plan, date.id, schedule, plansById, weatherData, evaluateWeather).length === 0)
    .map((date) => date.id);
}

function getScheduledRiskTitle(issues: string[]) {
  if (issues.some((issue) => issue.includes('天气'))) return '天气不合适';
  if (issues.some((issue) => issue.includes('闭馆') || issue.includes('不可用'))) return '当天不可用';
  if (issues.some((issue) => issue.includes('可去日期') || issue.includes('日期'))) return '日期不合适';
  if (issues.some((issue) => issue.includes('互斥'))) return '和其他安排冲突';
  if (issues.some((issue) => issue.includes('已安排'))) return '已经排在别的日期';
  return '需要调整';
}

function getScheduledRiskLevel(plan: AnyRecord, title: string) {
  if (plan.priority === 'must') return 'critical';
  if (['天气不合适', '当天不可用', '日期不合适', '和其他安排冲突'].includes(title)) {
    return 'critical';
  }
  return 'warning';
}

export function buildRiskItems({
  plans,
  tripDates,
  schedule,
  plansById,
  weatherData,
  evaluateWeather,
}: {
  plans: NormalizedPlan[];
  tripDates: DisplayTripDate[];
  schedule: NormalizedSchedule;
  plansById: Map<string, NormalizedPlan>;
  weatherData: WeatherDataMap;
  evaluateWeather: WeatherEvaluator;
}): RiskItem<NormalizedPlan>[] {
  const scheduledPlanIds = new Set(Object.values(schedule).map((entry: any) => entry.planId));

  const scheduledRisks = Object.entries(schedule)
    .map(([dateId, entry]: [string, any]) => {
      if (entry.status === ScheduleEntryStatus.Abandoned) return null;
      const plan = plansById.get(entry.planId);
      if (!plan) return null;

      const issues = getDateHardIssues(plan, dateId, schedule, plansById, weatherData, evaluateWeather, {
        ignoreOccupancy: true,
      });

      if (!issues.length) return null;

      const title = getScheduledRiskTitle(issues as string[]);

      return {
        plan,
        dateId,
        level: getScheduledRiskLevel(plan, title),
        title,
        reasons: issues,
      };
    })
    .filter(Boolean) as RiskItem<NormalizedPlan>[];

  const unscheduledRisks = plans
    .filter((plan) => plan.priority === 'must' && !scheduledPlanIds.has(plan.id))
    .map((plan) => {
      const feasibleDates = getFeasibleDates(plan, tripDates, schedule, plansById, weatherData, evaluateWeather);
      if (feasibleDates.length > 0) return null;

      const reasons = uniq(
        tripDates.flatMap((date) =>
          getDateHardIssues(plan, date.id, schedule, plansById, weatherData, evaluateWeather).slice(0, 2),
        ),
      ).slice(0, 4);

      return {
        plan,
        level: 'critical',
        title: '必去计划没有可安排日期',
        reasons,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => getPlanPriorityWeight(b.plan) - getPlanPriorityWeight(a.plan)) as AnyRecord[];

  const bookingRisks = Object.entries(schedule)
    .map(([dateId, entry]: [string, any]) => {
      if (entry.status === ScheduleEntryStatus.Abandoned) return null;
      const plan = plansById.get(entry.planId);
      const pendingBookings = getPendingBookings(plan);
      if (!plan || pendingBookings.length === 0) return null;

      return {
        plan,
        dateId,
        level: 'warning',
        title: '预约/订票未完成',
        reasons: pendingBookings.map((booking: AnyRecord) => booking.title),
      };
    })
    .filter(Boolean) as RiskItem<NormalizedPlan>[];

  return [...scheduledRisks, ...unscheduledRisks as RiskItem<NormalizedPlan>[], ...bookingRisks].sort((a, b) => {
    const levelRank: Record<string, number> = { critical: 3, warning: 2, info: 1 };
    const levelDiff = levelRank[b.level] - levelRank[a.level];
    if (levelDiff) return levelDiff;
    return getPlanPriorityWeight(b.plan) - getPlanPriorityWeight(a.plan);
  });
}

export function buildAssignmentPreview(
  schedule: NormalizedSchedule,
  dateId: string,
  targetPlan: NormalizedPlan,
  plansById: Map<string, NormalizedPlan>,
  options: AssignmentPreviewOptions = {},
): AssignmentPreview {
  const nextSchedule = { ...schedule };
  const blocksByDate = new Map<string, AssignmentBlockItem>();
  const clearsByDate = new Map<string, AssignmentClearItem>();
  const todayId = options.todayId || getTodayId();

  Object.entries(schedule).forEach(([otherDateId, entry]) => {
    if (!entry?.planId || entry.status === ScheduleEntryStatus.Abandoned || otherDateId === dateId) return;
    const otherPlan = plansById.get(entry.planId);
    if (!otherPlan) return;

    const isSamePlan = otherPlan.id === targetPlan.id;
    const isConflict = planConflicts(targetPlan, otherPlan);
    if (!isSamePlan && !isConflict) return;

    // A historical correction may rewrite the selected day and everything after it,
    // but must not erase an itinerary that had already happened before that point.
    const isVisitedBeforePlanningStart = otherDateId < todayId && otherDateId < dateId;
    if (isVisitedBeforePlanningStart) {
      blocksByDate.set(otherDateId, {
        dateId: otherDateId,
        plan: otherPlan,
        reason: isSamePlan
          ? AssignmentBlockReason.PlanAlreadyVisited
          : AssignmentBlockReason.ConflictsWithVisitedPlan,
      });
      return;
    }

    clearsByDate.set(otherDateId, {
      dateId: otherDateId,
      plan: otherPlan,
      reason: isSamePlan ? '同一计划被移动' : '计划互斥',
    });
    delete nextSchedule[otherDateId];
  });

  if (blocksByDate.size === 0) {
    nextSchedule[dateId] = { planId: targetPlan.id };
  }

  return {
    blocks: Array.from(blocksByDate.values()),
    clears: Array.from(clearsByDate.values()),
    nextSchedule,
  };
}

export function getRiskIdentity(risk: AnyRecord) {
  return `${risk.dateId || 'unscheduled'}:${risk.plan.id}:${risk.title}`;
}

export function getPlanPriorityWeight(plan: AnyRecord) {
  return PRIORITY_RANK[plan.priority] || 1;
}

export function getWeatherScore(level: string) {
  if (level === 'best') return 5;
  if (level === 'ok') return 3;
  if (level === 'mismatch') return 1;
  return 0;
}

export function getClearPenalty(clears: AnyRecord[]) {
  return clears.reduce((total, item) => total + getPlanPriorityWeight(item.plan) * 3, 0);
}

export function getRiskPenalty(risks: AnyRecord[]) {
  return risks.reduce((total, risk) => {
    const levelPenalty = risk.level === 'critical' ? 16 : 6;
    return total + levelPenalty + getPlanPriorityWeight(risk.plan) * 2;
  }, 0);
}

export function buildChecklistRiskGroup(groups: AnyRecord[], state: AnyRecord, language: Language = 'zh') {
  const pendingItems = groups.flatMap((group) =>
    group.items
      .filter((item: AnyRecord) => {
        const status = state[item.id] || CHECKLIST_STATUS.todo;
        return status !== CHECKLIST_STATUS.done && status !== CHECKLIST_STATUS.skipped;
      })
      .map((item: AnyRecord) => (
        language === 'en' ? `${group.title}: ${item.text}` : `${group.title} · ${item.text}`
      )),
  );

  if (!pendingItems.length) return null;

  return {
    title: '旅行清单未完成',
    level: 'warning',
    items: pendingItems,
    unit: '项',
  };
}

export function buildLodgingRiskGroup(lodgings: AnyRecord[], hasTripContent: boolean, missingHelp: string) {
  const hasLodgings = Array.isArray(lodgings) && lodgings.some(hasUsefulLodgingInfo);
  if (hasLodgings || !hasTripContent) return null;

  return {
    title: '住宿信息未填写',
    level: 'warning',
    items: [missingHelp],
    unit: '项',
  };
}

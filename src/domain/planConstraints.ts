import { getDateHardIssues } from './planning';
import { ScheduleEntryStatus, type NormalizedSchedule } from './trip';
import type { NormalizedPlan, PlanPriority, WeatherRules } from './plan';
import type { WeatherEvaluation } from './weather';
import type { WeatherDataMap } from '../types/weatherData';

export interface PlanConstraintDraft {
  priority: PlanPriority;
  available_dates: string[];
  closed_dates: string[];
  weather_rules: WeatherRules;
  conflicts: string[];
}

export interface PlanConstraintImpact {
  dateId: string;
  planName: string;
  reasons: string[];
}

type WeatherEvaluator = (
  plan: NormalizedPlan,
  dateId: string,
  weatherData: WeatherDataMap,
) => WeatherEvaluation;

export function getPlanConstraintDraft(plan: NormalizedPlan): PlanConstraintDraft {
  return {
    priority: plan.priority,
    available_dates: [...plan.available_dates],
    closed_dates: [...plan.closed_dates],
    weather_rules: {
      best: [...plan.weather_rules.best],
      ok: [...plan.weather_rules.ok],
      blocked: [...plan.weather_rules.blocked],
    },
    conflicts: [...plan.conflicts],
  };
}

export function applyPlanConstraintDraft(plan: NormalizedPlan, draft: PlanConstraintDraft): NormalizedPlan {
  return {
    ...plan,
    priority: draft.priority,
    available_dates: [...draft.available_dates],
    closed_dates: [...draft.closed_dates],
    weather_rules: {
      best: [...draft.weather_rules.best],
      ok: [...draft.weather_rules.ok],
      blocked: [...draft.weather_rules.blocked],
    },
    conflicts: [...draft.conflicts],
  };
}

export function getPlanConstraintImpacts(
  originalPlan: NormalizedPlan,
  draft: PlanConstraintDraft,
  plans: NormalizedPlan[],
  schedule: NormalizedSchedule,
  weatherData: WeatherDataMap,
  evaluateWeather: WeatherEvaluator,
): PlanConstraintImpact[] {
  const updatedPlan = applyPlanConstraintDraft(originalPlan, draft);
  return getPlanEditImpacts(plans, plans.map((plan) => plan.id === originalPlan.id ? updatedPlan : plan), schedule, schedule, weatherData, evaluateWeather);
}

export function getPlanEditImpacts(
  plans: NormalizedPlan[],
  nextPlans: NormalizedPlan[],
  schedule: NormalizedSchedule,
  nextSchedule: NormalizedSchedule,
  weatherData: WeatherDataMap,
  evaluateWeather: WeatherEvaluator,
): PlanConstraintImpact[] {
  const currentPlansById = new Map(plans.map((plan) => [plan.id, plan]));
  const updatedPlansById = new Map(nextPlans.map((plan) => [plan.id, plan]));

  return Object.entries(nextSchedule).flatMap(([dateId, entry]) => {
    if (!entry?.planId || entry.status === ScheduleEntryStatus.Abandoned) return [];
    const currentPlan = currentPlansById.get(entry.planId);
    const nextPlan = updatedPlansById.get(entry.planId);
    if (!nextPlan) return [];
    const wasScheduledHere = schedule[dateId]?.planId === entry.planId && schedule[dateId]?.status !== ScheduleEntryStatus.Abandoned;

    const previousIssues = new Set(wasScheduledHere && currentPlan ? getDateHardIssues(
      currentPlan, dateId, schedule, currentPlansById, weatherData, evaluateWeather,
      { ignoreOccupancy: true },
    ) : []);
    const reasons = getDateHardIssues(
      nextPlan, dateId, nextSchedule, updatedPlansById, weatherData, evaluateWeather,
      { ignoreOccupancy: true },
    ).filter((issue): issue is string => typeof issue === 'string' && !previousIssues.has(issue));

    if (!wasScheduledHere || nextPlan !== currentPlan) {
      const previousWeather = wasScheduledHere && currentPlan ? evaluateWeather(currentPlan, dateId, weatherData).level : 'unknown';
      const nextWeather = evaluateWeather(nextPlan, dateId, weatherData).level;
      if (nextWeather === 'mismatch' && previousWeather !== 'mismatch' && previousWeather !== 'blocked') {
        reasons.push('天气不是最理想');
      }
    }

    return reasons.length ? [{ dateId, planName: nextPlan.name, reasons }] : [];
  });
}

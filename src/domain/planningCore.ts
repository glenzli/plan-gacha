import type { NormalizedPlan, TripDateLike } from './plan';
import { getLodgingImpacts, type NormalizedLodging } from './lodging';
import type { NormalizedSchedule } from './trip';
import type { WeatherDataMap } from '../types/weatherData';
import type { RiskItem } from './risk';
import { evaluateWeather } from './planWeather';
import { buildAssignmentPreview, buildRiskItems, getRiskIdentity } from './planning';

export interface PlanningContext {
  plans: NormalizedPlan[];
  tripDates: TripDateLike[];
  schedule: NormalizedSchedule;
  weatherData: WeatherDataMap;
  todayId: string;
  lodgings?: NormalizedLodging[];
}

export function evaluatePlanning(context: PlanningContext) {
  return buildRiskItems({ ...context, plansById: new Map(context.plans.map((plan) => [plan.id, plan])), evaluateWeather });
}

/** Pure preview: callers own the clock and persistence. Keep the web's historical-correction semantics. */
export function previewPlanAssignment(context: PlanningContext, dateId: string, targetPlan: NormalizedPlan, currentRisks: RiskItem<NormalizedPlan>[] = evaluatePlanning(context)) {
  const plansById = new Map(context.plans.map((plan) => [plan.id, plan]));
  const preview = buildAssignmentPreview(context.schedule, dateId, targetPlan, plansById, { todayId: context.todayId });
  const currentKeys = new Set(currentRisks.map(getRiskIdentity));
  const nextRisks = evaluatePlanning({ ...context, schedule: preview.nextSchedule })
    .filter((risk) => risk.level !== 'info' && !currentKeys.has(getRiskIdentity(risk)));
  const lodgings = context.lodgings || [];
  const lodgingImpacts = getLodgingImpacts(context.schedule, preview.nextSchedule, plansById, plansById, lodgings, lodgings, context.tripDates.map((date) => date.id));
  return { ...preview, nextRisks, lodgingImpacts };
}

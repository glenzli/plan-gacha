import { AssignmentBlockReason, getClearPenalty, getPlanPriorityWeight, getRiskPenalty, getWeatherScore } from './planning';
import { evaluateWeather } from './planWeather';
import { evaluatePlanning, previewPlanAssignment, type PlanningContext } from './planningCore';
import { ScheduleEntryStatus } from './trip';
import type { NormalizedPlan } from './plan';
import type { RiskItem } from './risk';
import type { CommitmentChange } from './planning';

export const CandidateReason = {
  DateNotAllowed: 'date_not_allowed',
  Closed: 'closed_or_unavailable',
  AlreadyVisited: 'plan_already_visited',
  ConflictsWithVisited: 'conflicts_with_visited_plan',
  BookedPlanDisplaced: 'booked_plan_displaced',
  LockedPlanDisplaced: 'locked_plan_displaced',
} as const;
export type CandidateReason = typeof CandidateReason[keyof typeof CandidateReason];
export const candidateReasonTranslation: Record<CandidateReason, string> = {
  date_not_allowed: 'dateNotSuitable', closed_or_unavailable: 'closedOrUnavailable',
  plan_already_visited: 'planAlreadyVisited', conflicts_with_visited_plan: 'conflictsWithVisitedPlan',
  booked_plan_displaced: 'bookedPlanDisplaced', locked_plan_displaced: 'lockedPlanDisplaced',
};

/** Same stable ordering as the web: current first, assignable first, then descending score. */
export function rankPlanCandidates(context: PlanningContext, dateId: string, language = 'zh', currentRisks: RiskItem<NormalizedPlan>[] = evaluatePlanning(context), commitmentChanges: CommitmentChange[] = []) {
  const assignments = new Map(Object.entries(context.schedule)
    .filter(([, entry]) => entry.planId && entry.status !== ScheduleEntryStatus.Abandoned)
    .map(([date, entry]) => [entry.planId, date]));
  return context.plans.map((plan) => {
    const isCurrent = context.schedule[dateId]?.planId === plan.id;
    const weather = evaluateWeather(plan, dateId, context.weatherData, language);
    const { blocks, clears, nextRisks: newRisks } = previewPlanAssignment(context, dateId, plan, currentRisks, commitmentChanges);
    const reasonCodes: CandidateReason[] = [];
    if (!plan.available_dates.includes(dateId)) reasonCodes.push(CandidateReason.DateNotAllowed);
    if (plan.closed_dates.includes(dateId)) reasonCodes.push(CandidateReason.Closed);
    if (!isCurrent) {
      if (blocks.some((item) => item.reason === AssignmentBlockReason.PlanAlreadyVisited)) reasonCodes.push(CandidateReason.AlreadyVisited);
      if (blocks.some((item) => item.reason === AssignmentBlockReason.ConflictsWithVisitedPlan)) reasonCodes.push(CandidateReason.ConflictsWithVisited);
    }
    if (blocks.some((item) => item.reason === AssignmentBlockReason.BookedPlanDisplaced)) reasonCodes.push(CandidateReason.BookedPlanDisplaced);
    if (blocks.some((item) => item.reason === AssignmentBlockReason.LockedPlanDisplaced)) reasonCodes.push(CandidateReason.LockedPlanDisplaced);
    const scoreBreakdown = { priority: getPlanPriorityWeight(plan) * 3, weather: getWeatherScore(weather.level), clearPenalty: getClearPenalty(clears), newRiskPenalty: getRiskPenalty(newRisks) };
    return {
      plan, canAssign: reasonCodes.length === 0, reasonCodes,
      noteCodes: weather.level === 'unknown' ? ['weather_unknown'] : [],
      clears, newRisks, scoreBreakdown,
      score: scoreBreakdown.priority + scoreBreakdown.weather - scoreBreakdown.clearPenalty - scoreBreakdown.newRiskPenalty,
      isCurrent, assignedDateId: assignments.get(plan.id) || '',
      isAlreadyVisited: blocks.some((item) => item.reason === AssignmentBlockReason.PlanAlreadyVisited),
      weather, weatherOverride: weather.level === 'blocked',
    };
  }).sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    if (a.canAssign !== b.canAssign) return a.canAssign ? -1 : 1;
    return b.score - a.score;
  });
}

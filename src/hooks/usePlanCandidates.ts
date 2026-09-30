import { useMemo } from 'react';
import {
  buildAssignmentPreview,
  AssignmentBlockReason,
  buildRiskItems,
  getClearPenalty,
  getPlanPriorityWeight,
  getRiskIdentity,
  getRiskPenalty,
  getWeatherScore,
} from '../domain/planning';
import { evaluateWeather } from '../domain/dayInsight';
import { uniq, type DisplayTripDate } from '../domain/display';
import type { NormalizedPlan } from '../domain/plan';
import type { RiskItem } from '../domain/risk';
import type { NormalizedSchedule } from '../domain/trip';
import type { PlanCandidate } from '../types/candidates';
import type { TranslateFn } from '../types/ui';
import type { WeatherDataMap } from '../types/weatherData';

interface UsePlanCandidatesOptions {
  aiPlannerOpen: boolean;
  archivedViewTripId: string | null;
  checklistImportOpen: boolean;
  checklistOpen: boolean;
  drivePanelOpen: boolean;
  importModalOpen: boolean;
  language: string;
  normalizedPlans: NormalizedPlan[];
  planAssignments: Map<string, string>;
  plansById: Map<string, NormalizedPlan>;
  riskItems: RiskItem<NormalizedPlan>[];
  schedule: NormalizedSchedule;
  selectedDate: DisplayTripDate | undefined;
  selectedPlan: NormalizedPlan | null | undefined;
  t: TranslateFn;
  tripDates: DisplayTripDate[];
  weatherData: WeatherDataMap;
}

export function usePlanCandidates({
  aiPlannerOpen,
  archivedViewTripId,
  checklistImportOpen,
  checklistOpen,
  drivePanelOpen,
  importModalOpen,
  language,
  normalizedPlans,
  planAssignments,
  plansById,
  riskItems,
  schedule,
  selectedDate,
  selectedPlan,
  t,
  tripDates,
  weatherData,
}: UsePlanCandidatesOptions) {
  const candidates = useMemo(() => {
    if (
      !selectedDate
      || aiPlannerOpen
      || importModalOpen
      || checklistOpen
      || checklistImportOpen
      || drivePanelOpen
      || archivedViewTripId
    ) {
      return [] as PlanCandidate[];
    }
    const currentRiskKeys = new Set(riskItems.map(getRiskIdentity));

    return normalizedPlans
      .map((plan) => {
        const hardReasons: string[] = [];
        const notes: string[] = [];
        const isCurrent = selectedPlan?.id === plan.id;
        const assignedDateId = planAssignments.get(plan.id) || '';
        const weather = evaluateWeather(plan, selectedDate.id, weatherData, language);
        const { blocks, clears, nextSchedule } = buildAssignmentPreview(schedule, selectedDate.id, plan, plansById);
        const nextRisks = buildRiskItems({
          plans: normalizedPlans,
          tripDates,
          schedule: nextSchedule,
          plansById,
          weatherData,
          evaluateWeather,
        })
          .filter((risk) => risk.level !== 'info');
        const newRisks = nextRisks.filter((risk) => !currentRiskKeys.has(getRiskIdentity(risk)));

        if (!plan.available_dates.includes(selectedDate.id)) hardReasons.push(t('dateNotSuitable'));
        if (plan.closed_dates.includes(selectedDate.id)) hardReasons.push(t('closedOrUnavailable'));
        if (!isCurrent) {
          if (blocks.some((item) => item.reason === AssignmentBlockReason.PlanAlreadyVisited)) {
            hardReasons.push(t('planAlreadyVisited'));
          }
          if (blocks.some((item) => item.reason === AssignmentBlockReason.ConflictsWithVisitedPlan)) {
            hardReasons.push(t('conflictsWithVisitedPlan'));
          }
        }
        if (weather.level === 'unknown') notes.push(t('weatherUnknown'));

        const priorityScore = getPlanPriorityWeight(plan) * 3;
        const score = priorityScore + getWeatherScore(weather.level) - getClearPenalty(clears) - getRiskPenalty(newRisks);

        return {
          plan,
          canAssign: hardReasons.length === 0,
          hardReasons: uniq(hardReasons),
          notes: uniq(notes),
          clears,
          newRisks,
          score,
          isCurrent,
          assignedDateId,
          isAlreadyVisited: blocks.some((item) => item.reason === AssignmentBlockReason.PlanAlreadyVisited),
          weather,
          weatherOverride: weather.level === 'blocked',
        } satisfies PlanCandidate;
      })
      .sort((a, b) => {
        if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
        if (a.canAssign !== b.canAssign) return a.canAssign ? -1 : 1;
        return b.score - a.score;
      });
  }, [
    aiPlannerOpen,
    archivedViewTripId,
    checklistImportOpen,
    checklistOpen,
    drivePanelOpen,
    importModalOpen,
    language,
    normalizedPlans,
    planAssignments,
    plansById,
    riskItems,
    schedule,
    selectedDate,
    selectedPlan,
    t,
    tripDates,
    weatherData,
  ]);

  return useMemo(() => {
    const currentCandidate = candidates.find((candidate) => candidate.isCurrent);
    const readyCandidates: PlanCandidate[] = [];
    const scheduled: PlanCandidate[] = [];
    const visited: PlanCandidate[] = [];
    const unavailable: PlanCandidate[] = [];

    candidates.forEach((candidate) => {
      if (candidate.isCurrent) return;
      if (candidate.isAlreadyVisited) {
        visited.push(candidate);
        return;
      }
      if (!candidate.canAssign) {
        unavailable.push(candidate);
        return;
      }
      if (candidate.assignedDateId) scheduled.push(candidate);
      else readyCandidates.push(candidate);
    });

    const candidateGroups = [
      { key: 'ready', title: t('candidateReady'), items: readyCandidates },
      { key: 'scheduled', title: t('candidateScheduled'), items: scheduled },
      { key: 'visited', title: t('candidateVisited'), items: visited },
      { key: 'unavailable', title: t('candidateUnavailable'), items: unavailable },
    ].filter((group) => group.items.length > 0);

    return {
      availableCandidateCount: readyCandidates.length,
      candidateGroups,
      candidates,
      currentCandidate,
      readyCandidates,
    };
  }, [candidates, t]);
}

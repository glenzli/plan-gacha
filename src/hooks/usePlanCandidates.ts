import { useMemo } from 'react';
import { rankPlanCandidates, candidateReasonTranslation } from '../domain/planCandidates';
import { getTodayId } from '../domain/date';
import type { DisplayTripDate } from '../domain/display';
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
  riskItems,
  schedule,
  selectedDate,
  t,
  tripDates,
  weatherData,
}: UsePlanCandidatesOptions) {
  const todayId = getTodayId();
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
    return rankPlanCandidates({ plans: normalizedPlans, tripDates, schedule, weatherData, todayId }, selectedDate.id, language, riskItems)
      .map((candidate) => ({ ...candidate, hardReasons: candidate.reasonCodes.map((code) => t(candidateReasonTranslation[code])), notes: candidate.noteCodes.map(() => t('weatherUnknown')) }));
  }, [
    aiPlannerOpen,
    archivedViewTripId,
    checklistImportOpen,
    checklistOpen,
    drivePanelOpen,
    importModalOpen,
    language,
    normalizedPlans,
    riskItems,
    schedule,
    selectedDate,
    t,
    tripDates,
    weatherData,
    todayId,
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

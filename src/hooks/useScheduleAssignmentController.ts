import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  AssignmentBlockReason,
  buildAssignmentPreview,
  buildRiskItems,
  getRiskIdentity,
  type AssignmentClearItem,
} from '../domain/planning';
import { evaluateWeather } from '../domain/dayInsight';
import type { DisplayTripDate } from '../domain/display';
import type { NormalizedPlan } from '../domain/plan';
import type { RiskItem } from '../domain/risk';
import { ScheduleEntryStatus, type NormalizedSchedule } from '../domain/trip';
import type { TranslateFn } from '../types/ui';
import type { WeatherDataMap } from '../types/weatherData';

export interface PendingAssignment {
  blocks: ReturnType<typeof buildAssignmentPreview>['blocks'];
  clears: AssignmentClearItem[];
  nextSchedule: NormalizedSchedule;
  nextRisks: RiskItem<NormalizedPlan>[];
  targetPlan: NormalizedPlan;
  dateId: string;
}

interface UseScheduleAssignmentControllerOptions {
  normalizedPlans: NormalizedPlan[];
  notify: (message: string) => void;
  plansById: Map<string, NormalizedPlan>;
  riskItems: RiskItem<NormalizedPlan>[];
  schedule: NormalizedSchedule;
  selectedIndex: number;
  setSchedule: Dispatch<SetStateAction<NormalizedSchedule>>;
  setSelectedDateId: Dispatch<SetStateAction<string>>;
  t: TranslateFn;
  tripDates: DisplayTripDate[];
  weatherData: WeatherDataMap;
}

export function useScheduleAssignmentController({
  normalizedPlans,
  notify,
  plansById,
  riskItems,
  schedule,
  selectedIndex,
  setSchedule,
  setSelectedDateId,
  t,
  tripDates,
  weatherData,
}: UseScheduleAssignmentControllerOptions) {
  const [pendingAssignment, setPendingAssignment] = useState<PendingAssignment | null>(null);

  const buildAssignmentImpact = (dateId: string, planId: string): PendingAssignment | null => {
    const targetPlan = plansById.get(planId);
    if (!targetPlan) return null;

    const { blocks, clears, nextSchedule } = buildAssignmentPreview(schedule, dateId, targetPlan, plansById);
    const currentRiskKeys = new Set(riskItems.map(getRiskIdentity));

    const nextRisks = buildRiskItems({
      plans: normalizedPlans,
      tripDates,
      schedule: nextSchedule,
      plansById,
      weatherData,
      evaluateWeather,
    })
      .filter((risk) => risk.level !== 'info')
      .filter((risk) => !currentRiskKeys.has(getRiskIdentity(risk)));

    return { blocks, clears, nextSchedule, nextRisks, targetPlan, dateId };
  };

  const applySchedule = (nextSchedule: NormalizedSchedule, message = t('scheduleUpdated')) => {
    setSchedule(nextSchedule);
    notify(message);
  };

  const requestAssignPlan = (dateId: string, planId: string) => {
    const impact = buildAssignmentImpact(dateId, planId);
    if (!impact) return;

    if (impact.blocks.length > 0) {
      const hasVisitedPlan = impact.blocks.some(
        (item) => item.reason === AssignmentBlockReason.PlanAlreadyVisited,
      );
      notify(hasVisitedPlan ? t('planAlreadyVisited') : t('conflictsWithVisitedPlan'));
      return;
    }

    if (impact.clears.length || impact.nextRisks.length) {
      setPendingAssignment(impact);
      return;
    }

    applySchedule(impact.nextSchedule, t('dayPlanUpdated'));
  };

  const confirmPendingAssignment = () => {
    if (!pendingAssignment) return;
    applySchedule(
      pendingAssignment.nextSchedule,
      pendingAssignment.clears.length ? t('impactedDatesCleared') : t('dayPlanUpdated'),
    );
    setPendingAssignment(null);
  };

  const clearDay = (dateId: string) => {
    setSchedule((current) => {
      const next = { ...current };
      delete next[dateId];
      return next;
    });
    notify(t('dayCleared'));
  };

  const toggleDayAbandoned = (dateId: string) => {
    const shouldAbandon = schedule[dateId]?.status !== ScheduleEntryStatus.Abandoned;
    setSchedule((current) => {
      const entry = current[dateId];
      if (!entry?.planId) return current;

      const nextEntry = shouldAbandon
        ? { ...entry, status: ScheduleEntryStatus.Abandoned }
        : { planId: entry.planId };
      return { ...current, [dateId]: nextEntry };
    });
    notify(shouldAbandon ? t('dayMarkedAbandoned') : t('dayRestored'));
  };

  const selectNeighborDate = (step: number) => {
    if (selectedIndex < 0) return;
    const next = tripDates[selectedIndex + step];
    if (next) setSelectedDateId(next.id);
  };

  return {
    buildAssignmentImpact,
    clearDay,
    confirmPendingAssignment,
    pendingAssignment,
    requestAssignPlan,
    selectNeighborDate,
    setPendingAssignment,
    toggleDayAbandoned,
  };
}

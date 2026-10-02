import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  AssignmentBlockReason,
  buildAssignmentPreview,
  getCommitmentImpacts,
  type AssignmentClearItem,
} from '../domain/planning';
import { previewPlanAssignment } from '../domain/planningCore';
import { getTodayId } from '../domain/date';
import type { DisplayTripDate } from '../domain/display';
import type { NormalizedPlan } from '../domain/plan';
import type { RiskItem } from '../domain/risk';
import { ScheduleEntryStatus, type NormalizedSchedule } from '../domain/trip';
import type { TranslateFn } from '../types/ui';
import type { WeatherDataMap } from '../types/weatherData';
import type { LodgingImpact, NormalizedLodging } from '../domain/lodging';

export interface PendingAssignment {
  blocks: ReturnType<typeof buildAssignmentPreview>['blocks'];
  clears: AssignmentClearItem[];
  nextSchedule: NormalizedSchedule;
  nextRisks: RiskItem<NormalizedPlan>[];
  targetPlan: NormalizedPlan;
  dateId: string;
  lodgingImpacts: LodgingImpact[];
}

interface UseScheduleAssignmentControllerOptions {
  normalizedPlans: NormalizedPlan[];
  lodgings: NormalizedLodging[];
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
  lodgings,
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

    const { blocks, clears, nextSchedule, nextRisks, lodgingImpacts } = previewPlanAssignment(
      { plans: normalizedPlans, lodgings, tripDates, schedule, weatherData, todayId: getTodayId() }, dateId, targetPlan, riskItems,
    );
    return { blocks, clears, nextSchedule, nextRisks, targetPlan, dateId, lodgingImpacts };
  };

  const applySchedule = (nextSchedule: NormalizedSchedule, message = t('scheduleUpdated')) => {
    setSchedule(nextSchedule);
    notify(message);
  };

  const requestAssignPlan = (dateId: string, planId: string) => {
    const impact = buildAssignmentImpact(dateId, planId);
    if (!impact) return false;

    if (impact.blocks.length > 0) {
      const hasVisitedPlan = impact.blocks.some(
        (item) => item.reason === AssignmentBlockReason.PlanAlreadyVisited,
      );
      const booking = impact.blocks.some((item) => item.reason === AssignmentBlockReason.BookedPlanDisplaced);
      const locked = impact.blocks.some((item) => item.reason === AssignmentBlockReason.LockedPlanDisplaced);
      notify(booking ? t('bookedPlanDisplaced') : locked ? t('lockedPlanDisplaced') : hasVisitedPlan ? t('planAlreadyVisited') : t('conflictsWithVisitedPlan'));
      return false;
    }

    if (impact.clears.length || impact.nextRisks.length || impact.lodgingImpacts.length) {
      setPendingAssignment(impact);
      return false;
    }

    applySchedule(impact.nextSchedule, t('dayPlanUpdated'));
    return true;
  };

  const confirmPendingAssignment = () => {
    if (!pendingAssignment) return;
    const fresh = buildAssignmentImpact(pendingAssignment.dateId, pendingAssignment.targetPlan.id);
    if (!fresh || fresh.blocks.length) {
      setPendingAssignment(null);
      notify(t('arrangementChangedReview'));
      return;
    }
    if (JSON.stringify(fresh.nextSchedule) !== JSON.stringify(pendingAssignment.nextSchedule)
      || JSON.stringify(fresh.nextRisks) !== JSON.stringify(pendingAssignment.nextRisks)
      || JSON.stringify(fresh.lodgingImpacts) !== JSON.stringify(pendingAssignment.lodgingImpacts)) {
      setPendingAssignment(fresh);
      notify(t('arrangementChangedReview'));
      return;
    }
    applySchedule(fresh.nextSchedule, fresh.clears.length ? t('impactedDatesCleared') : t('dayPlanUpdated'));
    setPendingAssignment(null);
  };

  const commitmentBlocksChange = (dateId: string, after: NormalizedSchedule) => {
    const impact = getCommitmentImpacts(schedule, after, plansById).find((item) => item.dateId === dateId);
    if (!impact) return false;
    notify(t(impact.bookingIds.length ? 'bookedPlanDisplaced' : 'lockedPlanDisplaced'));
    return true;
  };
  const clearDay = (dateId: string) => {
    const cleared = { ...schedule }; delete cleared[dateId];
    if (commitmentBlocksChange(dateId, cleared)) return;
    setSchedule((current) => {
      const next = { ...current };
      if (current[dateId]?.lodgingLocked) next[dateId] = { planId: '', lodgingId: current[dateId].lodgingId, lodgingLocked: true };
      else delete next[dateId];
      return next;
    });
    notify(t('dayCleared'));
  };

  const toggleDayAbandoned = (dateId: string) => {
    const shouldAbandon = schedule[dateId]?.status !== ScheduleEntryStatus.Abandoned;
    if (shouldAbandon && commitmentBlocksChange(dateId, { ...schedule, [dateId]: { ...schedule[dateId], status: ScheduleEntryStatus.Abandoned } })) return;
    setSchedule((current) => {
      const entry = current[dateId];
      if (!entry?.planId) return current;

      const nextEntry = { ...entry, status: shouldAbandon ? ScheduleEntryStatus.Abandoned : undefined };
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

// @ts-nocheck
import { useMemo } from 'react';
import {
  buildAssignmentPreview,
  buildRiskItems,
  getClearPenalty,
  getPlanPriorityWeight,
  getRiskIdentity,
  getRiskPenalty,
  getWeatherScore,
} from '../domain/planning';
import { evaluateWeather } from '../domain/dayInsight';
import { uniq } from '../domain/display';

export function usePlanCandidates({
  aiPlannerOpen,
  archivedViewTripId,
  checklistImportOpen,
  checklistOpen,
  drivePanelOpen,
  editorOpen,
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
}) {
  const candidates = useMemo(() => {
    if (
      !selectedDate
      || editorOpen
      || aiPlannerOpen
      || importModalOpen
      || checklistOpen
      || checklistImportOpen
      || drivePanelOpen
      || archivedViewTripId
    ) {
      return [];
    }
    const currentRiskKeys = new Set(riskItems.map(getRiskIdentity));

    return normalizedPlans
      .map((plan) => {
        const hardReasons = [];
        const notes = [];
        const isCurrent = selectedPlan?.id === plan.id;
        const assignedDateId = planAssignments.get(plan.id) || '';
        const weather = evaluateWeather(plan, selectedDate.id, weatherData, language);
        const { clears, nextSchedule } = buildAssignmentPreview(schedule, selectedDate.id, plan, plansById);
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
          weather,
          weatherOverride: weather.level === 'blocked',
        };
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
    editorOpen,
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
    const readyCandidates = [];
    const scheduled = [];
    const unavailable = [];

    candidates.forEach((candidate) => {
      if (candidate.isCurrent) return;
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

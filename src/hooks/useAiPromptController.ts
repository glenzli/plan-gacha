import type { RefObject } from 'react';
import {
  buildAiPlanningPrompt as buildAiPlanningPromptText,
  buildSinglePlanPrompt,
  compactLodgingForAi,
  compactPlanForAi,
  compactStopRouteForAi,
  getLodgingContextForDate,
} from '../domain/aiPrompts';
import { evaluateWeather, getDayInsight } from '../domain/dayInsight';
import { getTodayId, addDays } from '../domain/date';
import type {
  DayReviewRating,
  DayReviewTag,
} from '../domain/dayReview';
import {
  formatTripRange,
  getAiModeText,
  translateRiskTitle,
  type DisplayTripDate,
} from '../domain/display';
import type { NormalizedPlan } from '../domain/plan';
import type { RiskGroup } from '../domain/risk';
import {
  PlaceFeedbackStatus,
  StopOutcomeStatus,
  type NormalizedLodging,
  type NormalizedPlaceFeedback,
  type NormalizedSchedule,
  type NormalizedStopOutcomes,
} from '../domain/trip';
import { formatWeatherSummary } from '../domain/weather';
import { getEditedPlanSchedule } from '../domain/planEditing';
import type { WeatherDataMap } from '../types/weatherData';
import type { AiModeText, TranslateFn } from '../types/ui';

type AiPlannerMode = 'replan' | 'generate';

interface UseAiPromptControllerOptions {
  aiGenerateText: AiModeText;
  aiPlannerMode: AiPlannerMode;
  aiPlannerQuestionRef: RefObject<HTMLTextAreaElement | null>;
  copyText: (text: string, message: string) => void;
  editorPlan: NormalizedPlan | null | undefined;
  hasInitializedPlans: boolean;
  isCreatingPlan: boolean;
  language: string;
  lodgings: NormalizedLodging[];
  normalizedPlans: NormalizedPlan[];
  placeFeedback: NormalizedPlaceFeedback;
  stopOutcomes: NormalizedStopOutcomes;
  dayReviewHistory: Array<{
    tripId: string;
    tripName: string;
    dateId: string;
    planId: string;
    planName: string;
    rating: DayReviewRating;
    tags: DayReviewTag[];
    note: string;
    updatedAt: string;
  }>;
  planAssignments: Map<string, string>;
  plansById: Map<string, NormalizedPlan>;
  riskGroups: RiskGroup[];
  schedule: NormalizedSchedule;
  selectedDate: DisplayTripDate | null | undefined;
  startDateStr: string;
  t: TranslateFn;
  tripDates: DisplayTripDate[];
  tripDays: number;
  tripName: string;
  weatherData: WeatherDataMap;
}

export function useAiPromptController({
  aiGenerateText,
  aiPlannerMode,
  aiPlannerQuestionRef,
  copyText,
  editorPlan,
  hasInitializedPlans,
  isCreatingPlan,
  language,
  lodgings,
  normalizedPlans,
  placeFeedback,
  stopOutcomes,
  dayReviewHistory,
  planAssignments,
  plansById,
  riskGroups,
  schedule,
  selectedDate,
  startDateStr,
  t,
  tripDates,
  tripDays,
  tripName,
  weatherData,
}: UseAiPromptControllerOptions) {
  const blacklistedPlaces = Object.values(placeFeedback)
    .filter((entry) => entry.status === PlaceFeedbackStatus.Blacklisted)
    .map((entry) => ({ name: entry.label, address: entry.address }));
  const abandonedStops = Object.values(stopOutcomes)
    .filter((entry) => entry.status === StopOutcomeStatus.Abandoned)
    .map((entry) => ({
      date: entry.dateId,
      plan_id: entry.planId,
      stop_id: entry.stopId,
      stop_name: entry.stopTitle,
    }));
  const pastDayReviews = dayReviewHistory.map((review) => ({
    trip_id: review.tripId,
    trip_name: review.tripName,
    date: review.dateId,
    plan_id: review.planId,
    plan_name: review.planName,
    rating: review.rating,
    tags: review.tags,
    note: review.note,
  }));

  const buildAiPlanningPrompt = (mode: AiPlannerMode = aiPlannerMode) => {
    const planningStartDate = selectedDate || tripDates[0];
    const fixedDates = planningStartDate
      ? tripDates.filter((date) => date.id < planningStartDate.id)
      : [];
    const adjustableDates = planningStartDate
      ? tripDates.filter((date) => date.id >= planningStartDate.id)
      : tripDates;
    const completedPlanIds = new Set(
      fixedDates
        .map((date) => schedule[date.id]?.planId)
        .filter(Boolean),
    );
    const remainingPlans = normalizedPlans.filter((plan) => !completedPlanIds.has(plan.id));

    const summarizeScheduleDate = (date: DisplayTripDate) => {
      const plan = schedule[date.id]?.planId ? plansById.get(schedule[date.id].planId) : null;
      const insight = getDayInsight(plan, date.id, schedule, plansById, weatherData, language);
      return {
        date: date.id,
        day: 'D' + date.dayNumber,
        display: date.display,
        plan_id: plan?.id || null,
        abandoned: schedule[date.id]?.status === 'abandoned' || undefined,
        status: insight.label || t('normal'),
        weather: insight.weatherText || '',
        note: insight.riskText || '',
        lodging: getLodgingContextForDate(lodgings, date.id, schedule, plansById),
      };
    };

    const summarizePlan = (plan: NormalizedPlan) => ({
      ...compactPlanForAi(plan, planAssignments.get(plan.id) || null) as object,
      weather_by_adjustable_date: adjustableDates.flatMap((date) => {
        const weather = evaluateWeather(plan, date.id, weatherData, language);
        return weather.snapshot ? [{
          date: date.id,
          status: weather.label,
          summary: formatWeatherSummary(weather.snapshot, language),
        }] : [];
      }),
    });

    const tripContext = {
      trip: {
        name: tripName || t('unnamedTrip'),
        range: formatTripRange(startDateStr, tripDays, language),
        days: tripDays,
        current_date: getTodayId(),
        planning_from: planningStartDate?.id || null,
      },
      lodgings: lodgings.map(compactLodgingForAi),
      blacklisted_places: blacklistedPlaces,
      abandoned_stops: abandonedStops,
      past_day_reviews: pastDayReviews,
      current_warnings: riskGroups.map((group) => ({
        title: translateRiskTitle(group.title, language),
        level: group.level,
        items: group.items,
      })),
    };

    return buildAiPlanningPromptText({
      mode,
      language,
      tripContext,
      hasInitializedPlans,
      plannerQuestion: aiPlannerQuestionRef.current?.value || '',
      unplannedDates: tripDates.filter((date) => !schedule[date.id]?.planId),
      fixedDates,
      adjustableDates,
      remainingPlans,
      normalizedPlans,
      summarizeScheduleDate,
      summarizePlan,
    });
  };

  const copyAiPlanningPrompt = () => {
    copyText(buildAiPlanningPrompt(), t('aiPromptCopied', { label: getAiModeText(aiPlannerMode, language).label }));
  };

  const copyBatchAiPrompt = () => {
    copyText(buildAiPlanningPrompt('generate'), t('aiPromptCopied', { label: aiGenerateText.label }));
  };

  const buildPlanAiPrompt = (planQuestion: string = '', draftPlan = editorPlan, assignedDay?: string, draftHotels?: NormalizedLodging[]) => {
    const currentPlan = draftPlan
      ? compactPlanForAi(draftPlan, assignedDay ?? planAssignments.get(draftPlan.id) ?? null)
      : null;
    const planUserRequest = planQuestion.trim() || (isCreatingPlan
      ? (language === 'en' ? 'Add a plan that fits the current trip.' : '请新增一个适合当前旅行的计划。')
      : (language === 'en' ? 'Improve the current plan.' : '请优化当前计划。'));
    const tripContext = {
      name: tripName || t('unnamedTrip'),
      range: formatTripRange(startDateStr, tripDays, language),
      days: tripDays,
      current_date: getTodayId(),
      planning_from: assignedDay || planAssignments.get(draftPlan?.id || '') || selectedDate?.id,
    };
    const draftPlans = new Map(plansById);
    if (draftPlan) draftPlans.set(draftPlan.id, draftPlan);
    const draftDate = assignedDay ?? planAssignments.get(draftPlan?.id || '');
    const draftSchedule = draftPlan ? getEditedPlanSchedule(schedule, editorPlan?.id || null, draftPlan.id, draftDate || '') : schedule;
    const nextDate = draftDate ? addDays(draftDate, 1) : '';
    const nextPlan = plansById.get(schedule[nextDate]?.planId);
    const nextDay = nextPlan ? { date: nextDate, plan_id: nextPlan.id, stops: nextPlan.stops.slice(0, 2).map(compactStopRouteForAi) } : undefined;
    const planContext = isCreatingPlan
      ? {
        trip: tripContext,
        lodgings: (draftHotels || lodgings).map(compactLodgingForAi),
        lodging_by_date: tripDates.map((date) => ({ date: date.id, ...getLodgingContextForDate(draftHotels || lodgings, date.id, draftSchedule, draftPlans) as object })),
        next_day: nextDay,
        existing_plan_ids: normalizedPlans.map((plan) => plan.id),
        draft_plan: currentPlan,
        blacklisted_places: blacklistedPlaces,
        abandoned_stops: abandonedStops,
        past_day_reviews: pastDayReviews,
      }
      : {
        trip: tripContext,
        lodgings: (draftHotels || lodgings).map(compactLodgingForAi),
        lodging_by_date: tripDates.map((date) => ({ date: date.id, ...getLodgingContextForDate(draftHotels || lodgings, date.id, draftSchedule, draftPlans) as object })),
        next_day: nextDay,
        current_plan: currentPlan,
        blacklisted_places: blacklistedPlaces,
        abandoned_stops: abandonedStops,
        past_day_reviews: pastDayReviews,
      };

    return buildSinglePlanPrompt({
      language,
      isCreatingPlan,
      planContext,
      userRequest: planUserRequest,
    });
  };

  const copyPlanAiPrompt = (planQuestion: string = '', draftPlan?: NormalizedPlan, assignedDay?: string, draftHotels?: NormalizedLodging[]) => {
    copyText(buildPlanAiPrompt(planQuestion, draftPlan, assignedDay, draftHotels), isCreatingPlan ? t('addPlanPromptCopied') : t('editPlanPromptCopied'));
  };

  return {
    buildAiPlanningPrompt,
    buildPlanAiPrompt,
    copyAiPlanningPrompt,
    copyBatchAiPrompt,
    copyPlanAiPrompt,
  };
}

import type { RefObject } from 'react';
import {
  buildAiPlanningPrompt as buildAiPlanningPromptText,
  buildSinglePlanPrompt,
  compactLocationForAi,
  compactLodgingForAi,
  compactPlanForAi,
  compactTransferForAi,
  getLodgingContextForDate,
} from '../domain/aiPrompts';
import { evaluateWeather, getDayInsight } from '../domain/dayInsight';
import {
  formatTripRange,
  getAiModeText,
  getPriorityLabel,
  translateRiskTitle,
  type DisplayTripDate,
} from '../domain/display';
import type {
  NormalizedPlan,
  PlanBooking,
  PlanReminder,
  PlanStop,
} from '../domain/plan';
import type { RiskGroup } from '../domain/risk';
import type { NormalizedLodging, NormalizedSchedule } from '../domain/trip';
import { formatWeatherSummary } from '../domain/weather';
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
        plan_name: plan?.name || null,
        status: insight.label || t('normal'),
        weather: insight.weatherText || '',
        note: insight.riskText || '',
        lodging: getLodgingContextForDate(lodgings, date.id),
      };
    };

    const summarizePlan = (plan: NormalizedPlan) => ({
      plan_id: plan.id,
      name: plan.name,
      priority: getPriorityLabel(plan.priority, language),
      description: plan.description,
      current_assigned_date: planAssignments.get(plan.id) || null,
      available_dates: plan.available_dates,
      closed_dates: plan.closed_dates,
      weather_rules: plan.weather_rules,
      location: compactLocationForAi(plan.location),
      stops: plan.stops.map((stop: PlanStop) => ({
        time: stop.time,
        title: stop.title,
        location: stop.location.label,
        address: stop.location.address || '',
        transfer_from_previous: compactTransferForAi(stop.transferFromPrevious),
        opening_hours: stop.openingHours,
        note: stop.note,
      })),
      bookings: plan.bookings.map((booking: PlanBooking) => ({
        title: booking.title,
        type: booking.type,
        status: booking.status,
        address: booking.address,
        url: booking.url,
        cancel_url: booking.cancelUrl,
        note: booking.note,
      })),
      reminders: plan.reminders.map((item: PlanReminder) => ({
        time: item.time,
        text: item.text,
        links: item.links || [],
      })),
      tips: plan.tips,
      conflicts: plan.conflicts,
      weather_by_adjustable_date: adjustableDates.map((date) => {
        const weather = evaluateWeather(plan, date.id, weatherData, language);
        return {
          date: date.id,
          status: weather.label,
          summary: weather.snapshot ? formatWeatherSummary(weather.snapshot, language) : t('weatherUnknown'),
        };
      }),
    });

    const tripContext = {
      trip: {
        name: tripName || t('unnamedTrip'),
        range: formatTripRange(startDateStr, tripDays, language),
        days: tripDays,
        planning_from: planningStartDate?.id || null,
      },
      lodgings: lodgings.map(compactLodgingForAi),
      existing_schedule: tripDates.map(summarizeScheduleDate),
      existing_plans: normalizedPlans.map(summarizePlan),
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

  const buildPlanAiPrompt = (planQuestion: string = '') => {
    const currentPlan = editorPlan
      ? compactPlanForAi(editorPlan, planAssignments.get(editorPlan.id) || null)
      : null;
    const planUserRequest = planQuestion.trim() || (isCreatingPlan
      ? (language === 'en' ? 'Add a plan that fits the current trip.' : '请新增一个适合当前旅行的计划。')
      : (language === 'en' ? 'Improve the current plan.' : '请优化当前计划。'));
    const tripContext = {
      name: tripName || t('unnamedTrip'),
      range: formatTripRange(startDateStr, tripDays, language),
      days: tripDays,
    };
    const planContext = isCreatingPlan
      ? {
        trip: tripContext,
        lodgings: lodgings.map(compactLodgingForAi),
        existing_plan_ids: normalizedPlans.map((plan) => plan.id),
      }
      : {
        trip: tripContext,
        lodgings: lodgings.map(compactLodgingForAi),
        current_plan: currentPlan,
      };

    return buildSinglePlanPrompt({
      language,
      isCreatingPlan,
      planContext,
      userRequest: planUserRequest,
    });
  };

  const copyPlanAiPrompt = (planQuestion: string = '') => {
    copyText(buildPlanAiPrompt(planQuestion), isCreatingPlan ? t('addPlanPromptCopied') : t('editPlanPromptCopied'));
  };

  return {
    buildAiPlanningPrompt,
    buildPlanAiPrompt,
    copyAiPlanningPrompt,
    copyBatchAiPrompt,
    copyPlanAiPrompt,
  };
}

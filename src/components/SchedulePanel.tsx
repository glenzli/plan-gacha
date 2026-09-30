import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { MobileRiskPanel } from './RiskPanels';
import { WeatherIcon } from './PlanContent';
import type { DisplayTripDate } from '../domain/display';
import type { CalendarDayState, DayInsight } from '../domain/dayInsight';
import { findDayReview, type NormalizedDayReviews } from '../domain/dayReview';
import { getDayReviewRatingLabel } from '../domain/dayReviewDisplay';
import type { NormalizedPlan } from '../domain/plan';
import { ScheduleEntryStatus, type NormalizedSchedule } from '../domain/trip';
import type { RiskActionTarget, RiskGroup } from '../domain/risk';
import type { TranslateFn } from '../types/ui';
import type { WeatherDataMap } from '../types/weatherData';

export function SchedulePanel({
  mobileOverviewOpen, onToggleOverview, todayId, onOpenRisk, onOpenChecklist,
  dayTileRefs,
  formatMiniDate,
  getCalendarDayState,
  getDayInsight,
  getPriorityLabel,
  language,
  mobileRisksOpen,
  onEditLodging,
  onToggleMobileRisks,
  plansById,
  riskGroups,
  schedule,
  dayReviews,
  selectScheduleDate,
  selectedDate,
  t,
  translateRiskTitle,
  tripDates,
  weatherData,
}: {
  mobileOverviewOpen: boolean;
  onToggleOverview: () => void;
  todayId: string;
  onOpenRisk: (target: RiskActionTarget) => void;
  onOpenChecklist: () => void;
  dayTileRefs: RefObject<Map<string, HTMLButtonElement | null>>;
  formatMiniDate: (dateId: string) => string;
  getCalendarDayState: (plan: NormalizedPlan | null | undefined, insight: Pick<DayInsight, 'issueCount' | 'level'>, language: string) => CalendarDayState;
  getDayInsight: (
    plan: NormalizedPlan | null | undefined,
    dateId: string,
    schedule: NormalizedSchedule,
    plansById: Map<string, NormalizedPlan>,
    weatherData: WeatherDataMap,
    language: string,
  ) => DayInsight;
  getPriorityLabel: (priority: string, language: string) => string;
  language: string;
  mobileRisksOpen: boolean;
  onEditLodging: () => void;
  onToggleMobileRisks: () => void;
  plansById: Map<string, NormalizedPlan>;
  riskGroups: RiskGroup[];
  schedule: NormalizedSchedule;
  dayReviews: NormalizedDayReviews;
  selectScheduleDate: (dateId: string, options?: { scroll?: boolean }) => void;
  selectedDate: DisplayTripDate | undefined;
  t: TranslateFn;
  translateRiskTitle: (title: string, language: string) => string;
  tripDates: DisplayTripDate[];
  weatherData: WeatherDataMap;
}) {
  const miniDayRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  useEffect(() => {
    if (!selectedDate || !window.matchMedia('(max-width: 560px)').matches) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      miniDayRefs.current.get(selectedDate.id)?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [selectedDate]);

  return (
    <aside className={`side-panel schedule-panel ${mobileOverviewOpen ? 'is-overview-open' : ''}`}>
      <div className="panel-header">
        <h2>{t('itinerary')}</h2>
      </div>

      <div className="mini-calendar" aria-label={t('dailyOverview')}>
        {tripDates.map((date) => {
          const entry = schedule[date.id];
          const plan = entry ? plansById.get(entry.planId) : null;
          const selected = selectedDate?.id === date.id;
          const insight = getDayInsight(plan, date.id, schedule, plansById, weatherData, language);
          const calendarState = getCalendarDayState(plan, insight, language);

          return (
            <button
              className={`mini-day state-${calendarState.key} ${selected ? 'is-selected' : ''}`}
              key={date.id}
              type="button"
              aria-label={`D${date.dayNumber} ${formatMiniDate(date.id)} ${calendarState.ariaLabel}`}
              aria-current={selected ? 'date' : undefined}
              ref={(node) => {
                if (node) miniDayRefs.current.set(date.id, node);
                else miniDayRefs.current.delete(date.id);
              }}
              onClick={() => selectScheduleDate(date.id, { scroll: true })}
            >
              <strong>{date.id === todayId ? t('today') : `D${date.dayNumber}`}</strong>
              <em>{formatMiniDate(date.id)}</em>
              {calendarState.label && <span>{calendarState.label}</span>}
            </button>
          );
        })}
      </div>

      <div className="mobile-overview-toolbar">
        <span>{t('tripDays', { count: tripDates.length })}</span>
        <button className="btn btn-small btn-outline" type="button" aria-expanded={mobileOverviewOpen} aria-controls="trip-day-list" onClick={onToggleOverview}>{t(mobileOverviewOpen ? 'backToItinerary' : 'tripOverview')}</button>
      </div>

      <MobileRiskPanel
        riskGroups={riskGroups}
        mobileRisksOpen={mobileRisksOpen}
        onToggle={onToggleMobileRisks}
        t={t}
        language={language}
        translateRiskTitle={translateRiskTitle}
        onEditLodging={onEditLodging}
        onOpenRisk={onOpenRisk}
        onOpenChecklist={onOpenChecklist}
      />

      <div className="day-list" id="trip-day-list" aria-label={t('dateList')}>
        {tripDates.map((date) => {
          const entry = schedule[date.id];
          const plan = entry ? plansById.get(entry.planId) : null;
          const selected = selectedDate?.id === date.id;
          const insight = getDayInsight(plan, date.id, schedule, plansById, weatherData, language);
          const dayReview = plan && entry?.status !== ScheduleEntryStatus.Abandoned
            ? findDayReview(date.id, plan.id, dayReviews)
            : undefined;

          return (
              <button
                key={date.id}
                className={`day-tile ${selected ? 'is-selected' : ''} ${plan ? 'has-plan' : ''} ${plan ? `priority-${plan.priority}` : ''} status-${insight.level}`}
                type="button"
                ref={(node) => {
                  if (node) dayTileRefs.current.set(date.id, node);
                  else dayTileRefs.current.delete(date.id);
                }}
                onClick={() => selectScheduleDate(date.id)}
              >
                <span className="day-number">D{date.dayNumber}</span>
                <span className="day-main">
                  <span className="day-date">{date.display}{date.id === todayId && <span className="today-badge">{t('today')}</span>}</span>
                  <span className="day-plan">
                    {plan?.name || t('unassigned')}
                    {plan && <span className={`day-priority priority-${plan.priority}`}>{getPriorityLabel(plan.priority, language)}</span>}
                    {dayReview && (
                      <span className={`day-review-badge rating-${dayReview.rating}`}>
                        {getDayReviewRatingLabel(dayReview.rating, t)}
                      </span>
                    )}
                  </span>
                </span>
                {insight.label && (
                  <span className={`day-status status-${insight.level}`}>
                    {insight.label}
                  </span>
                )}
                <span className="day-weather">
                  {insight.level !== ScheduleEntryStatus.Abandoned && (
                    <WeatherIcon condition={insight.weatherCondition} level={insight.level} />
                  )}
                  <span>{insight.weatherText}</span>
                </span>
                {insight.riskText && <span className={`day-risk ${insight.riskTone}`}>{insight.riskText}</span>}
              </button>
          );
        })}
      </div>
    </aside>
  );
}

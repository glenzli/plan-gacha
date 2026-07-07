import { Fragment } from 'react';
import type { RefObject, ReactNode } from 'react';
import { MobileRiskPanel } from './RiskPanels';
import { WeatherIcon } from './PlanContent';
import type { DisplayTripDate } from '../domain/display';
import type { NormalizedPlan } from '../domain/plan';
import type { NormalizedSchedule } from '../domain/trip';
import type { RiskGroup } from '../domain/risk';
import type { TranslateFn } from '../types/ui';
import type { WeatherDataMap } from '../types/weatherData';

function MobileDayWorkspace({
  availableCandidateCount,
  renderCandidateGroups,
  selectedDate,
  t,
}: {
  availableCandidateCount: number;
  renderCandidateGroups: (gridClassName?: string) => ReactNode;
  selectedDate: DisplayTripDate | undefined;
  t: TranslateFn;
}) {
  return (
    <div className="mobile-workspace">
      <div className="mobile-workspace-header">
        <span>{t('dayCurrent', { day: selectedDate?.dayNumber || 1 })}</span>
        <span>{t('switchableCount', { count: availableCandidateCount })}</span>
      </div>

      <div className="section-title compact-section-title">
        <h2>{t('candidates')}</h2>
        <span>{t('available', { count: availableCandidateCount })}</span>
      </div>

      {renderCandidateGroups('plan-grid mobile-plan-grid')}
    </div>
  );
}

export function SchedulePanel({
  availableCandidateCount,
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
  renderCandidateGroups,
  renderCurrentPlanCard,
  riskGroups,
  schedule,
  selectScheduleDate,
  selectedDate,
  t,
  translateRiskTitle,
  tripDates,
  weatherData,
}: {
  availableCandidateCount: number;
  dayTileRefs: RefObject<Map<string, HTMLButtonElement | null>>;
  formatMiniDate: (dateId: string) => string;
  getCalendarDayState: (plan: NormalizedPlan | null | undefined, insight: any, language: string) => { key: string; ariaLabel: string; label?: string };
  getDayInsight: (
    plan: NormalizedPlan | null | undefined,
    dateId: string,
    schedule: NormalizedSchedule,
    plansById: Map<string, NormalizedPlan>,
    weatherData: WeatherDataMap,
    language: string,
  ) => any;
  getPriorityLabel: (priority: string, language: string) => string;
  language: string;
  mobileRisksOpen: boolean;
  onEditLodging: () => void;
  onToggleMobileRisks: () => void;
  plansById: Map<string, NormalizedPlan>;
  renderCandidateGroups: (gridClassName?: string) => ReactNode;
  renderCurrentPlanCard: (className: string) => ReactNode;
  riskGroups: RiskGroup[];
  schedule: NormalizedSchedule;
  selectScheduleDate: (dateId: string, options?: { scroll?: boolean }) => void;
  selectedDate: DisplayTripDate | undefined;
  t: TranslateFn;
  translateRiskTitle: (title: string, language: string) => string;
  tripDates: DisplayTripDate[];
  weatherData: WeatherDataMap;
}) {
  return (
    <aside className="side-panel schedule-panel">
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
              onClick={() => selectScheduleDate(date.id, { scroll: true })}
            >
              <strong>D{date.dayNumber}</strong>
              <em>{formatMiniDate(date.id)}</em>
              {calendarState.label && <span>{calendarState.label}</span>}
            </button>
          );
        })}
      </div>

      <MobileRiskPanel
        riskGroups={riskGroups}
        mobileRisksOpen={mobileRisksOpen}
        onToggle={onToggleMobileRisks}
        t={t}
        language={language}
        translateRiskTitle={translateRiskTitle}
        onEditLodging={onEditLodging}
      />

      <div className="day-list" aria-label={t('dateList')}>
        {tripDates.map((date) => {
          const entry = schedule[date.id];
          const plan = entry ? plansById.get(entry.planId) : null;
          const selected = selectedDate?.id === date.id;
          const insight = getDayInsight(plan, date.id, schedule, plansById, weatherData, language);

          return (
            <Fragment key={date.id}>
              <button
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
                  <span className="day-date">{date.display}</span>
                  <span className="day-plan">
                    {plan?.name || t('unassigned')}
                    {plan && <span className={`day-priority priority-${plan.priority}`}>{getPriorityLabel(plan.priority, language)}</span>}
                  </span>
                </span>
                {insight.label && (
                  <span className={`day-status status-${insight.level}`}>
                    {insight.label}
                  </span>
                )}
                <span className="day-weather">
                  <WeatherIcon condition={insight.weatherCondition} level={insight.level} />
                  <span>{insight.weatherText}</span>
                </span>
                {insight.riskText && <span className={`day-risk ${insight.riskTone}`}>{insight.riskText}</span>}
              </button>
              {selected && renderCurrentPlanCard('current-plan selected-day-plan')}
              {selected && (
                <div className="mobile-day-detail">
                  <MobileDayWorkspace
                    availableCandidateCount={availableCandidateCount}
                    renderCandidateGroups={renderCandidateGroups}
                    selectedDate={selectedDate}
                    t={t}
                  />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </aside>
  );
}

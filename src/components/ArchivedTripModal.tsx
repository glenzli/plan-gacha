import { Icon } from './Icon';
import { WeatherIcon } from './PlanContent';
import { addDays, parseDateId } from '../domain/date';
import { normalizePlan, type NormalizedPlan } from '../domain/plan';
import {
  normalizeSchedule,
  PlaceFeedbackStatus,
  ScheduleEntryStatus,
  StopOutcomeStatus,
  type NormalizedTripSnapshot,
} from '../domain/trip';
import { formatWeatherDataSummary, getWeatherIconCondition, getWeatherLocationSummaryRows } from '../domain/weather';
import type { WeatherEvaluation } from '../domain/weather';
import type { PlanRenderer, TranslateFn } from '../types/ui';
import type { WeatherDataMap } from '../types/weatherData';

interface ArchivedTripModalProps {
  evaluateWeather: (plan: NormalizedPlan, dateId: string, weatherData: WeatherDataMap, language: string) => WeatherEvaluation;
  formatTripRange: (startDateStr: string, tripDays: number, language: string) => string;
  getPriorityLabel: (priority: string, language: string) => string;
  language: string;
  onClose: () => void;
  renderPlanBookings: PlanRenderer;
  renderPlanNotes: PlanRenderer;
  renderPlanStops: PlanRenderer;
  t: TranslateFn;
  trip: NormalizedTripSnapshot;
  weatherData: WeatherDataMap;
}

function getLocale(language: string) {
  return language === 'en' ? 'en-US' : 'zh-CN';
}

function createArchivedTripDates(startDateStr: string, tripDays: number, language: string) {
  if (!startDateStr || tripDays < 1) return [];

  return Array.from({ length: tripDays }, (_, index) => {
    const id = addDays(startDateStr, index);
    const date = parseDateId(id);
    const display = date.toLocaleDateString(getLocale(language), {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
    });
    return { id, display, dayNumber: index + 1 };
  });
}

export function ArchivedTripModal({
  evaluateWeather,
  formatTripRange,
  getPriorityLabel,
  language,
  onClose,
  renderPlanBookings,
  renderPlanNotes,
  renderPlanStops,
  t,
  trip,
  weatherData,
}: ArchivedTripModalProps) {
  const archiveDates = createArchivedTripDates(trip.startDateStr, trip.tripDays, language);
  const archivePlans = (trip.plans || []).map((plan, index) => normalizePlan(plan, index, archiveDates));
  const archivePlansById = new Map(archivePlans.map((plan) => [plan.id, plan]));
  const archiveSchedule = normalizeSchedule(trip.schedule);
  const abandonedDayCount = Object.values(archiveSchedule)
    .filter((entry) => entry.status === ScheduleEntryStatus.Abandoned).length;
  const blacklistedPlaceCount = Object.values(trip.placeFeedback || {})
    .filter((entry) => entry.status === PlaceFeedbackStatus.Blacklisted).length;
  const abandonedStopCount = Object.values(trip.stopOutcomes || {})
    .filter((entry) => entry.status === StopOutcomeStatus.Abandoned).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal archived-view-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">{t('archivedView')}</p>
            <h2>{trip.name}</h2>
            <span className="archived-view-meta">
              {formatTripRange(trip.startDateStr, trip.tripDays, language)} · {t('daysCount', { count: trip.tripDays })}
            </span>
            {(abandonedDayCount > 0 || abandonedStopCount > 0 || blacklistedPlaceCount > 0) && (
              <span className="archived-outcome-summary">
                {[
                  abandonedDayCount > 0 ? t('abandonedDaysCount', { count: abandonedDayCount }) : '',
                  abandonedStopCount > 0 ? t('abandonedStopsCount', { count: abandonedStopCount }) : '',
                  blacklistedPlaceCount > 0 ? t('blacklistedPlacesCount', { count: blacklistedPlaceCount }) : '',
                ].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          <div className="archived-view-actions">
            <span className="readonly-badge">{t('readOnly')}</span>
            <button className="icon-btn" type="button" onClick={onClose} aria-label={t('close')}>
              <Icon name="x" />
            </button>
          </div>
        </div>

        <div className="archived-view-body">
          {archiveDates.map((date) => {
            const plan = archivePlansById.get(archiveSchedule[date.id]?.planId);
            const abandoned = archiveSchedule[date.id]?.status === ScheduleEntryStatus.Abandoned;
            const weather = plan ? evaluateWeather(plan, date.id, weatherData, language) : null;

            return (
              <article className={`archived-day-card ${plan ? `priority-${plan.priority}` : 'is-empty'} ${abandoned ? 'is-abandoned' : ''}`} key={date.id}>
                <div className="archived-day-head">
                  <div>
                    <p className="eyebrow">D{date.dayNumber}</p>
                    <h3>{date.display}</h3>
                  </div>
                  {plan && (
                    <div className="archived-day-badges">
                      {abandoned && <span className="outcome-badge">{t('dayAbandoned')}</span>}
                      <span className={`priority-badge ${plan.priority}`}>
                        {getPriorityLabel(plan.priority, language)}
                      </span>
                    </div>
                  )}
                </div>

                {plan ? (
                  <>
                    <div className="archived-plan-summary">
                      <h2>{plan.name}</h2>
                      <p>{plan.description}</p>
                    </div>
                    {abandoned && (
                      <div className="abandoned-plan-note archived-abandoned-note">
                        <strong>{t('dayAbandoned')}</strong>
                        <span>{t('abandonedPlanKept')}</span>
                      </div>
                    )}
                    {renderPlanStops(plan, {
                      readOnly: true,
                      dateId: date.id,
                      placeFeedback: trip.placeFeedback,
                      stopOutcomes: trip.stopOutcomes,
                    })}
                    {renderPlanBookings(plan, { readOnly: true })}
                    {renderPlanNotes(plan)}
                    {weather && (() => {
                      const weatherCondition = getWeatherIconCondition(weather.snapshot);
                      const weatherRows = getWeatherLocationSummaryRows(weather.snapshot, language);
                      return (
                        <div className={`weather-line ${weather.level} condition-${weatherCondition}`}>
                          <strong>
                            <WeatherIcon condition={weatherCondition} level={weather.level} />
                            <span>{weather.label}</span>
                          </strong>
                          <span className="weather-summary">
                            {weather.snapshot ? formatWeatherDataSummary(weather.snapshot, language) : t('noWeatherForPlace')}
                          </span>
                          {weatherRows.length > 1 && (
                            <span className="weather-location-list">
                              {weatherRows.map((row) => (
                                <span className="weather-location-row" key={row.key}>
                                  <WeatherIcon condition={row.condition} level={weather.level} />
                                  <span className="weather-location-name">{row.label}</span>
                                  <span className="weather-location-summary">{row.summary}</span>
                                </span>
                              ))}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="empty-state">{t('noPlanForDay')}</div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

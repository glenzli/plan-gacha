import { Icon } from './Icon';
import { DayReviewSummary } from './DayReview';
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
import { findDayReview, getDayReviewsForDate } from '../domain/dayReview';
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
  const reviewedDayCount = new Set(Object.values(trip.dayReviews || {}).map((review) => review.dateId)).size;

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
            {(reviewedDayCount > 0 || abandonedDayCount > 0 || abandonedStopCount > 0 || blacklistedPlaceCount > 0) && (
              <span className="archived-outcome-summary">
                {[
                  reviewedDayCount > 0 ? t('reviewedDaysCount', { count: reviewedDayCount }) : '',
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
            const dateReviews = getDayReviewsForDate(date.id, trip.dayReviews || {});
            const dayReview = plan && !abandoned
              ? findDayReview(date.id, plan.id, trip.dayReviews || {})
              : undefined;
            const previousReviews = plan
              ? dateReviews.filter((review) => review.planId !== plan.id)
              : dateReviews;

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
                    {dayReview && <DayReviewSummary review={dayReview} t={t} />}
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
                {previousReviews.length > 0 && (
                  <details className="archived-previous-reviews">
                    <summary>{t('previousPlanReviews')} · {previousReviews.length}</summary>
                    <div>
                      {previousReviews.map((review) => (
                        <section key={review.key}>
                          <strong>{review.planName || review.planId}</strong>
                          <DayReviewSummary review={review} t={t} />
                        </section>
                      ))}
                    </div>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

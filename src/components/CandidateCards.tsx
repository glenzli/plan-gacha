import { Fragment, useState } from 'react';
import { formatAssignedDate } from '../domain/risk';
import {
  formatWeatherDataSummary,
  getWeatherIconCondition,
  getWeatherLocationSummaryRows,
} from '../domain/weather';
import type { NormalizedPlan } from '../domain/plan';
import type {
  CandidateGroupData,
  CandidateSelectedDate,
  CandidateTripDate,
  PlanBookingBadgeGetter,
  PlanCandidate,
  PriorityLabelGetter,
} from '../types/candidates';
import type { PlanRenderer, TranslateFn } from '../types/ui';
import { Icon } from './Icon';
import { WeatherIcon } from './PlanContent';

interface PlanBookingBadgeProps {
  plan?: NormalizedPlan | null;
  language: string;
  getPlanBookingBadge: PlanBookingBadgeGetter;
}

interface CandidateSignalsProps {
  candidate?: PlanCandidate | null;
  t: TranslateFn;
  language: string;
}

interface CandidateRenderProps {
  t: TranslateFn;
  language: string;
  tripDates: CandidateTripDate[];
  selectedDate?: CandidateSelectedDate | null;
  requestAssignPlan: (dateId: string, planId: string) => void;
  openPlanEditor: (planId: string) => void;
  getPriorityLabel: PriorityLabelGetter;
  getPlanBookingBadge: PlanBookingBadgeGetter;
  getBlacklistedStopCount: (plan: NormalizedPlan) => number;
  getLodgingLabel: (plan: NormalizedPlan) => string;
  renderPlanStops: PlanRenderer;
  renderPlanBookings: PlanRenderer;
  renderPlanNotes: PlanRenderer;
}

interface CandidateGroupsProps extends CandidateRenderProps {
  candidateGroups: CandidateGroupData[];
  gridClassName?: string;
}

export function PlanBookingBadge({ plan, language, getPlanBookingBadge }: PlanBookingBadgeProps) {
  const bookingBadge = getPlanBookingBadge(plan, language);
  if (!bookingBadge) return null;

  return (
    <span className={`booking-badge status-${bookingBadge.status}`}>
      {bookingBadge.label}
    </span>
  );
}

export function CandidateSignals({ candidate, t, language }: CandidateSignalsProps) {
  if (!candidate) return null;

  const { hardReasons = [], notes = [], weather } = candidate;
  const weatherCondition = getWeatherIconCondition(weather.snapshot);
  const weatherRows = getWeatherLocationSummaryRows(weather.snapshot, language);
  const visibleHardReasons = hardReasons.filter(
    (reason) => !(weather.level === 'blocked' && reason === weather.label),
  );

  return (
    <>
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

      {(visibleHardReasons.length > 0 || notes.length > 0) && (
        <div className="reason-row">
          {visibleHardReasons.map((reason) => (
            <span className="is-danger" key={reason}>{reason}</span>
          ))}
          {notes.map((reason) => (
            <span key={reason}>{reason}</span>
          ))}
        </div>
      )}
    </>
  );
}

function CandidateDetails({
  plan,
  selectedDate,
  t,
  renderPlanStops,
  renderPlanBookings,
  renderPlanNotes,
}: Pick<CandidateRenderProps, 'selectedDate' | 't' | 'renderPlanStops' | 'renderPlanBookings' | 'renderPlanNotes'> & {
  plan: NormalizedPlan;
}) {
  const hasDetails = Boolean(plan?.stops.length || plan?.bookings.length || plan?.reminders.length || plan?.tips.length);
  if (!hasDetails) return null;

  const routeStops = plan.stops
    .map((stop) => stop.title || stop.location.label)
    .filter(Boolean);
  const visibleRouteStops = routeStops.slice(0, 4);
  const hiddenRouteCount = Math.max(routeStops.length - visibleRouteStops.length, 0);

  return (
    <details className="candidate-card-details">
      <summary>
        {visibleRouteStops.length > 0 && (
          <span className="candidate-route-summary">
            {visibleRouteStops.map((label, index) => (
              <Fragment key={`${plan.id}-route-${label}-${index}`}>
                {index > 0 && <span className="route-separator">-&gt;</span>}
                <span>{label}</span>
              </Fragment>
            ))}
            {hiddenRouteCount > 0 && <em>+{hiddenRouteCount}</em>}
          </span>
        )}
        <span className="candidate-detail-toggle">
          <span className="details-closed">{t('viewPlanDetails')}</span>
          <span className="details-open">{t('hidePlanDetails')}</span>
          <span className="details-chevron" aria-hidden="true" />
        </span>
      </summary>
      <div className="candidate-card-detail-body">
        {renderPlanStops(plan, { dateId: selectedDate?.id })}
        {renderPlanBookings(plan)}
        {renderPlanNotes(plan)}
      </div>
    </details>
  );
}

function CandidateActions({
  plan,
  canAssign,
  weatherOverride,
  selectedDate,
  requestAssignPlan,
  openPlanEditor,
  t,
}: Pick<CandidateRenderProps, 'selectedDate' | 'requestAssignPlan' | 'openPlanEditor' | 't'> & {
  plan: NormalizedPlan;
  canAssign: boolean;
  weatherOverride: boolean;
}) {
  return (
    <div className="candidate-actions">
      <button
        className={`btn btn-small candidate-select-btn ${weatherOverride && canAssign ? 'is-risky' : ''}`}
        type="button"
        disabled={!canAssign || !selectedDate}
        onClick={() => selectedDate && requestAssignPlan(selectedDate.id, plan.id)}
        aria-label={`${t('useThisPlan')} · ${plan.name}`}
        title={t('useThisPlan')}
      >
        <Icon name="check" />
        {t('useThisPlan')}
      </button>
      <button
        className="icon-btn compact-icon-btn candidate-edit-btn"
        type="button"
        onClick={() => openPlanEditor(plan.id)}
        aria-label={t('editSinglePlan')}
        title={t('editSinglePlan')}
      >
        <Icon name="pencil" />
      </button>
    </div>
  );
}

function CandidateCard({
  candidate,
  t,
  language,
  tripDates,
  selectedDate,
  requestAssignPlan,
  openPlanEditor,
  getPriorityLabel,
  getPlanBookingBadge,
  getBlacklistedStopCount,
  getLodgingLabel,
  renderPlanStops,
  renderPlanBookings,
  renderPlanNotes,
}: CandidateRenderProps & { candidate: PlanCandidate }) {
  const { plan, canAssign, assignedDateId, isAlreadyVisited, weatherOverride } = candidate;
  const blacklistedStopCount = getBlacklistedStopCount(plan);

  return (
    <article
      className={`plan-card ${!canAssign ? 'is-disabled is-mobile-collapsed' : ''} ${weatherOverride && canAssign ? 'is-weather-risk' : ''} priority-${plan.priority}`}
      key={plan.id}
    >
      <div className="plan-card-header">
        <div>
          <div className="title-row">
            <h3>{plan.name}</h3>
            <span className={`priority-badge ${plan.priority}`}>{getPriorityLabel(plan.priority, language)}</span>
            <PlanBookingBadge
              plan={plan}
              language={language}
              getPlanBookingBadge={getPlanBookingBadge}
            />
            {blacklistedStopCount > 0 && (
              <span className="place-feedback-badge">
                {t('blacklistedStopsCount', { count: blacklistedStopCount })}
              </span>
            )}
            {assignedDateId && (
              <span className="assigned-badge">
                {isAlreadyVisited
                  ? t('visitedOn', { date: formatAssignedDate(assignedDateId, tripDates) })
                  : t('scheduledOn', { date: formatAssignedDate(assignedDateId, tripDates) })}
              </span>
            )}
          </div>
          <p>{plan.description}</p>
          {getLodgingLabel(plan) && <p className="candidate-lodging">{t('tonightLodging')} · {getLodgingLabel(plan)}</p>}
        </div>
      </div>

      <CandidateDetails
        plan={plan}
        selectedDate={selectedDate}
        t={t}
        renderPlanStops={renderPlanStops}
        renderPlanBookings={renderPlanBookings}
        renderPlanNotes={renderPlanNotes}
      />
      <CandidateSignals candidate={candidate} t={t} language={language} />

      <CandidateActions
        plan={plan}
        canAssign={canAssign}
        weatherOverride={weatherOverride}
        selectedDate={selectedDate}
        requestAssignPlan={requestAssignPlan}
        openPlanEditor={openPlanEditor}
        t={t}
      />
    </article>
  );
}

export function CandidateGroups({
  candidateGroups,
  gridClassName = 'plan-grid',
  ...cardProps
}: CandidateGroupsProps) {
  const [search, setSearch] = useState('');
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filteredGroups = candidateGroups.map((group) => ({
    ...group,
    items: group.items.filter(({ plan }) => {
      const text = [plan.name, plan.description, plan.location.label, plan.location.address,
        ...plan.stops.flatMap((stop) => [stop.title, stop.location.label, stop.location.address])].join(' ').toLocaleLowerCase();
      return terms.every((term) => text.includes(term));
    }),
  })).filter((group) => group.items.length);
  const resultCount = filteredGroups.reduce((count, group) => count + group.items.length, 0);

  return (
    <div className="candidate-group-list">
      <div className="candidate-search">
        <label className="candidate-search-field"><span>{cardProps.t('searchPlans')}</span><input className="input" type="search" value={search} placeholder={cardProps.t('searchPlansPlaceholder')} onChange={(event) => setSearch(event.target.value)} /></label>
        {search && <button className="btn btn-small btn-outline" type="button" onClick={() => setSearch('')}>{cardProps.t('clearSearch')}</button>}
      </div>
      {terms.length > 0 && <p className="candidate-search-status" role="status">{cardProps.t(resultCount ? 'matchingPlans' : 'noMatchingPlans', { count: resultCount })}</p>}
      {filteredGroups.map((group) => {
        const cards = <div className={gridClassName}>{group.items.map((candidate) => <CandidateCard key={candidate.plan.id} candidate={candidate} {...cardProps} />)}</div>;
        if (group.key === 'unavailable' || group.key === 'visited') return (
          <details className={`candidate-group candidate-group-${group.key}`} key={`${group.key}-${terms.length > 0}`} open={terms.length > 0 || undefined}>
            <summary className="candidate-group-title"><span>{group.title}</span><span>{cardProps.t('itemsCount', { count: group.items.length })}</span></summary>
            {cards}
          </details>
        );
        return (
        <section className={`candidate-group candidate-group-${group.key}`} key={group.key}>
          <div className="candidate-group-title">
            <h3>{group.title}</h3>
            <span>{cardProps.t('itemsCount', { count: group.items.length })}</span>
          </div>
          {cards}
        </section>
      );})}
    </div>
  );
}

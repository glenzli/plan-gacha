import { Fragment, type ReactNode } from 'react';
import { formatAssignedDate } from '../domain/risk';
import {
  formatWeatherDataSummary,
  getWeatherIconCondition,
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
import type { TranslateFn } from '../types/ui';
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
  renderPlanStops: (plan: NormalizedPlan | null | undefined) => ReactNode;
  renderPlanBookings: (plan: NormalizedPlan | null | undefined) => ReactNode;
  renderPlanNotes: (plan: NormalizedPlan | null | undefined) => ReactNode;
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
  const visibleHardReasons = hardReasons.filter(
    (reason) => !(weather.level === 'blocked' && reason === weather.label),
  );

  return (
    <>
      <div className={`weather-line ${weather.level}`}>
        <strong>
          <WeatherIcon condition={getWeatherIconCondition(weather.snapshot)} level={weather.level} />
          <span>{weather.label}</span>
        </strong>
        <span className="weather-summary">
          {weather.snapshot ? formatWeatherDataSummary(weather.snapshot, language) : t('noWeatherForPlace')}
        </span>
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
  t,
  renderPlanStops,
  renderPlanBookings,
  renderPlanNotes,
}: Pick<CandidateRenderProps, 't' | 'renderPlanStops' | 'renderPlanBookings' | 'renderPlanNotes'> & {
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
        {renderPlanStops(plan)}
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
        className={`icon-btn compact-icon-btn candidate-select-btn ${weatherOverride && canAssign ? 'is-risky' : ''}`}
        type="button"
        disabled={!canAssign || !selectedDate}
        onClick={() => selectedDate && requestAssignPlan(selectedDate.id, plan.id)}
        aria-label={`${t('select')} ${plan.name}`}
        title={t('select')}
      >
        <Icon name="check" />
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
  renderPlanStops,
  renderPlanBookings,
  renderPlanNotes,
}: CandidateRenderProps & { candidate: PlanCandidate }) {
  const { plan, canAssign, assignedDateId, weatherOverride } = candidate;

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
            {assignedDateId && (
              <span className="assigned-badge">
                {t('scheduledOn', { date: formatAssignedDate(assignedDateId, tripDates) })}
              </span>
            )}
          </div>
          <p>{plan.description}</p>
        </div>
      </div>

      <CandidateDetails
        plan={plan}
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
  return (
    <div className="candidate-group-list">
      {candidateGroups.map((group) => (
        <section className={`candidate-group candidate-group-${group.key}`} key={group.key}>
          <div className="candidate-group-title">
            <h3>{group.title}</h3>
            <span>{cardProps.t('itemsCount', { count: group.items.length })}</span>
          </div>
          <div className={gridClassName}>
            {group.items.map((candidate) => (
              <CandidateCard
                key={candidate.plan.id}
                candidate={candidate}
                {...cardProps}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

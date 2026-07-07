import type { ReactNode } from 'react';
import type { NormalizedPlan, PlanPriority } from '../domain/plan';
import type { PlanBookingBadgeData, PlanCandidate } from '../types/candidates';
import type { TranslateFn } from '../types/ui';
import { CandidateSignals, PlanBookingBadge } from './CandidateCards';
import { Icon } from './Icon';

interface SelectedDateLike {
  id: string;
}

interface CurrentPlanCardProps {
  className: string;
  selectedDate?: SelectedDateLike | null;
  selectedPlan?: NormalizedPlan | null;
  currentCandidate?: PlanCandidate | null;
  planImageBusy: boolean;
  shareCurrentPlanImage: (cardElement: HTMLElement | null) => void;
  openPlanEditor: (planId: string) => void;
  clearDay: (dateId: string) => void;
  t: TranslateFn;
  language: string;
  getPriorityLabel: (priority: PlanPriority | string, language: string) => string;
  getPlanBookingBadge: (plan: NormalizedPlan | null | undefined, language: string) => PlanBookingBadgeData | null;
  renderPlanStops: (plan: NormalizedPlan | null | undefined) => ReactNode;
  renderPlanBookings: (plan: NormalizedPlan | null | undefined) => ReactNode;
  renderPlanNotes: (plan: NormalizedPlan | null | undefined) => ReactNode;
}

export function CurrentPlanCard({
  className,
  selectedDate,
  selectedPlan,
  currentCandidate,
  planImageBusy,
  shareCurrentPlanImage,
  openPlanEditor,
  clearDay,
  t,
  language,
  getPriorityLabel,
  getPlanBookingBadge,
  renderPlanStops,
  renderPlanBookings,
  renderPlanNotes,
}: CurrentPlanCardProps) {
  return (
    <div className={className} data-current-plan-card="true">
      <div>
        <p className="eyebrow">{t('currentPlanLabel')}</p>
        <div className="title-row current-title-row">
          <h2>{selectedPlan?.name || t('unplannedToday')}</h2>
          {selectedPlan && (
            <span className={`priority-badge ${selectedPlan.priority}`}>
              {getPriorityLabel(selectedPlan.priority, language)}
            </span>
          )}
          <PlanBookingBadge
            plan={selectedPlan}
            language={language}
            getPlanBookingBadge={getPlanBookingBadge}
          />
        </div>
        <p className="current-plan-summary">{selectedPlan?.description || t('currentPlanHelp')}</p>
        {renderPlanStops(selectedPlan)}
        {renderPlanBookings(selectedPlan)}
        {renderPlanNotes(selectedPlan)}
        <CandidateSignals candidate={currentCandidate} t={t} language={language} />
      </div>

      {selectedDate && selectedPlan && (
        <div className="current-actions">
          <button
            className="icon-btn compact-icon-btn"
            type="button"
            disabled={planImageBusy}
            onClick={(event) => shareCurrentPlanImage(event.currentTarget.closest('[data-current-plan-card="true"]'))}
            aria-label={t('sharePlanImage')}
            title={t('sharePlanImage')}
            data-screenshot-exclude="true"
          >
            <Icon name="camera" />
          </button>
          <button
            className="icon-btn compact-icon-btn"
            type="button"
            onClick={() => openPlanEditor(selectedPlan.id)}
            aria-label={`${t('editSinglePlan')} ${selectedPlan.name}`}
            title={t('editSinglePlan')}
            data-screenshot-exclude="true"
          >
            <Icon name="pencil" />
          </button>
          <button
            className="icon-btn compact-icon-btn current-clear-btn"
            type="button"
            onClick={() => clearDay(selectedDate.id)}
            aria-label={t('clear')}
            title={t('clear')}
            data-screenshot-exclude="true"
          >
            <Icon name="x" />
          </button>
        </div>
      )}
    </div>
  );
}

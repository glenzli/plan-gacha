import { Icon } from './Icon';
import { formatAssignedDate } from '../domain/risk';
import type { TripDateLike } from '../domain/risk';
import type { NormalizedPlan, PlanPriority } from '../domain/plan';
import type { TranslateFn } from '../types/ui';

interface PlanReviewPanelProps {
  getPriorityLabel: (priority: PlanPriority | string, language: string) => string;
  language: string;
  normalizedPlans: NormalizedPlan[];
  onOpenPlanEditor: (planId?: string) => void;
  onRemovePlan: (planId: string) => void;
  planAssignments: Map<string, string>;
  t: TranslateFn;
  tripDates: TripDateLike[];
}

export function PlanReviewPanel({
  getPriorityLabel,
  language,
  normalizedPlans,
  onOpenPlanEditor,
  onRemovePlan,
  planAssignments,
  t,
  tripDates,
}: PlanReviewPanelProps) {
  return (
    <div className="editor-section">
      <div className="panel-header compact">
        <h2>{t('planList')}</h2>
        <span className="small-stat">{t('itemsCount', { count: normalizedPlans.length })}</span>
      </div>
      <div className="plan-review-list">
        {normalizedPlans.map((plan) => {
          const assignedDate = planAssignments.get(plan.id);
          return (
            <div className="plan-review-row" key={plan.id}>
              <div>
                <strong>{plan.name}</strong>
                <span>
                  {getPriorityLabel(plan.priority, language)}
                  {assignedDate ? t('scheduledSuffix', { date: formatAssignedDate(assignedDate, tripDates) }) : t('unscheduledSuffix')}
                </span>
              </div>
              <div className="plan-review-actions">
                <button
                  className="icon-btn compact-icon-btn"
                  type="button"
                  onClick={() => onOpenPlanEditor(plan.id)}
                  aria-label={`${t('editPlan')} ${plan.name}`}
                  title={t('editPlan')}
                >
                  <Icon name="pencil" />
                </button>
                <button
                  className="icon-btn compact-icon-btn danger-icon-btn"
                  type="button"
                  onClick={() => onRemovePlan(plan.id)}
                  aria-label={`${t('delete')} ${plan.name}`}
                  title={t('delete')}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </div>
          );
        })}
        <button className="plan-add-row" type="button" onClick={() => onOpenPlanEditor()}>
          <strong>{t('addPlan')}</strong>
          <span>{t('addPlanHelp')}</span>
        </button>
      </div>
    </div>
  );
}

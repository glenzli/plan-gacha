import { useModalDialog } from '../hooks/useModalDialog';
import { Icon } from './Icon';
import { LodgingImpactList } from './LodgingPanel';
import type { NormalizedPlan } from '../domain/plan';
import type { AssignmentClearItem } from '../domain/planning';
import type { RiskItem } from '../domain/risk';
import type { PendingAssignment } from '../hooks/useScheduleAssignmentController';
import type { TranslateFn } from '../types/ui';

interface AssignmentImpactModalProps {
  language: string;
  onClose: () => void;
  onConfirm: () => void;
  pendingAssignment: PendingAssignment;
  t: TranslateFn;
  translateIssue: (issue: string, language: string) => string;
  translateRiskTitle: (title: string, language: string) => string;
}

export function AssignmentImpactModal({
  language,
  onClose,
  onConfirm,
  pendingAssignment,
  t,
  translateIssue,
  translateRiskTitle,
}: AssignmentImpactModalProps) {
  const dialogRef = useModalDialog(onClose);
  const clears = pendingAssignment.clears;
  const nextRisks: RiskItem<NormalizedPlan>[] = pendingAssignment.nextRisks;
  const movedItems = clears.filter((item: AssignmentClearItem) => item.reason === '同一计划被移动');
  const clearedItems = clears.filter((item: AssignmentClearItem) => item.reason !== '同一计划被移动');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal impact-modal"
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assignment-impact-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-header">
          <h2 id="assignment-impact-title">{t('impactPreview')}</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={t('close')} title={t('close')}>
            <Icon name="x" />
          </button>
        </div>

        <div className="impact-summary">
          <strong>{pendingAssignment.targetPlan.name}</strong>
          <span>{t('assignToDate', { date: pendingAssignment.dateId })}</span>
        </div>

        {movedItems.length > 0 && (
          <div className="impact-section">
            <h3>{t('datesToMove')}</h3>
            {movedItems.map((item: AssignmentClearItem) => (
              <div className="impact-row is-move" key={`${item.dateId}-${item.plan.id}`}>
                <span>{item.dateId}</span>
                <strong>{item.plan.name}</strong>
                <em>{translateIssue(item.reason, language)}</em>
              </div>
            ))}
          </div>
        )}

        {clearedItems.length > 0 && (
          <div className="impact-section">
            <h3>{t('datesToClear')}</h3>
            {clearedItems.map((item: AssignmentClearItem) => (
              <div className="impact-row" key={`${item.dateId}-${item.plan.id}`}>
                <span>{item.dateId}</span>
                <strong>{item.plan.name}</strong>
                <em>{translateIssue(item.reason, language)}</em>
              </div>
            ))}
          </div>
        )}

        <LodgingImpactList impacts={pendingAssignment.lodgingImpacts} t={t} />
        {nextRisks.length > 0 && (
          <div className="impact-section">
            <h3>{t('nextRisks')}</h3>
            {nextRisks.map((risk) => (
              <div className={`risk-item ${risk.level}`} key={risk.plan.id}>
                <strong>{risk.plan.name}</strong>
                <p>
                  {translateRiskTitle(risk.title, language)}
                  {risk.reasons?.length
                    ? `${language === 'en' ? ': ' : '：'}${risk.reasons.map((reason) => translateIssue(reason, language)).join(' / ')}`
                    : ''}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-outline" type="button" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn btn-primary" type="button" onClick={onConfirm}>
            {t('continueAdjust')}
          </button>
        </div>
      </div>
    </div>
  );
}

// @ts-nocheck
import { Icon } from './Icon';

export function AssignmentImpactModal({
  language,
  onClose,
  onConfirm,
  pendingAssignment,
  t,
  translateIssue,
  translateRiskTitle,
}) {
  const movedItems = pendingAssignment.clears.filter((item) => item.reason === '同一计划被移动');
  const clearedItems = pendingAssignment.clears.filter((item) => item.reason !== '同一计划被移动');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal impact-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <h2>{t('impactPreview')}</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={t('close')}>
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
            {movedItems.map((item) => (
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
            {clearedItems.map((item) => (
              <div className="impact-row" key={`${item.dateId}-${item.plan.id}`}>
                <span>{item.dateId}</span>
                <strong>{item.plan.name}</strong>
                <em>{translateIssue(item.reason, language)}</em>
              </div>
            ))}
          </div>
        )}

        {pendingAssignment.nextRisks.length > 0 && (
          <div className="impact-section">
            <h3>{t('nextRisks')}</h3>
            {pendingAssignment.nextRisks.map((risk) => (
              <div className={`risk-item ${risk.level}`} key={risk.plan.id}>
                <strong>{risk.plan.name}</strong>
                <p>
                  {translateRiskTitle(risk.title, language)}
                  {risk.reasons.length
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

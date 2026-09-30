import { useModalDialog } from '../hooks/useModalDialog';
import type { AiModeText, TextAreaRef, TranslateFn, VoidFn } from '../types/ui';
import { Icon } from './Icon';

interface AiPlannerModalProps {
  aiPlannerQuestionRef: TextAreaRef;
  aiPlannerResultRef: TextAreaRef;
  aiReplanText: AiModeText;
  applyAiPlannerResult: VoidFn;
  copyAiPlanningPrompt: VoidFn;
  onClose: VoidFn;
  t: TranslateFn;
}

export function AiPlannerModal({
  aiPlannerQuestionRef,
  aiPlannerResultRef,
  aiReplanText,
  applyAiPlannerResult,
  copyAiPlanningPrompt,
  onClose,
  t,
}: AiPlannerModalProps) {
  const dialogRef = useModalDialog(onClose);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ai-planner-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('aiReplan')} onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">{t('aiPlanning')}</p>
            <h2>{t('aiReplan')}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={t('closeAiPlanning')} title={t('closeAiPlanning')}>
            <Icon name="x" />
          </button>
        </div>

        <p className="ai-planner-summary">
          {t('aiPlanningSummary')}
          <span>{aiReplanText.helper}</span>
        </p>

        <label>
          <span>{t('extraQuestion')}</span>
          <textarea
            className="textarea ai-question"
            ref={aiPlannerQuestionRef}
            placeholder={aiReplanText.placeholder}
          />
        </label>

        <label>
          <span>{t('aiResult')}</span>
          <textarea
            className="textarea ai-result"
            ref={aiPlannerResultRef}
            placeholder={t('aiReplanResultPlaceholder')}
          />
        </label>

        <div className="modal-actions">
          <button className="btn btn-outline" type="button" onClick={onClose}>
            {t('close')}
          </button>
          <button className="btn btn-primary" type="button" onClick={copyAiPlanningPrompt}>
            {t('copyToAi')}
          </button>
          <button className="btn btn-primary" type="button" onClick={applyAiPlannerResult}>
            {t('applyResult')}
          </button>
        </div>
      </div>
    </div>
  );
}

import type { NormalizedPlan } from '../domain/plan';
import type { AiModeText, TextAreaRef, TranslateFn, VoidFn } from '../types/ui';

interface BatchAiPlanPanelProps {
  aiGenerateText: AiModeText;
  aiPlannerQuestionRef: TextAreaRef;
  aiPlannerResultRef: TextAreaRef;
  batchAiOpen: boolean;
  copyBatchAiPrompt: VoidFn;
  applyAiPlannerResult: VoidFn;
  handleExportState: VoidFn;
  loadExampleTrip: VoidFn;
  normalizedPlans: NormalizedPlan[];
  onOpenImport: VoidFn;
  onToggleBatchAi: VoidFn;
  t: TranslateFn;
}

export function BatchAiPlanPanel({
  aiGenerateText,
  aiPlannerQuestionRef,
  aiPlannerResultRef,
  batchAiOpen,
  copyBatchAiPrompt,
  applyAiPlannerResult,
  handleExportState,
  loadExampleTrip,
  normalizedPlans,
  onOpenImport,
  onToggleBatchAi,
  t,
}: BatchAiPlanPanelProps) {
  return (
    <div className="editor-section">
      <div className="panel-header compact">
        <h2>{t('planData')}</h2>
        <span className="small-stat">{t('plansCount', { count: normalizedPlans.length })}</span>
      </div>
      <div className="action-grid editor-action-grid">
        <button
          className={`btn ai-toggle-btn ${batchAiOpen ? 'is-open' : 'btn-primary'}`}
          type="button"
          aria-expanded={batchAiOpen}
          onClick={onToggleBatchAi}
          title={t('aiPlanPoolTitle')}
        >
          <span>{t('aiGenerateShort')}</span>
          <span className="toggle-chevron" aria-hidden="true" />
        </button>
        <button className="btn btn-outline" type="button" onClick={loadExampleTrip} title={t('loadFullExample')}>
          {t('viewExample')}
        </button>
        <button className="btn btn-outline" type="button" onClick={onOpenImport} title={t('importJsonTitle')}>
          {t('import')}
        </button>
        <button className="btn btn-outline" type="button" onClick={handleExportState} title={t('copyCurrentJson')}>
          {t('export')}
        </button>
      </div>
      {batchAiOpen && (
        <div className="editor-ai-panel">
          <div className="panel-header compact">
            <div>
              <h3>{t('aiPlanPoolTitle')}</h3>
              <p>{t('aiPlanPoolHelp')}</p>
            </div>
          </div>

          <label>
            <span>{t('yourRequest')}</span>
            <textarea
              className="textarea ai-question"
              ref={aiPlannerQuestionRef}
              placeholder={aiGenerateText.placeholder}
            />
          </label>

          <label>
            <span>{t('aiResult')}</span>
            <textarea
              className="textarea ai-result"
              ref={aiPlannerResultRef}
              placeholder={t('aiResultPlaceholder')}
            />
          </label>

          <div className="modal-actions">
            <button className="btn btn-outline" type="button" onClick={copyBatchAiPrompt}>
              {t('copyToAi')}
            </button>
            <button className="btn btn-primary" type="button" onClick={applyAiPlannerResult}>
              {t('applyResult')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

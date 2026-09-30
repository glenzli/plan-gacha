import { useId, useState } from 'react';
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
  onOpenPlanEditor: () => void;
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
  onOpenPlanEditor,
  onToggleBatchAi,
  t,
}: BatchAiPlanPanelProps) {
  const isEmpty = normalizedPlans.length === 0;
  const [backupOpen, setBackupOpen] = useState(false);
  const backupPanelId = useId();

  return (
    <div className="editor-section">
      <div className="panel-header compact">
        <h2>{t(isEmpty ? 'startTripTitle' : 'planData')}</h2>
        {!isEmpty && <span className="small-stat">{t('plansCount', { count: normalizedPlans.length })}</span>}
      </div>
      {isEmpty ? (
        <div className="trip-start-panel">
          <p>{t('startTripHelp')}</p>
          <div className="trip-start-options">
            <button
              className={`btn ${batchAiOpen ? 'btn-primary' : 'btn-outline'}`}
              type="button"
              aria-pressed={batchAiOpen}
              onClick={() => { if (!batchAiOpen) onToggleBatchAi(); }}
            >
              {t('startWithAi')}
            </button>
            <button className="btn btn-outline" type="button" onClick={onOpenImport}>
              {t('startWithImport')}
            </button>
            <button className="btn btn-outline" type="button" onClick={onOpenPlanEditor}>
              {t('startBlank')}
            </button>
          </div>
          <button className="btn btn-small btn-ghost" type="button" onClick={loadExampleTrip}>
            {t('viewExample')}
          </button>
        </div>
      ) : (
        <>
          <div className="itinerary-tools">
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
            <button
              className="btn btn-outline"
              type="button"
              aria-expanded={backupOpen}
              aria-controls={backupPanelId}
              onClick={() => setBackupOpen((open) => !open)}
            >
              {t('importAndBackup')}
              <span className="toggle-chevron" aria-hidden="true" />
            </button>
          </div>
          {backupOpen && (
            <div className="import-backup-tools editor-action-grid" id={backupPanelId}>
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
          )}
        </>
      )}
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

// @ts-nocheck
import { memo, useState } from 'react';

function PlanRawJsonEditor({ value, t, onChange }) {
  return (
    <div className="plan-raw-json-editor">
      <div className="panel-header compact">
        <div>
          <h3>{t('rawPlanJsonTitle')}</h3>
          <p>{t('rawPlanJsonHelp')}</p>
        </div>
      </div>
      <textarea
        className="textarea plan-raw-json"
        value={value}
        spellCheck={false}
        placeholder={t('rawPlanJsonPlaceholder')}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

const PlanEditorPreview = memo(function PlanEditorPreview({
  isCreatingPlan,
  editorPlan,
  t,
  renderPlanStops,
  renderPlanBookings,
  renderPlanNotes,
}) {
  return (
    <section className="plan-editor-preview">
      <div className="plan-editor-current">
        <p className="eyebrow">{isCreatingPlan ? t('newPlan') : t('currentPlan')}</p>
        <h2>{isCreatingPlan ? t('addPlan') : editorPlan?.name || t('planMissing')}</h2>
        {!isCreatingPlan && editorPlan && (
          <>
            <p>{editorPlan.description}</p>
            {renderPlanStops(editorPlan)}
            {renderPlanBookings(editorPlan)}
            {renderPlanNotes(editorPlan)}
          </>
        )}
        {isCreatingPlan && (
          <p>{t('newPlanHelp')}</p>
        )}
      </div>
    </section>
  );
});

export function PlanEditorDetail({
  isCreatingPlan,
  editorPlan,
  initialDraftJson,
  t,
  onBack,
  onCopyPrompt,
  onApplyDraft,
  renderPlanStops,
  renderPlanBookings,
  renderPlanNotes,
}) {
  const [planEditorMode, setPlanEditorMode] = useState('ai');
  const [questionDraft, setQuestionDraft] = useState('');
  const [manualDraftJson, setManualDraftJson] = useState(initialDraftJson || '');
  const [aiDraftJson, setAiDraftJson] = useState('');
  const hasAiDraft = aiDraftJson.trim().length > 0;
  const effectiveDraftJson = hasAiDraft ? aiDraftJson : manualDraftJson;

  const updateEffectiveDraftJson = (nextDraft) => {
    if (hasAiDraft) {
      setAiDraftJson(nextDraft);
    } else {
      setManualDraftJson(nextDraft);
    }
  };

  return (
    <div className="plan-editor-detail">
      <button className="btn btn-small btn-outline plan-back-btn" type="button" onClick={onBack}>
        {t('backToList')}
      </button>

      <div className="plan-editor-split">
        <PlanEditorPreview
          isCreatingPlan={isCreatingPlan}
          editorPlan={editorPlan}
          t={t}
          renderPlanStops={renderPlanStops}
          renderPlanBookings={renderPlanBookings}
          renderPlanNotes={renderPlanNotes}
        />

        <section className="plan-editor-workspace">
          <div className="plan-editor-mode">
            <span>{t('editMode')}</span>
            <div className="editor-tabs plan-editor-mode-tabs" role="tablist" aria-label={t('editSinglePlan')}>
              <button
                className={planEditorMode === 'ai' ? 'is-active' : ''}
                type="button"
                role="tab"
                aria-selected={planEditorMode === 'ai'}
                onClick={() => setPlanEditorMode('ai')}
              >
                {t('aiEditTab')}
              </button>
              <button
                className={planEditorMode === 'json' ? 'is-active' : ''}
                type="button"
                role="tab"
                aria-selected={planEditorMode === 'json'}
                onClick={() => setPlanEditorMode('json')}
              >
                {t('rawJsonTab')}
              </button>
            </div>
          </div>

          <div className="plan-editor-ai-pane" hidden={planEditorMode !== 'ai'}>
            <label className="plan-ai-question-field">
              <span>{t('yourRequest')}</span>
              <textarea
                className="textarea plan-ai-question"
                value={questionDraft}
                placeholder={isCreatingPlan ? t('newPlanPlaceholder') : t('editPlanPlaceholder')}
                onChange={(event) => setQuestionDraft(event.target.value)}
              />
            </label>
            <div className="plan-ai-copy-row">
              <button className="btn btn-outline" type="button" onClick={() => onCopyPrompt(questionDraft)}>
                {t('copyToAi')}
              </button>
            </div>

            <label>
              <span>{t('aiResult')}</span>
              <textarea
                className="textarea plan-ai-result"
                value={aiDraftJson}
                placeholder={t('planAiResultPlaceholder')}
                spellCheck={false}
                onChange={(event) => setAiDraftJson(event.target.value)}
              />
            </label>
          </div>

          <div className="plan-editor-manual-pane" hidden={planEditorMode !== 'json'}>
            <PlanRawJsonEditor
              value={effectiveDraftJson}
              t={t}
              onChange={updateEffectiveDraftJson}
            />
          </div>
          <div className="modal-actions plan-editor-actions">
            <button className="btn btn-primary" type="button" onClick={() => onApplyDraft(effectiveDraftJson)}>
              {t('applyPlanDraft')}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

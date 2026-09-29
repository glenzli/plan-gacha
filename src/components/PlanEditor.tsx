import { useEffect, useMemo, useState } from 'react';
import { PlanConstraintEditor } from './PlanConstraintEditor';
import { PlanContentEditor } from './PlanContentEditor';
import { evaluateWeather } from '../domain/dayInsight';
import { translateIssue, type DisplayTripDate } from '../domain/display';
import { applyPlanConstraintDraft, getPlanConstraintDraft, getPlanEditImpacts } from '../domain/planConstraints';
import { getEditablePlan, getEditedPlanSchedule, serializePlanEditDraft, updateRelatedPlan, type PlanEditDraft } from '../domain/planEditing';
import { normalizePlan, type NormalizedPlan } from '../domain/plan';
import type { NormalizedSchedule } from '../domain/trip';
import type { WeatherDataMap } from '../types/weatherData';
import type { PlanRenderer, TranslateFn } from '../types/ui';

interface PlanEditorDetailProps {
  editorPlan: NormalizedPlan | null | undefined;
  initialDraftJson: string;
  isCreatingPlan: boolean;
  language: string;
  t: TranslateFn;
  onBack: () => void;
  onCopyPrompt: (question: string, draft: NormalizedPlan, assignedDay: string) => void;
  onApplyDraft: (draftJson: string) => void;
  parseDraft: (draftJson: string) => PlanEditDraft;
  onDirtyChange: (dirty: boolean) => void;
  plans: NormalizedPlan[];
  schedule: NormalizedSchedule;
  tripDates: DisplayTripDate[];
  weatherData: WeatherDataMap;
  renderPlanStops: PlanRenderer;
  renderPlanBookings: PlanRenderer;
  renderPlanNotes: PlanRenderer;
}

export function PlanEditorDetail({
  isCreatingPlan, editorPlan, initialDraftJson, language, t, onBack, onCopyPrompt,
  onApplyDraft, parseDraft, onDirtyChange, plans, schedule, tripDates, weatherData,
  renderPlanStops, renderPlanBookings, renderPlanNotes,
}: PlanEditorDetailProps) {
  const [initialDraft] = useState<PlanEditDraft>(() => {
    const payload = JSON.parse(initialDraftJson);
    return { plan: editorPlan ? getEditablePlan(editorPlan, plans) : { ...normalizePlan(payload, 0, tripDates), description: payload.description || '' }, assignedDay: payload.assigned_day || '' };
  });
  const [draft, setDraft] = useState(initialDraft);
  const [locationSource, setLocationSource] = useState(initialDraft.plan);
  const [mode, setMode] = useState<'content' | 'constraints' | 'ai'>(isCreatingPlan ? 'ai' : 'content');
  const [question, setQuestion] = useState('');
  const [resultJson, setResultJson] = useState('');
  const [readError, setReadError] = useState('');
  const [resultLoaded, setResultLoaded] = useState(false);
  const [readVersion, setReadVersion] = useState(0);
  const hasPendingResult = Boolean(resultJson.trim());
  const changed = serializePlanEditDraft(draft) !== serializePlanEditDraft(initialDraft);
  const dirty = changed || hasPendingResult || Boolean(question.trim());
  const nextPlans = useMemo(() => isCreatingPlan ? [...plans, draft.plan] : plans.map((plan) => plan.id === editorPlan?.id ? draft.plan : updateRelatedPlan(plan, editorPlan?.id || null, draft.plan)), [plans, draft.plan, editorPlan, isCreatingPlan]);
  const nextSchedule = useMemo(() => getEditedPlanSchedule(schedule, editorPlan?.id || null, draft.plan.id, draft.assignedDay), [schedule, editorPlan, draft]);
  const impacts = useMemo(() => getPlanEditImpacts(plans, nextPlans, schedule, nextSchedule, weatherData, evaluateWeather), [plans, nextPlans, schedule, nextSchedule, weatherData]);
  const replacedPlanId = draft.assignedDay !== initialDraft.assignedDay ? schedule[draft.assignedDay]?.planId : null;
  const replacedPlan = plans.find((plan) => plan.id === replacedPlanId && plan.id !== editorPlan?.id);
  const hasImpacts = Boolean(impacts.length || replacedPlan);
  const validationMessage = !draft.plan.name.trim() ? t('planNameRequired')
    : !draft.plan.stops.length || draft.plan.stops.some((stop) => !stop.title.trim() && !stop.location.label.trim()) ? t('planStopsRequired')
      : !tripDates.some((date) => draft.plan.available_dates.includes(date.id) && !draft.plan.closed_dates.includes(date.id)) ? t('constraintNoAvailableDate') : '';

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);

  const readResult = () => {
    try {
      const next = parseDraft(resultJson);
      setDraft(next);
      setLocationSource(next.plan);
      setResultJson('');
      setReadError('');
      setResultLoaded(true);
      setReadVersion((version) => version + 1);
      setMode('content');
    } catch (error) {
      setReadError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="plan-editor-detail">
      <div className="plan-editor-topline">
        <button className="btn btn-small btn-outline" type="button" onClick={onBack}>{t('backToList')}</button>
        <span className="editor-draft-status">{dirty || isCreatingPlan ? t('draftUnsaved') : t('draftSaved')}</span>
      </div>
      <div className="plan-editor-heading"><h3>{isCreatingPlan ? t('addPlan') : editorPlan?.name || t('planMissing')}</h3></div>
      <div className="editor-tabs plan-editor-mode-tabs has-constraints" role="tablist" aria-label={t('editSinglePlan')}>
        {(['content', 'constraints', 'ai'] as const).map((tab) => (
          <button key={tab} className={mode === tab ? 'is-active' : ''} type="button" role="tab" aria-selected={mode === tab} aria-controls={`plan-editor-${tab}`} id={`plan-editor-tab-${tab}`} onClick={() => setMode(tab)}>
            {t(tab === 'content' ? 'contentEditTab' : tab === 'constraints' ? 'constraintTab' : 'aiEditTab')}
          </button>
        ))}
      </div>
      {resultLoaded && <p className="editor-inline-notice" role="status">{t('planResultLoaded')}</p>}

      <div className="plan-editor-pane" id="plan-editor-content" role="tabpanel" aria-labelledby="plan-editor-tab-content" hidden={mode !== 'content'}>
        <PlanContentEditor key={readVersion} plan={draft.plan} locationSource={locationSource} onChange={(plan) => setDraft({ ...draft, plan })} t={t} />
      </div>
      <div className="plan-editor-pane" id="plan-editor-constraints" role="tabpanel" aria-labelledby="plan-editor-tab-constraints" hidden={mode !== 'constraints'}>
        <PlanConstraintEditor language={language} draft={getPlanConstraintDraft(draft.plan)} onChange={(constraints) => setDraft({ ...draft, plan: applyPlanConstraintDraft(draft.plan, constraints) })} plan={draft.plan} plans={nextPlans} t={t} tripDates={tripDates} />
      </div>
      <div className="plan-editor-pane plan-editor-ai-pane" id="plan-editor-ai" role="tabpanel" aria-labelledby="plan-editor-tab-ai" hidden={mode !== 'ai'}>
        <p className="editor-help">{t('planAiSteps')}</p>
        <label><span>{t('yourRequest')}</span><textarea className="textarea plan-ai-question" value={question} placeholder={isCreatingPlan ? t('newPlanPlaceholder') : t('editPlanPlaceholder')} onChange={(event) => setQuestion(event.target.value)} /></label>
        <div className="plan-ai-copy-row"><button className="btn btn-outline" type="button" onClick={() => onCopyPrompt(question, draft.plan, draft.assignedDay)}>{t('copyToAi')}</button></div>
        <label><span>{t('aiResult')}</span><textarea className="textarea plan-ai-result" value={resultJson} placeholder={t('planAiResultPlaceholder')} spellCheck={false} onChange={(event) => { setResultJson(event.target.value); setReadError(''); }} /></label>
        {readError && <p className="constraint-error" role="alert">{readError}</p>}
        <div className="plan-result-actions">
          <button className="btn btn-primary" type="button" disabled={!hasPendingResult} onClick={readResult}>{t('previewPlanResult')}</button>
          {hasPendingResult && <button className="btn btn-outline" type="button" onClick={() => { setResultJson(''); setReadError(''); }}>{t('clearPlanResult')}</button>}
        </div>
        <details className="constraint-details"><summary>{t('advancedPlanJson')}</summary><p>{t('advancedPlanJsonHelp')}</p><button className="btn btn-small btn-outline" type="button" disabled={hasPendingResult} onClick={() => setResultJson(serializePlanEditDraft(draft))}>{t('editCurrentPlanJson')}</button></details>
      </div>

      {changed && (
        <div className={`constraint-impact ${hasImpacts ? 'has-impact' : ''}`} aria-live="polite">
          <strong>{hasImpacts ? t('constraintImpactTitle') : t('constraintNoImpact')}</strong>
          {draft.assignedDay !== initialDraft.assignedDay && draft.assignedDay && <p>{t('planMovesToDate', { date: draft.assignedDay })}</p>}
          {replacedPlan && <p>{t('planReplacesAssignment', { name: replacedPlan.name })}</p>}
          {impacts.length > 0 && <ul>{impacts.map((impact) => <li key={`${impact.dateId}-${impact.planName}`}><strong>{impact.dateId} · {impact.planName}</strong><span>{impact.reasons.map((reason) => translateIssue(reason, language)).join(' / ')}</span></li>)}</ul>}
        </div>
      )}
      <details className="plan-editor-preview">
        <summary>{t('previewEditedPlan')}</summary>
        <section className="plan-editor-current">
          <h2>{draft.plan.name}</h2><p>{draft.plan.description}</p>
          {renderPlanStops(draft.plan, { readOnly: true })}
          {renderPlanBookings(draft.plan, { readOnly: true })}
          {renderPlanNotes(draft.plan, { readOnly: true })}
        </section>
      </details>
      <div className="plan-editor-savebar">
        <span>{hasPendingResult ? t('pendingPlanResult') : validationMessage || t('saveAllPlanEdits')}</span>
        {hasPendingResult ? <button className="btn btn-outline" type="button" onClick={() => setMode('ai')}>{t('returnToAiResult')}</button> : (
          <button className="btn btn-primary" type="button" disabled={Boolean(validationMessage) || (!changed && !isCreatingPlan)} onClick={() => onApplyDraft(serializePlanEditDraft(draft))}>{hasImpacts ? t('savePlanWithImpact') : t('savePlanEdits')}</button>
        )}
      </div>
    </div>
  );
}

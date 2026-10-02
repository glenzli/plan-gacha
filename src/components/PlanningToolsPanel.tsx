import { useLayoutEffect, useRef, useState } from 'react';
import { callPlanningTool, planningProposalSchema, planningSnapshotSchema, type PlanningToolResponse } from '../domain/planningTools';
import { downloadBlob } from '../domain/browserExport';
import { normalizeSchedule, type NormalizedSchedule } from '../domain/trip';
import { candidateReasonTranslation, type CandidateReason } from '../domain/planCandidates';
import { translateRiskTitle, translateIssue } from '../domain/display';
import type { TranslateFn } from '../types/ui';

type PreviewResponse = Extract<PlanningToolResponse, { ok: true }>;
interface Props {
  getSnapshot: () => unknown;
  draftText: string;
  onDraftTextChange: (value: string) => void;
  planNames: Record<string, string>;
  language: string;
  onConfirm: (schedule: NormalizedSchedule) => void;
  t: TranslateFn;
}

/** Explicit handoff only: imports intent, recomputes all effects locally, then asks the traveller to save. */
export function PlanningToolsPanel({ getSnapshot, onConfirm, draftText, onDraftTextChange, planNames, language, t }: Props) {
  const latestSnapshot = useRef(getSnapshot);
  useLayoutEffect(() => { latestSnapshot.current = getSnapshot; }, [getSnapshot]);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const proposalRef = useRef<unknown>(null);
  const exportSnapshot = () => {
    try {
      const snapshot = planningSnapshotSchema.parse(latestSnapshot.current());
      downloadBlob(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }), 'plan-gacha-tool-snapshot.json');
      setError('');
    } catch { setError(t('planningToolsInvalid')); }
  };
  const evaluateProposal = async (proposal: unknown) => {
    const parsed = planningProposalSchema.safeParse(proposal);
    if (!parsed.success) throw new Error(t('planningToolsInvalid'));
    const snapshot = planningSnapshotSchema.parse(latestSnapshot.current());
    const signature = JSON.stringify(snapshot);
    const response = await callPlanningTool('preview_changes', { snapshot, expectedSnapshotToken: parsed.data.snapshotToken, operation: parsed.data.operation });
    if (!response.ok) throw new Error(t(response.error.code === 'stale_snapshot' ? 'planningToolsStale' : response.error.code === 'archived_snapshot' ? 'planningToolsArchived' : 'planningToolsInvalid'));
    if (JSON.stringify(planningSnapshotSchema.parse(latestSnapshot.current())) !== signature) throw new Error(t('planningToolsStale'));
    if (response.data.kind !== 'preview') throw new Error(t('planningToolsInvalid'));
    return response;
  };
  const readProposal = async () => {
    setBusy(true); setPreview(null); setError('');
    try {
      const value = JSON.parse(draftText);
      // Accept either the small proposal or the complete structured MCP result.
      const proposal = value?.ok === true && value?.data?.kind === 'preview' ? value.data.proposal : value;
      proposalRef.current = proposal;
      setPreview(await evaluateProposal(proposal));
    } catch (cause) { setError(cause instanceof SyntaxError ? t('planningToolsInvalid') : cause instanceof Error ? cause.message : t('planningToolsInvalid')); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true); setError('');
    try {
      // Compare to current browser content again; never trust nextSchedule from pasted JSON.
      const fresh = await evaluateProposal(proposalRef.current);
      if (fresh.data.kind !== 'preview' || !fresh.data.canApply) throw new Error(t('planningToolsBlocked'));
      onConfirm(normalizeSchedule(fresh.data.nextSchedule)); setPreview(null);
      onDraftTextChange('');
    } catch (cause) { setPreview(null); setError(cause instanceof SyntaxError ? t('planningToolsInvalid') : cause instanceof Error ? cause.message : t('planningToolsInvalid')); }
    finally { setBusy(false); }
  };
  const data = preview?.data.kind === 'preview' ? preview.data : null;
  return (
    <details className="planning-tools-panel">
      <summary>{t('planningToolsTitle')}</summary>
      <p>{t('planningToolsHandoff')}</p>
      <button className="btn btn-outline" type="button" onClick={exportSnapshot}>{t('planningToolsExport')}</button>
      <label>
        <span>{t('planningToolsProposal')}</span>
        <textarea className="textarea" value={draftText} onChange={(event) => { onDraftTextChange(event.target.value); setPreview(null); setError(''); }} placeholder={t('planningToolsProposalPlaceholder')} />
      </label>
      <button className="btn btn-outline" type="button" disabled={busy} onClick={() => void readProposal()}>{t('planningToolsPreview')}</button>
      {error && <p role="alert">{error}</p>}
      {data && <div className="planning-tools-preview" aria-live="polite">
        <p>{data.canApply ? t('planningToolsReview') : t('planningToolsBlocked')}</p>
        {data.reasonCodes.length > 0 && <p>{data.reasonCodes.map((code) => t(candidateReasonTranslation[code as CandidateReason] || 'planningToolsBlocked')).join(', ')}</p>}
        <ul>{data.changes.map((change) => <li key={change.dateId}>{change.dateId}: {planNames[change.before?.planId || ''] || t('planningToolsEmpty')} → {planNames[change.after?.planId || ''] || t('planningToolsEmpty')}</li>)}</ul>
        {data.commitmentImpacts.length > 0 && <div role="alert">
          <p>{t('commitmentChangeWarning')}</p>
          <ul>{data.commitmentImpacts.map((impact) => <li key={`${impact.dateId}:${impact.planId}`}>
            {impact.dateId} · {planNames[impact.planId] || impact.planId}: {impact.bookingTitles.join(', ') || t('lockedPlanDisplaced')}
            {impact.bookingDateUncertain && <p>{t('bookingDateUncertain')}</p>}
            {impact.accepted && <p>{t('commitmentChangeAccepted', { reason: impact.reason })}</p>}
          </li>)}</ul>
        </div>}
        {data.weatherOverride && <p>{t('planningToolsWeather')}</p>}
        <ul>{data.newRisks.map((risk, index) => <li key={index}>{planNames[risk.planId] || risk.planId}: {translateRiskTitle(risk.title, language)} · {risk.reasons.map((reason) => translateIssue(reason, language)).join(', ')}</li>)}</ul>
        <ul>{data.lodgingImpacts.map((impact) => <li key={impact.dateId}>
          {t('lodgingNight', { date: impact.dateId })}: {impact.before.name || t(impact.before.status === 'none' ? 'lodgingNotNeeded' : 'lodgingUnspecified')} → {impact.after.name || t(impact.after.status === 'none' ? 'lodgingNotNeeded' : 'lodgingUnspecified')}
          {impact.tasks.map((task, index) => <p key={index}>{t(`lodgingTask_${task.type}`, { name: task.hotelName, date: impact.dateId })}{task.cancelBy ? ` · ${t('lodgingCancelDeadline', { time: task.cancelBy })}` : ''}</p>)}
        </li>)}</ul>
        <button className="btn btn-primary" type="button" disabled={busy || !data.canApply} onClick={() => void confirm()}>{t('planningToolsConfirm')}</button>
      </div>}
    </details>
  );
}

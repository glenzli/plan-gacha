import { useEffect, useState, type RefObject, type ReactNode } from 'react';
import { Icon } from './Icon';
import { LodgingEditor } from './LodgingEditor';
import { PlanEditorDetail } from './PlanEditor';
import { TripItineraryEditorPanel } from './TripItineraryEditorPanel';
import { TripSettingsPanel } from './TripSettingsPanel';
import type { DisplayTripDate } from '../domain/display';
import type { PlanEditDraft } from '../domain/planEditing';
import type { NormalizedPlan } from '../domain/plan';
import type { NormalizedLodging, NormalizedSchedule } from '../domain/trip';
import { getMapRegion } from '../domain/locationLinks';
import type { MapPreferences, MapRegion } from '../domain/mapPreferences';
import type { AiModeText, EditorTab, PlanRenderer, TranslateFn } from '../types/ui';
import type { WeatherDataMap } from '../types/weatherData';

interface TripEditorModalProps {
  editorInitialMode: 'content' | 'constraints';
  editorInitialStopId?: string;
  editorBackLabel: string;
  activeTripId: string;
  aiGenerateText: AiModeText;
  aiPlannerQuestionRef: RefObject<HTMLTextAreaElement | null>;
  aiPlannerResultRef: RefObject<HTMLTextAreaElement | null>;
  applyAiPlannerResult: () => void;
  applyPlanEditDraft: (draftJson: string) => void;
  archiveCurrentTrip: () => void;
  batchAiOpen: boolean;
  closePlanEditor: () => void;
  copyBatchAiPrompt: () => void;
  copyPlanAiPrompt: (question: string, draft: NormalizedPlan, assignedDay: string, hotels?: NormalizedLodging[]) => void;
  deleteCurrentTrip: () => void;
  editorPlan: NormalizedPlan | null | undefined;
  editorPlanId: string | null;
  editorTab: EditorTab;
  endDateStr: string;
  getPlanEditorDraftJson: (planId?: string) => string;
  getPriorityLabel: (priority: string, language: string) => string;
  handleExportState: () => void;
  isCreatingPlan: boolean;
  language: string;
  loadExampleTrip: () => void;
  lodgingSectionRef: RefObject<HTMLDivElement | null>;
  lodgings: NormalizedLodging[];
  mapPreferences: MapPreferences;
  normalizedPlans: NormalizedPlan[];
  onChangeEndDate: (date: string) => void;
  onChangeStartDate: (date: string) => void;
  onClose: () => void;
  onCommitTripName: (name: string) => void;
  onOpenImport: () => void;
  onOpenPlanEditor: (planId?: string) => void;
  onRemovePlan: (planId: string) => void;
  onSaveLodgings: (lodgings: NormalizedLodging[]) => void;
  parsePlanDraft: (json: string, hotels?: NormalizedLodging[]) => PlanEditDraft;
  onSelectTab: (tab: EditorTab) => void;
  onToggleBatchAi: () => void;
  planAssignments: Map<string, string>;
  renderArchivedTripRows: () => ReactNode;
  renderPlanBookings: PlanRenderer;
  renderPlanNotes: PlanRenderer;
  renderPlanStops: PlanRenderer;
  schedule: NormalizedSchedule;
  startDateStr: string;
  t: TranslateFn;
  tripDays: number;
  tripDates: DisplayTripDate[];
  tripName: string;
  weatherData: WeatherDataMap;
}

export function TripEditorModal({
  editorInitialMode,
  editorInitialStopId,
  editorBackLabel,
  activeTripId,
  aiGenerateText,
  aiPlannerQuestionRef,
  aiPlannerResultRef,
  applyAiPlannerResult,
  applyPlanEditDraft,
  archiveCurrentTrip,
  batchAiOpen,
  closePlanEditor,
  copyBatchAiPrompt,
  copyPlanAiPrompt,
  deleteCurrentTrip,
  editorPlan,
  editorPlanId,
  editorTab,
  endDateStr,
  getPlanEditorDraftJson,
  getPriorityLabel,
  handleExportState,
  isCreatingPlan,
  language,
  loadExampleTrip,
  lodgingSectionRef,
  lodgings,
  mapPreferences,
  normalizedPlans,
  onChangeEndDate,
  onChangeStartDate,
  onClose,
  onCommitTripName,
  onOpenImport,
  onOpenPlanEditor,
  onRemovePlan,
  onSaveLodgings,
  parsePlanDraft,
  onSelectTab,
  onToggleBatchAi,
  planAssignments,
  renderArchivedTripRows,
  renderPlanBookings,
  renderPlanNotes,
  renderPlanStops,
  schedule,
  startDateStr,
  t,
  tripDays,
  tripDates,
  tripName,
  weatherData,
}: TripEditorModalProps) {
  const [planDirty, setPlanDirty] = useState(false);
  const [lodgingDirty, setLodgingDirty] = useState(false);
  type ExitTarget = 'back' | 'close' | 'ai' | EditorTab;
  const [pendingExit, setPendingExit] = useState<ExitTarget | null>(null);
  const hasUnsavedChanges = Boolean(planDirty && editorPlanId || lodgingDirty);
  const performExit = (target: ExitTarget) => {
    if (target === 'back') closePlanEditor();
    else if (target === 'close') onClose();
    else if (target === 'ai') { onSelectTab('itinerary'); if (!batchAiOpen) onToggleBatchAi(); }
    else onSelectTab(target);
  };
  const requestExit = (target: ExitTarget) => {
    if (hasUnsavedChanges) setPendingExit(target);
    else performExit(target);
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (pendingExit) setPendingExit(null);
      else if (hasUnsavedChanges) setPendingExit('close');
      else onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingExit, hasUnsavedChanges, onClose]);
  const tripMapRegions = new Set(normalizedPlans.map((plan) => getMapRegion(plan.location)).filter((region) => region !== 'unknown'));
  const lodgingMapRegion: MapRegion = tripMapRegions.size === 1 ? [...tripMapRegions][0] ?? 'unknown' : 'unknown';
  const tripCities = new Set(normalizedPlans.map((plan) => plan.location.admin2 || plan.location.weatherLabel).filter(Boolean));
  const lodgingSearchRegion = tripCities.size === 1 ? [...tripCities][0] ?? '' : '';

  return (
    <div className="modal-overlay" onClick={() => requestExit('close')}>
      <div
        className={`modal trip-editor-modal ${editorPlanId ? 'is-plan-detail' : 'is-trip-detail'}`}
        role="dialog"
        aria-modal="true"
        aria-label={editorPlanId ? t('editSinglePlan') : t('manageTrip')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-header">
          <div>
            <p className="eyebrow">{t('planSetup')}</p>
            <h2>{editorPlanId ? (isCreatingPlan ? t('addPlan') : t('editSinglePlan')) : t('manageTrip')}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={() => requestExit('close')} aria-label={t('closeEditor')} title={t('closeEditor')}>
            <Icon name="x" />
          </button>
        </div>

        {!editorPlanId && (
          <TripSettingsPanel
            activeTripId={activeTripId}
            editorTab={editorTab}
            endDateStr={endDateStr}
            onChangeEndDate={onChangeEndDate}
            onChangeStartDate={onChangeStartDate}
            onCommitTripName={onCommitTripName}
            onSelectTab={(tab) => { if (tab !== editorTab) requestExit(tab); }}
            startDateStr={startDateStr}
            t={t}
            tripDays={tripDays}
            tripName={tripName}
          />
        )}

        <div className="trip-editor-body">
          {editorPlanId ? (
            <PlanEditorDetail
              key={editorPlanId}
              initialMode={editorInitialMode}
              initialStopId={editorInitialStopId}
              backLabel={editorBackLabel}
              isCreatingPlan={isCreatingPlan}
              editorPlan={editorPlan}
              initialDraftJson={getPlanEditorDraftJson(editorPlanId)}
              language={language}
              t={t}
              onBack={() => requestExit('back')}
              onCopyPrompt={copyPlanAiPrompt}
              onApplyDraft={applyPlanEditDraft}
              parseDraft={parsePlanDraft}
              onDirtyChange={setPlanDirty}
              plans={normalizedPlans}
              lodgings={lodgings}
              schedule={schedule}
              tripDates={tripDates}
              weatherData={weatherData}
              renderPlanStops={renderPlanStops}
              renderPlanBookings={renderPlanBookings}
              renderPlanNotes={renderPlanNotes}
            />
          ) : editorTab === 'lodging' ? (
            <div className="editor-section" ref={lodgingSectionRef}>
              <LodgingEditor
                lodgings={lodgings}
                mapPreferences={mapPreferences}
                mapRegionHint={lodgingMapRegion}
                mapSearchRegion={lodgingSearchRegion}
                startDateStr={startDateStr}
                endDateStr={endDateStr}
                t={t}
                onSave={onSaveLodgings}
                plans={normalizedPlans}
                schedule={schedule}
                dates={tripDates.map((date) => date.id)}
                onAi={() => requestExit('ai')}
                onDirtyChange={setLodgingDirty}
              />
            </div>
          ) : (
            <TripItineraryEditorPanel
              aiGenerateText={aiGenerateText}
              aiPlannerQuestionRef={aiPlannerQuestionRef}
              aiPlannerResultRef={aiPlannerResultRef}
              applyAiPlannerResult={applyAiPlannerResult}
              batchAiOpen={batchAiOpen}
              copyBatchAiPrompt={copyBatchAiPrompt}
              getPriorityLabel={getPriorityLabel}
              handleExportState={handleExportState}
              language={language}
              loadExampleTrip={loadExampleTrip}
              normalizedPlans={normalizedPlans}
              onOpenImport={onOpenImport}
              onOpenPlanEditor={onOpenPlanEditor}
              onRemovePlan={onRemovePlan}
              onToggleBatchAi={onToggleBatchAi}
              planAssignments={planAssignments}
              renderArchivedTripRows={renderArchivedTripRows}
              t={t}
              tripDates={tripDates}
            />
          )}
        </div>

        {!editorPlanId && (
          <div className="trip-editor-footer">
            <div className="trip-lifecycle-actions">
              <button className="btn btn-outline" type="button" onClick={archiveCurrentTrip}>
                {t('archive')}
              </button>
              <button className="btn btn-danger" type="button" onClick={deleteCurrentTrip}>
                {t('delete')}
              </button>
            </div>
          </div>
        )}
      </div>
      {pendingExit && (
        <div className="modal-overlay editor-leave-overlay" onClick={(event) => event.stopPropagation()}>
          <div className="modal editor-leave-dialog" role="alertdialog" aria-modal="true" aria-labelledby="leave-plan-title" aria-describedby="leave-plan-help">
            <h3 id="leave-plan-title">{t('leavePlanTitle')}</h3>
            <p id="leave-plan-help">{t('leavePlanHelp')}</p>
            <div className="modal-actions">
              <button className="btn btn-outline" type="button" onClick={() => { const target = pendingExit; setPendingExit(null); setPlanDirty(false); setLodgingDirty(false); performExit(target); }}>{t('discardPlanEdits')}</button>
              <button className="btn btn-primary" type="button" autoFocus onClick={() => setPendingExit(null)}>{t('keepEditingPlan')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

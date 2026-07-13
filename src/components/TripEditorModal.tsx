import type { RefObject, ReactNode } from 'react';
import { Icon } from './Icon';
import { LodgingEditor } from './LodgingEditor';
import { PlanEditorDetail } from './PlanEditor';
import { TripItineraryEditorPanel } from './TripItineraryEditorPanel';
import { TripSettingsPanel } from './TripSettingsPanel';
import type { DisplayTripDate } from '../domain/display';
import type { NormalizedPlan } from '../domain/plan';
import type { NormalizedLodging } from '../domain/trip';
import type { AiModeText, EditorTab, PlanRenderer, TranslateFn } from '../types/ui';

interface TripEditorModalProps {
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
  copyPlanAiPrompt: (question: string) => void;
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
  normalizedPlans: NormalizedPlan[];
  onChangeEndDate: (date: string) => void;
  onChangeStartDate: (date: string) => void;
  onClose: () => void;
  onCommitTripName: (name: string) => void;
  onOpenImport: () => void;
  onOpenPlanEditor: (planId?: string) => void;
  onRemovePlan: (planId: string) => void;
  onSaveLodgings: (lodgings: NormalizedLodging[]) => void;
  onSelectTab: (tab: EditorTab) => void;
  onToggleBatchAi: () => void;
  planAssignments: Map<string, string>;
  renderArchivedTripRows: () => ReactNode;
  renderPlanBookings: PlanRenderer;
  renderPlanNotes: PlanRenderer;
  renderPlanStops: PlanRenderer;
  startDateStr: string;
  t: TranslateFn;
  tripDays: number;
  tripDates: DisplayTripDate[];
  tripName: string;
}

export function TripEditorModal({
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
  normalizedPlans,
  onChangeEndDate,
  onChangeStartDate,
  onClose,
  onCommitTripName,
  onOpenImport,
  onOpenPlanEditor,
  onRemovePlan,
  onSaveLodgings,
  onSelectTab,
  onToggleBatchAi,
  planAssignments,
  renderArchivedTripRows,
  renderPlanBookings,
  renderPlanNotes,
  renderPlanStops,
  startDateStr,
  t,
  tripDays,
  tripDates,
  tripName,
}: TripEditorModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal trip-editor-modal ${editorPlanId ? 'is-plan-detail' : 'is-trip-detail'}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-header">
          <div>
            <p className="eyebrow">{t('planSetup')}</p>
            <h2>{editorPlanId ? (isCreatingPlan ? t('addPlan') : t('editSinglePlan')) : t('editPlan')}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={t('closeEditor')}>
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
            onSelectTab={onSelectTab}
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
              isCreatingPlan={isCreatingPlan}
              editorPlan={editorPlan}
              initialDraftJson={getPlanEditorDraftJson(editorPlanId)}
              t={t}
              onBack={closePlanEditor}
              onCopyPrompt={copyPlanAiPrompt}
              onApplyDraft={applyPlanEditDraft}
              renderPlanStops={renderPlanStops}
              renderPlanBookings={renderPlanBookings}
              renderPlanNotes={renderPlanNotes}
            />
          ) : editorTab === 'lodging' ? (
            <div className="editor-section" ref={lodgingSectionRef}>
              <LodgingEditor
                lodgings={lodgings}
                startDateStr={startDateStr}
                endDateStr={endDateStr}
                t={t}
                onSave={onSaveLodgings}
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
    </div>
  );
}

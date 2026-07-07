// @ts-nocheck
import { Icon } from './Icon';
import { LodgingEditor } from './LodgingEditor';
import { PlanEditorDetail } from './PlanEditor';
import { TripItineraryEditorPanel } from './TripItineraryEditorPanel';
import { TripSettingsPanel } from './TripSettingsPanel';

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
}) {
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

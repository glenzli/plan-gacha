import { BatchAiPlanPanel } from './BatchAiPlanPanel';
import { PlanReviewPanel } from './PlanReviewPanel';
import type { TripDateLike } from '../domain/risk';
import type { NormalizedPlan } from '../domain/plan';
import type { AiModeText, RenderNode, TextAreaRef, TranslateFn, VoidFn } from '../types/ui';

interface TripItineraryEditorPanelProps {
  aiGenerateText: AiModeText;
  aiPlannerQuestionRef: TextAreaRef;
  aiPlannerResultRef: TextAreaRef;
  applyAiPlannerResult: VoidFn;
  batchAiOpen: boolean;
  copyBatchAiPrompt: VoidFn;
  getPriorityLabel: (priority: string, language: string) => string;
  handleExportState: VoidFn;
  language: string;
  loadExampleTrip: VoidFn;
  normalizedPlans: NormalizedPlan[];
  onOpenImport: VoidFn;
  onOpenPlanEditor: (planId?: string) => void;
  onRemovePlan: (planId: string) => void;
  onToggleBatchAi: VoidFn;
  planAssignments: Map<string, string>;
  renderArchivedTripRows: RenderNode;
  t: TranslateFn;
  tripDates: TripDateLike[];
}

export function TripItineraryEditorPanel({
  aiGenerateText,
  aiPlannerQuestionRef,
  aiPlannerResultRef,
  applyAiPlannerResult,
  batchAiOpen,
  copyBatchAiPrompt,
  getPriorityLabel,
  handleExportState,
  language,
  loadExampleTrip,
  normalizedPlans,
  onOpenImport,
  onOpenPlanEditor,
  onRemovePlan,
  onToggleBatchAi,
  planAssignments,
  renderArchivedTripRows,
  t,
  tripDates,
}: TripItineraryEditorPanelProps) {
  return (
    <>
      <BatchAiPlanPanel
        aiGenerateText={aiGenerateText}
        aiPlannerQuestionRef={aiPlannerQuestionRef}
        aiPlannerResultRef={aiPlannerResultRef}
        applyAiPlannerResult={applyAiPlannerResult}
        batchAiOpen={batchAiOpen}
        copyBatchAiPrompt={copyBatchAiPrompt}
        handleExportState={handleExportState}
        loadExampleTrip={loadExampleTrip}
        normalizedPlans={normalizedPlans}
        onOpenImport={onOpenImport}
        onToggleBatchAi={onToggleBatchAi}
        t={t}
      />

      <PlanReviewPanel
        getPriorityLabel={getPriorityLabel}
        language={language}
        normalizedPlans={normalizedPlans}
        onOpenPlanEditor={onOpenPlanEditor}
        onRemovePlan={onRemovePlan}
        planAssignments={planAssignments}
        t={t}
        tripDates={tripDates}
      />

      <div className="editor-section archive-section">
        {renderArchivedTripRows()}
      </div>
    </>
  );
}

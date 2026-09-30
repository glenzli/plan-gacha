import { useState, type ChangeEvent, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { APP_SCHEMA_VERSION } from '../domain/sync';
import {
  BOOKING_STATUS_VALUES,
  BOOKING_TYPE_VALUES,
  normalizePlan,
  toArray,
  type NormalizedPlan,
} from '../domain/plan';
import {
  clampTripDays,
  type NormalizedLodging,
  type NormalizedPlaceFeedback,
  type NormalizedSchedule,
  type NormalizedStopOutcomes,
} from '../domain/trip';
import type { NormalizedDayReviews } from '../domain/dayReview';
import type { TripArchiveSummary } from '../domain/tripArchive';
import { buildTripExportPayload, readImportedTripHistory } from '../domain/tripExport';
import { WEATHER_LABELS } from '../domain/weather';
import {
  getSinglePlanPayload,
  parseImportJson,
  readImportFileText,
} from '../domain/appStorage';
import {
  downloadBlob,
  sanitizeFileNamePart,
} from '../domain/browserExport';
import type { ChecklistMergeConflict, ChecklistState } from '../domain/checklist';
import type { DisplayTripDate } from '../domain/display';
import type { TranslateFn } from '../types/ui';
import { getEditedPlanSchedule, updateRelatedPlan } from '../domain/planEditing';
import { mergeLodgings } from '../domain/lodging';
import { prepareTripImport, validateLodgingReferences, type TripImportPreview } from '../domain/tripImport';
import { addDays } from '../domain/date';

type AnyRecord = Record<string, any>;

const WEATHER_RULE_VALUES = new Set(Object.keys(WEATHER_LABELS.zh).filter((key) => key !== 'unknown'));
const PRIORITY_VALUES = new Set(['must', 'preferred', 'backup', 'optional']);

interface UseJsonPayloadControllerOptions {
  aiPlannerResultRef: RefObject<HTMLTextAreaElement | null>;
  checklistState: ChecklistState;
  checklistText: string;
  closePlanEditor: () => void;
  editorPlanId: string | null;
  importTextRef: RefObject<HTMLTextAreaElement | null>;
  invalidateWeatherCache: () => void;
  isCreatingPlan: boolean;
  dayReviews: NormalizedDayReviews;
  archiveSummary: TripArchiveSummary | null;
  lodgings: NormalizedLodging[];
  normalizedPlans: NormalizedPlan[];
  notify: (message: string) => void;
  placeFeedback: NormalizedPlaceFeedback;
  resetAiPlannerFields: () => void;
  schedule: NormalizedSchedule;
  setAiPlannerOpen: Dispatch<SetStateAction<boolean>>;
  setBatchAiOpen: Dispatch<SetStateAction<boolean>>;
  setChecklistImportConflicts: Dispatch<SetStateAction<ChecklistMergeConflict[]>>;
  setChecklistImportText: Dispatch<SetStateAction<string>>;
  setDayReviews: Dispatch<SetStateAction<NormalizedDayReviews>>;
  setArchiveSummary: Dispatch<SetStateAction<TripArchiveSummary | null>>;
  setImportModalOpen: Dispatch<SetStateAction<boolean>>;
  setLodgings: Dispatch<SetStateAction<NormalizedLodging[]>>;
  setPlaceFeedback: Dispatch<SetStateAction<NormalizedPlaceFeedback>>;
  setPlans: Dispatch<SetStateAction<unknown[]>>;
  setSchedule: Dispatch<SetStateAction<NormalizedSchedule>>;
  setStartDateStr: Dispatch<SetStateAction<string>>;
  setStopOutcomes: Dispatch<SetStateAction<NormalizedStopOutcomes>>;
  setTripDays: Dispatch<SetStateAction<number>>;
  startDateStr: string;
  t: TranslateFn;
  tripDates: DisplayTripDate[];
  tripDays: number;
  tripName: string;
  stopOutcomes: NormalizedStopOutcomes;
  ensureActiveTrip: () => void;
  planningFrom: string;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function downloadJson(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, fileName);
}

export function useJsonPayloadController({
  aiPlannerResultRef,
  checklistState,
  checklistText,
  closePlanEditor,
  editorPlanId,
  importTextRef,
  invalidateWeatherCache,
  isCreatingPlan,
  dayReviews,
  archiveSummary,
  lodgings,
  normalizedPlans,
  notify,
  placeFeedback,
  resetAiPlannerFields,
  schedule,
  setAiPlannerOpen,
  setBatchAiOpen,
  setChecklistImportConflicts,
  setChecklistImportText,
  setDayReviews,
  setArchiveSummary,
  setImportModalOpen,
  setLodgings,
  setPlaceFeedback,
  setPlans,
  setSchedule,
  setStartDateStr,
  setStopOutcomes,
  setTripDays,
  startDateStr,
  t,
  tripDates,
  tripDays,
  tripName,
  stopOutcomes,
  ensureActiveTrip,
  planningFrom,
}: UseJsonPayloadControllerOptions) {
  const [pendingImport, setPendingImport] = useState<{ parsed: AnyRecord; preview: TripImportPreview; message: string; fromAi: boolean; signature: string } | null>(null);
  const currentSignature = JSON.stringify([normalizedPlans, lodgings, schedule, startDateStr, tripDays]);
  const prepareImport = (parsed: AnyRecord, fromAi: boolean) => {
    const start = parsed.startDateStr || startDateStr;
    const count = parsed.tripDays ? clampTripDays(parsed.tripDays) : tripDays;
    const dates = Array.from({ length: count }, (_, index) => ({ id: addDays(start, index) }));
    return prepareTripImport(parsed, normalizedPlans, lodgings, schedule, dates, fromAi, planningFrom);
  };
  const assertPlanDraftOption = (value: unknown, allowedValues: Set<string>, path: string) => {
    const normalizedValue = String(value || '').trim();
    if (normalizedValue && !allowedValues.has(normalizedValue)) {
      throw new Error(t('invalidPlanField', { path, value: normalizedValue }));
    }
  };

  const validatePlanDraftOptions = (payload: AnyRecord) => {
    if (!payload || typeof payload !== 'object') return;

    if (payload.priority) {
      assertPlanDraftOption(payload.priority, PRIORITY_VALUES, 'priority');
    }

    if (payload.weather_rules && typeof payload.weather_rules === 'object') {
      ['best', 'ok', 'blocked'].forEach((ruleKey) => {
        toArray(payload.weather_rules[ruleKey]).forEach((value) => {
          assertPlanDraftOption(value, WEATHER_RULE_VALUES, `weather_rules.${ruleKey}`);
        });
      });
    }

    [
      ...toArray(payload.bookings),
      ...toArray(payload.reservations),
      ...toArray(payload.appointments),
      ...toArray(payload.tickets),
    ].forEach((booking, index) => {
      if (!booking || typeof booking !== 'object') return;
      if (booking.type || booking.kind) {
        assertPlanDraftOption(booking.type || booking.kind, BOOKING_TYPE_VALUES, `bookings[${index}].type`);
      }
      if (booking.status) {
        assertPlanDraftOption(booking.status, BOOKING_STATUS_VALUES, `bookings[${index}].status`);
      }
    });
  };

  const applyImportedPayload = (parsed: AnyRecord, message = t('jsonApplied'), fromAi = false) => {
    const prepared = prepareImport(parsed, fromAi);
    let touched = false;
    let activeTripEnsured = false;
    const ensureTrip = () => {
      if (activeTripEnsured) return;
      ensureActiveTrip();
      activeTripEnsured = true;
    };

    if (parsed.startDateStr) {
      ensureTrip();
      touched = true;
      setStartDateStr(parsed.startDateStr);
    }
    if (parsed.tripDays) {
      ensureTrip();
      touched = true;
      setTripDays(clampTripDays(parsed.tripDays));
    }
    if (parsed.plans || parsed.plan || parsed.schedule || parsed.lodgings || parsed.hotels || parsed.accommodations || parsed.stays) {
      ensureTrip();
      touched = true;
      setPlans(prepared.plans);
      setLodgings(prepared.lodgings);
      setSchedule(prepared.schedule);
    }

    const importedHistory = fromAi ? {} : readImportedTripHistory(parsed);
    if (importedHistory.placeFeedback !== undefined) {
      ensureTrip();
      touched = true;
      setPlaceFeedback(importedHistory.placeFeedback);
    }
    if (importedHistory.stopOutcomes !== undefined) {
      ensureTrip();
      touched = true;
      setStopOutcomes(importedHistory.stopOutcomes);
    }
    if (importedHistory.dayReviews !== undefined) {
      ensureTrip();
      touched = true;
      setDayReviews(importedHistory.dayReviews);
    }
    if (importedHistory.archiveSummary !== undefined) {
      ensureTrip();
      touched = true;
      setArchiveSummary(importedHistory.archiveSummary);
    }

    if (!touched && !parsed.startDateStr && !parsed.tripDays) {
      throw new Error(t('noApplicableJson'));
    }

    invalidateWeatherCache();
    notify(message);
  };

  const applyAiPlannerResult = () => {
    try {
      const parsed = parseImportJson(aiPlannerResultRef.current?.value || '');
      setPendingImport({ parsed, preview: prepareImport(parsed, true), message: t('aiPlanApplied'), fromAi: true, signature: currentSignature });
    } catch (error) {
      notify(t('applyFailed', { message: t(getErrorMessage(error)) }));
    }
  };

  const parseSinglePlanDraft = (text: string, draftHotels?: NormalizedLodging[]) => {
    const parsed = parseImportJson(text);
    const payload = getSinglePlanPayload(parsed);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error(t('noApplicableJson'));
    }
    validatePlanDraftOptions(payload);
    if (typeof payload.name !== 'string' || !payload.name.trim()) throw new Error(t('planNameRequired'));

    const payloadWithFallbackId = isCreatingPlan
      ? payload
      : { ...payload, id: payload.id || editorPlanId };
    const normalizedPlan = normalizePlan(payloadWithFallbackId, 0, tripDates);
    const duplicatePlan = normalizedPlans.find((plan) => (
      plan.id === normalizedPlan.id && (isCreatingPlan || plan.id !== editorPlanId)
    ));
    if (duplicatePlan) throw new Error(t('duplicatePlanId', { id: normalizedPlan.id }));
    if (!normalizedPlan.stops.length) throw new Error(t('planStopsRequired'));
    const assignedDay = payload.assigned_day || payload.assignedDay || '';
    if (assignedDay && !tripDates.some((date) => date.id === assignedDay)) throw new Error(t('planAssignedDateInvalid'));

    const hotels = mergeLodgings(draftHotels || lodgings, parsed.lodgings || [], true);
    validateLodgingReferences([normalizedPlan], hotels);
    return {
      plan: normalizedPlan,
      assignedDay,
      ...(parsed.lodgings || draftHotels ? { lodgings: hotels } : {}),
      warnings: toArray(parsed.warnings).map(String),
    };
  };

  const applySinglePlanDraft = ({ plan, assignedDay, lodgings: draftHotels }: { plan: NormalizedPlan; assignedDay: string; lodgings?: NormalizedLodging[] }, message: string) => {
    const previousPlanId = isCreatingPlan ? '' : editorPlanId;
    if (draftHotels) setLodgings(draftHotels);

    setPlans((current) => {
      if (isCreatingPlan) return [...current, plan];

      return current.map((item, index) => {
        const normalizedPlan = normalizePlan(item, index, tripDates);
        if (normalizedPlan.id === previousPlanId) return plan;
        const relatedPlan = updateRelatedPlan(normalizedPlan, previousPlanId || null, plan);
        return relatedPlan === normalizedPlan ? item : relatedPlan;
      });
    });

    if (assignedDay || (previousPlanId && previousPlanId !== plan.id)) {
      setSchedule((current) => getEditedPlanSchedule(current, previousPlanId || null, plan.id, assignedDay));
    }

    notify(message);
    // Weather sync fetches new location keys automatically. A time or constraint
    // edit should retain the forecasts the traveller is currently relying on.
    closePlanEditor();
  };

  const applyPlanEditDraft = (draftJson: string) => {
    try {
      applySinglePlanDraft(
        parseSinglePlanDraft(draftJson),
        isCreatingPlan ? t('planCreated') : t('planUpdated'),
      );
    } catch (error) {
      notify(t('applyFailed', { message: t(getErrorMessage(error)) }));
    }
  };

  const handleImport = () => {
    try {
      const parsed = parseImportJson(importTextRef.current?.value || '');
      setPendingImport({ parsed, preview: prepareImport(parsed, false), message: t('importDone'), fromAi: false, signature: currentSignature });
    } catch (error) {
      notify(t('importFailed', { message: t(getErrorMessage(error)) }));
    }
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    try {
      if (pendingImport.signature !== currentSignature) {
        setPendingImport({ ...pendingImport, preview: prepareImport(pendingImport.parsed, pendingImport.fromAi), signature: currentSignature });
        notify(t('importPreviewRefreshed'));
        return;
      }
      applyImportedPayload(pendingImport.parsed, pendingImport.message, pendingImport.fromAi);
      if (pendingImport.fromAi) {
        resetAiPlannerFields(); setAiPlannerOpen(false); setBatchAiOpen(false);
      } else {
        setImportModalOpen(false);
        if (importTextRef.current) importTextRef.current.value = '';
      }
      setPendingImport(null);
    } catch (error) { notify(t('applyFailed', { message: t(getErrorMessage(error)) })); }
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>, onLoaded: (text: string) => void) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await readImportFileText(file);
      onLoaded(text);
      notify(t('importFileLoaded', { name: file.name }));
    } catch {
      notify(t('importFileReadFailed'));
    } finally {
      event.target.value = '';
    }
  };

  const handleTripImportFile = (event: ChangeEvent<HTMLInputElement>) => handleImportFile(event, (text: string) => {
    if (importTextRef.current) importTextRef.current.value = text;
  });

  const handleChecklistImportFile = (event: ChangeEvent<HTMLInputElement>) => handleImportFile(event, (text: string) => {
    setChecklistImportText(text);
    setChecklistImportConflicts([]);
  });

  const handleExportState = () => {
    try {
      const data = buildTripExportPayload({
        schemaVersion: APP_SCHEMA_VERSION,
        startDateStr,
        tripDays,
        lodgings,
        plans: normalizedPlans,
        schedule,
        placeFeedback,
        stopOutcomes,
        dayReviews,
        archiveSummary,
      });
      const fileName = `${sanitizeFileNamePart(tripName || t('unnamedTrip'))}-${startDateStr || 'trip'}.json`;
      downloadJson(data, fileName);
      notify(t('jsonDownloaded'));
    } catch {
      notify(t('downloadFailed'));
    }
  };

  const handleExportChecklist = () => {
    try {
      const data = {
        schemaVersion: APP_SCHEMA_VERSION,
        checklistText,
        checklistState,
      };
      const fileName = `${sanitizeFileNamePart(tripName || t('unnamedTrip'))}-checklist-${startDateStr || 'trip'}.json`;
      downloadJson(data, fileName);
      notify(t('checklistExported'));
    } catch {
      notify(t('downloadFailed'));
    }
  };

  return {
    pendingImport,
    cancelImportPreview: () => setPendingImport(null),
    confirmImport,
    parseSinglePlanDraft,
    applyAiPlannerResult,
    applyImportedPayload,
    applyPlanEditDraft,
    handleChecklistImportFile,
    handleExportChecklist,
    handleExportState,
    handleImport,
    handleTripImportFile,
  };
}

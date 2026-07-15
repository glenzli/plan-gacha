import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from 'react';
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
  normalizeSchedule,
  normalizeTripLodgings,
  type NormalizedLodging,
  type NormalizedPlaceFeedback,
  type NormalizedSchedule,
  type NormalizedStopOutcomes,
} from '../domain/trip';
import type { NormalizedDayReviews } from '../domain/dayReview';
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
}: UseJsonPayloadControllerOptions) {
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

  const applyImportedPayload = (parsed: AnyRecord, message = t('jsonApplied')) => {
    let touched = false;

    if (parsed.startDateStr) {
      touched = true;
      setStartDateStr(parsed.startDateStr);
    }
    if (parsed.tripDays) {
      touched = true;
      setTripDays(clampTripDays(parsed.tripDays));
    }
    const importedLodgings = parsed.lodgings || parsed.hotels || parsed.accommodations || parsed.stays;
    if (Array.isArray(importedLodgings)) {
      touched = true;
      setLodgings(normalizeTripLodgings(importedLodgings));
    }

    if (Array.isArray(parsed.plans)) {
      touched = true;
      setPlans((current) => {
        const next = [...current];
        parsed.plans.forEach((incomingPlan: unknown, index: number) => {
          const normalized = normalizePlan(incomingPlan, index, tripDates);
          const existingIndex = next.findIndex((plan, currentIndex) => (
            normalizePlan(plan, currentIndex, tripDates).id === normalized.id
          ));
          if (existingIndex >= 0) {
            next[existingIndex] = normalized;
          } else {
            next.push(normalized);
          }
        });
        return next;
      });

      const assigned = parsed.plans.reduce((accumulator: NormalizedSchedule, plan: AnyRecord) => {
        if (plan.assigned_day && plan.id) {
          accumulator[plan.assigned_day] = { planId: plan.id };
        }
        return accumulator;
      }, {} as NormalizedSchedule);

      if (Object.keys(assigned).length) {
        touched = true;
        setSchedule((current) => ({ ...current, ...assigned }));
      }
    }

    if (Array.isArray(parsed.schedule)) {
      const importedSchedule = parsed.schedule.reduce((accumulator: NormalizedSchedule, item: AnyRecord) => {
        const dateId = item.date || item.dateId || item.day;
        const planId = item.plan_id || item.planId || item.id;
        if (dateId && planId) accumulator[dateId] = { planId };
        return accumulator;
      }, {} as NormalizedSchedule);

      if (Object.keys(importedSchedule).length) {
        touched = true;
        setSchedule((current) => ({ ...current, ...importedSchedule }));
      }
    } else if (parsed.schedule && typeof parsed.schedule === 'object') {
      touched = true;
      setSchedule((current) => ({ ...current, ...normalizeSchedule(parsed.schedule) }));
    }

    const importedHistory = readImportedTripHistory(parsed);
    if (importedHistory.placeFeedback !== undefined) {
      touched = true;
      setPlaceFeedback(importedHistory.placeFeedback);
    }
    if (importedHistory.stopOutcomes !== undefined) {
      touched = true;
      setStopOutcomes(importedHistory.stopOutcomes);
    }
    if (importedHistory.dayReviews !== undefined) {
      touched = true;
      setDayReviews(importedHistory.dayReviews);
    }

    if (!touched && !parsed.startDateStr && !parsed.tripDays) {
      throw new Error(t('noApplicableJson'));
    }

    invalidateWeatherCache();
    notify(message);
  };

  const applyAiPlannerResult = () => {
    try {
      applyImportedPayload(parseImportJson(aiPlannerResultRef.current?.value || ''), t('aiPlanApplied'));
      resetAiPlannerFields();
      setAiPlannerOpen(false);
      setBatchAiOpen(false);
    } catch (error) {
      notify(t('applyFailed', { message: getErrorMessage(error) }));
    }
  };

  const parseSinglePlanDraft = (text: string) => {
    const parsed = parseImportJson(text);
    const payload = getSinglePlanPayload(parsed);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error(t('noApplicableJson'));
    }
    validatePlanDraftOptions(payload);

    const payloadWithFallbackId = isCreatingPlan
      ? payload
      : { ...payload, id: payload.id || editorPlanId };
    const normalizedPlan = normalizePlan(payloadWithFallbackId, 0, tripDates);
    const duplicatePlan = normalizedPlans.find((plan) => (
      plan.id === normalizedPlan.id && (isCreatingPlan || plan.id !== editorPlanId)
    ));
    if (duplicatePlan) throw new Error(t('duplicatePlanId', { id: normalizedPlan.id }));

    return {
      plan: normalizedPlan,
      assignedDay: payload.assigned_day || payload.assignedDay || '',
    };
  };

  const applySinglePlanDraft = ({ plan, assignedDay }: { plan: NormalizedPlan; assignedDay: string }, message: string) => {
    const previousPlanId = isCreatingPlan ? '' : editorPlanId;

    setPlans((current) => {
      if (isCreatingPlan) return [...current, plan];

      return current.map((item, index) => {
        const normalizedPlan = normalizePlan(item, index, tripDates);
        return normalizedPlan.id === previousPlanId ? plan : item;
      });
    });

    if (assignedDay || (previousPlanId && previousPlanId !== plan.id)) {
      setSchedule((current) => {
        const next = Object.fromEntries(
          Object.entries(current).map(([dateId, entry]) => [
            dateId,
            entry?.planId === previousPlanId ? { ...entry, planId: plan.id } : entry,
          ]),
        );

        if (assignedDay) next[assignedDay] = { planId: plan.id };
        return next;
      });
    }

    notify(message);
    invalidateWeatherCache();
    closePlanEditor();
  };

  const applyPlanEditDraft = (draftJson: string) => {
    try {
      applySinglePlanDraft(
        parseSinglePlanDraft(draftJson),
        isCreatingPlan ? t('planCreated') : t('planUpdated'),
      );
    } catch (error) {
      notify(t('applyFailed', { message: getErrorMessage(error) }));
    }
  };

  const handleImport = () => {
    try {
      applyImportedPayload(parseImportJson(importTextRef.current?.value || ''), t('importDone'));
      setImportModalOpen(false);
      if (importTextRef.current) importTextRef.current.value = '';
    } catch (error) {
      notify(t('importFailed', { message: getErrorMessage(error) }));
    }
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

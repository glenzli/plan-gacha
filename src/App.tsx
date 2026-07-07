import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AiPlannerModal } from './components/AiPlannerModal';
import { ArchivedTripRows } from './components/ArchivedTripRows';
import { ArchivedTripModal } from './components/ArchivedTripModal';
import { AssignmentImpactModal } from './components/AssignmentImpactModal';
import { CandidateGroups } from './components/CandidateCards';
import { ChecklistImportModal } from './components/ChecklistImportModal';
import { ChecklistModal } from './components/ChecklistModal';
import { CurrentPlanCard } from './components/CurrentPlanCard';
import { DriveSyncModal } from './components/DriveSyncModal';
import { DriveSyncPanel } from './components/DriveSyncPanel';
import { EmptyPlanState } from './components/EmptyPlanState';
import { JsonImportModal } from './components/JsonImportModal';
import { MainDayPanel } from './components/MainDayPanel';
import {
  PlanBookings,
  PlanNotes,
  PlanStops,
} from './components/PlanContent';
import { SchedulePanel } from './components/SchedulePanel';
import { StatusPanel } from './components/StatusPanel';
import { TripHeader } from './components/TripHeader';
import { TripEditorModal } from './components/TripEditorModal';
import { useChecklistController } from './hooks/useChecklistController';
import { useDriveSyncController, type DriveSyncCallbacks } from './hooks/useDriveSyncController';
import { usePlanImageShare } from './hooks/usePlanImageShare';
import { usePlanCandidates } from './hooks/usePlanCandidates';
import { useToast } from './hooks/useToast';
import { useWeatherSync } from './hooks/useWeatherSync';
import {
  buildAiPlanningPrompt as buildAiPlanningPromptText,
  buildSinglePlanPrompt,
  compactLocationForAi,
  compactLodgingForAi,
  compactPlanForAi,
  compactTransferForAi,
  getLodgingContextForDate,
} from './domain/aiPrompts';
import {
  createEmptyTripSnapshot,
  createExampleTripSnapshot,
} from './domain/exampleData';
import {
  APP_SCHEMA_VERSION,
  type AppSnapshot,
} from './domain/sync';
import {
  buildAssignmentPreview,
  buildChecklistRiskGroup,
  buildLodgingRiskGroup,
  buildRiskItems,
  getRiskIdentity,
} from './domain/planning';
import {
  WEATHER_LABELS,
  buildWeatherOverview,
  formatWeatherSummary,
} from './domain/weather';
import { buildRiskGroups } from './domain/risk';
import { addDays, getTodayId } from './domain/date';
import {
  BOOKING_STATUS_VALUES,
  BOOKING_TYPE_VALUES,
  type BookingStatus,
  type NormalizedPlan,
  type PlanBooking,
  type PlanReminder,
  type PlanStop,
  normalizePlan,
  toArray,
} from './domain/plan';
import {
  clampTripDays,
  isEmptyTripDraft,
  normalizeSchedule,
  normalizeTripLodgings,
  normalizeTripSnapshot,
  pruneEmptyTripDrafts,
  stripChecklistFromTripSnapshot,
  type NormalizedLodging,
  type NormalizedSchedule,
  type NormalizedTripSnapshot,
} from './domain/trip';
import {
  DEFAULT_LANGUAGE,
  createTripDates,
  formatMiniDate,
  formatTripRange,
  getAiModeText,
  getBookingTypeMeta,
  getInclusiveDateSpan,
  getPlanBookingBadge,
  getPriorityLabel,
  getSmartSelectedDate,
  normalizeLanguage,
  translate,
  translateIssue,
  translateRiskTitle,
  type DisplayTripDate,
} from './domain/display';
import {
  STORAGE_KEYS,
  getSinglePlanPayload,
  loadInitialState,
  parseImportJson,
  readImportFileText,
} from './domain/appStorage';
import {
  evaluateWeather,
  getCalendarDayState,
  getDayInsight,
} from './domain/dayInsight';
import {
  downloadBlob,
  sanitizeFileNamePart,
} from './domain/browserExport';
import type { RiskItem } from './domain/risk';
import type { EditorTab, TranslateFn } from './types/ui';

const NEW_PLAN_EDITOR_ID = '__new_plan__';
const WEATHER_RULE_VALUES = new Set(Object.keys(WEATHER_LABELS.zh).filter((key) => key !== 'unknown'));

const PRIORITY_META = {
  must: { rank: 4 },
  preferred: { rank: 3 },
  backup: { rank: 2 },
  optional: { rank: 1 },
};

type AiPlannerMode = 'replan' | 'generate';
type AnyRecord = Record<string, any>;

interface PendingAssignment {
  clears: unknown[];
  nextSchedule: NormalizedSchedule;
  nextRisks: RiskItem<NormalizedPlan>[];
  targetPlan: NormalizedPlan;
  dateId: string;
}

interface TripDisplay {
  isEmpty: boolean;
  name: string;
  meta: string;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getInitialLanguage() {
  try {
    const params = new URLSearchParams(window.location.search);
    return normalizeLanguage(params.get('lang') || DEFAULT_LANGUAGE);
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function App() {
  const { i18n } = useTranslation();
  const [, startUiTransition] = useTransition();
  const [language, setLanguage] = useState<string>(() => normalizeLanguage(i18n.language || getInitialLanguage()));
  const [initial] = useState(loadInitialState);
  const [trips, setTrips] = useState(initial.trips);
  const [activeTripId, setActiveTripId] = useState(initial.activeTripId);
  const [tripName, setTripName] = useState(initial.tripName);
  const [startDateStr, setStartDateStr] = useState(initial.startDate);
  const [tripDays, setTripDays] = useState(initial.tripDays);
  const [plans, setPlans] = useState<any[]>(initial.plans);
  const [schedule, setSchedule] = useState<NormalizedSchedule>(initial.schedule);
  const [lodgings, setLodgings] = useState<NormalizedLodging[]>(initial.lodgings);
  const [selectedDateId, setSelectedDateId] = useState(initial.selectedDate);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPlanId, setEditorPlanId] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>('itinerary');
  const [batchAiOpen, setBatchAiOpen] = useState(false);
  const [aiPlannerOpen, setAiPlannerOpen] = useState(false);
  const [aiPlannerMode, setAiPlannerMode] = useState<AiPlannerMode>('replan');
  const [tripMenuOpen, setTripMenuOpen] = useState(false);
  const [mobileRisksOpen, setMobileRisksOpen] = useState(false);
  const [archivedViewTripId, setArchivedViewTripId] = useState<string | null>(null);
  const [pendingAssignment, setPendingAssignment] = useState<PendingAssignment | null>(null);

  const dayTileRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const aiPlannerQuestionRef = useRef<HTMLTextAreaElement | null>(null);
  const aiPlannerResultRef = useRef<HTMLTextAreaElement | null>(null);
  const importTextRef = useRef<HTMLTextAreaElement | null>(null);
  const lodgingSectionRef = useRef<HTMLDivElement | null>(null);
  const driveCallbacksRef = useRef<DriveSyncCallbacks | null>(null);
  const { toast, notify } = useToast();
  const t: TranslateFn = useMemo(() => (key, vars) => translate(key, language, vars), [language]);
  const {
    driveFeatureEnabled,
    driveStorage,
    driveStatus,
    driveBusy,
    driveConflict,
    drivePanelOpen,
    setDrivePanelOpen,
    driveAutoSync,
    setDriveAutoSync,
    loadDriveFile,
    mergeDriveFile,
    overwriteDriveFile,
    syncDrive,
  } = useDriveSyncController({
    callbacksRef: driveCallbacksRef,
    language,
    notify,
    t,
  });
  const aiReplanText = getAiModeText('replan', language);
  const aiGenerateText = getAiModeText('generate', language);

  const tripDates = useMemo(
    () => createTripDates(startDateStr, tripDays, language),
    [language, startDateStr, tripDays],
  );
  const endDateStr = useMemo(
    () => addDays(startDateStr, Math.max(tripDays - 1, 0)),
    [startDateStr, tripDays],
  );
  const {
    applyChecklistSnapshot,
    checklistDraftRef,
    checklistEditing,
    checklistGroups,
    checklistImportConflicts,
    checklistImportOpen,
    checklistImportText,
    checklistOpen,
    checklistState,
    checklistStats,
    checklistText,
    closeChecklistImport,
    getChecklistConflictLabel,
    getChecklistStatusLabel,
    loadChecklistExample,
    mergeChecklistFromImport,
    openChecklist,
    openChecklistImport,
    reconciledChecklistState,
    replaceChecklistFromImport,
    resetChecklistState,
    saveChecklistText,
    setChecklistEditing,
    setChecklistImportConflicts,
    setChecklistImportText,
    setChecklistOpen,
    toggleChecklistDone,
    toggleChecklistSkipped,
  } = useChecklistController({
    initialChecklistState: initial.checklistState,
    initialChecklistText: initial.checklistText,
    language,
    notify,
    startUiTransition,
    t,
  });

  const normalizedPlans = useMemo(
    () => plans.map((plan, index) => normalizePlan(plan, index, tripDates)),
    [plans, tripDates],
  );
  const hasInitializedPlans = normalizedPlans.length > 0;
  const {
    weatherData,
    setWeatherData,
    weatherLoading,
    weatherError,
    refreshWeather,
    clearWeatherError,
  } = useWeatherSync({
    initialWeatherData: initial.weatherData,
    language,
    normalizedPlans,
    notify,
    startDateStr,
    t,
    tripDates,
  });

  const plansById = useMemo(() => {
    return new Map(normalizedPlans.map((plan) => [plan.id, plan]));
  }, [normalizedPlans]);

  const smartSelectedDateId = useMemo(
    () => getSmartSelectedDate(startDateStr, tripDays),
    [startDateStr, tripDays],
  );

  const selectedDate = useMemo(
    () => tripDates.find((date) => date.id === selectedDateId) || tripDates.find((date) => date.id === smartSelectedDateId) || tripDates[0],
    [smartSelectedDateId, tripDates, selectedDateId],
  );

  const selectedDateEntry = selectedDate ? schedule[selectedDate.id] : null;
  const selectedPlan = selectedDateEntry ? plansById.get(selectedDateEntry.planId) : null;
  const { planImageBusy, shareCurrentPlanImage } = usePlanImageShare({
    notify,
    selectedDate,
    selectedPlan,
    t,
    tripName,
  });
  const selectedIndex = selectedDate
    ? tripDates.findIndex((date) => date.id === selectedDate.id)
    : -1;

  const riskItems = useMemo(
    () => buildRiskItems({
      plans: normalizedPlans,
      tripDates,
      schedule,
      plansById,
      weatherData,
      evaluateWeather,
    }),
    [normalizedPlans, plansById, schedule, tripDates, weatherData],
  );
  const scheduleRiskGroups = useMemo(
    () => buildRiskGroups(riskItems, tripDates),
    [riskItems, tripDates],
  );
  const checklistRiskGroup = useMemo(
    () => buildChecklistRiskGroup(checklistGroups, checklistState, language),
    [checklistGroups, checklistState, language],
  );
  const scheduleHasEntries = useMemo(
    () => Object.keys(schedule).length > 0,
    [schedule],
  );
  const lodgingRiskGroup = useMemo(
    () => buildLodgingRiskGroup(lodgings, hasInitializedPlans || scheduleHasEntries, t('lodgingMissingHelp')),
    [hasInitializedPlans, lodgings, scheduleHasEntries, t],
  );
  const riskGroups = useMemo(
    () => [
      ...scheduleRiskGroups,
      ...(lodgingRiskGroup ? [lodgingRiskGroup] : []),
      ...(checklistRiskGroup ? [checklistRiskGroup] : []),
    ],
    [checklistRiskGroup, lodgingRiskGroup, scheduleRiskGroups],
  );
  const weatherOverview = useMemo(
    () => buildWeatherOverview({
      tripDates,
      schedule,
      plansById,
      language,
      evaluateWeather: (plan, dateId) => evaluateWeather(plan, dateId, weatherData, language),
    }),
    [language, plansById, schedule, tripDates, weatherData],
  );

  const visibleTrips = useMemo(
    () => pruneEmptyTripDrafts(trips, activeTripId).filter((trip) => !trip.archived),
    [activeTripId, trips],
  );
  const archivedTrips = useMemo(() => trips.filter((trip) => trip.archived), [trips]);
  const archivedViewTrip = useMemo(
    () => archivedTrips.find((trip) => trip.id === archivedViewTripId) || null,
    [archivedTrips, archivedViewTripId],
  );
  const activeTripOption = trips.find((trip) => trip.id === activeTripId);
  const activeTripArchived = activeTripOption?.archived || false;
  const planAssignments = useMemo(() => {
    return new Map(
      Object.entries(schedule)
        .filter(([, entry]) => entry?.planId)
        .map(([dateId, entry]) => [entry.planId, dateId]),
    );
  }, [schedule]);

  const {
    availableCandidateCount,
    currentCandidate,
    candidateGroups,
  } = usePlanCandidates({
    aiPlannerOpen,
    archivedViewTripId,
    checklistImportOpen,
    checklistOpen,
    drivePanelOpen,
    editorOpen,
    importModalOpen,
    language,
    normalizedPlans,
    planAssignments,
    plansById,
    riskItems,
    schedule,
    selectedDate,
    selectedPlan,
    t,
    tripDates,
    weatherData,
  });
  const isCreatingPlan = editorPlanId === NEW_PLAN_EDITOR_ID;
  const editorPlan = editorPlanId && !isCreatingPlan ? plansById.get(editorPlanId) : null;
  const getPlanEditorDraftJson = (planId = NEW_PLAN_EDITOR_ID) => {
    const plan = planId && planId !== NEW_PLAN_EDITOR_ID ? plansById.get(planId) : null;
    if (plan) return JSON.stringify(compactPlanForAi(plan, planAssignments.get(plan.id) || null), null, 2);

    return JSON.stringify({
      id: '',
      name: language === 'en' ? 'New plan' : '新计划',
      description: '',
      priority: 'preferred',
      location: {
        label: '',
        address: '',
        weather_location: { query: '', country_code: '', admin1: '', latitude: '', longitude: '' },
      },
      stops: [],
      available_dates: tripDates.map((date) => date.id),
      closed_dates: [],
      weather_rules: { best: [], ok: [], blocked: ['heavy_rain', 'storm'] },
      conflicts: [],
      bookings: [],
      reminders: [],
      tips: [],
    }, null, 2);
  };

  const changeLanguage = (nextLanguage: string) => {
    const normalizedLanguage = normalizeLanguage(nextLanguage);
    setLanguage(normalizedLanguage);
    i18n.changeLanguage(normalizedLanguage);
    document.documentElement.lang = normalizedLanguage;

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('lang', normalizedLanguage);
    window.history.replaceState(null, '', nextUrl);
  };

  const toggleLanguage = () => {
    changeLanguage(language === 'zh' ? 'en' : 'zh');
  };

  useEffect(() => {
    document.documentElement.lang = language;
    if (i18n.language !== language) i18n.changeLanguage(language);
  }, [i18n, language]);

  useEffect(() => {
    const syncLanguageFromUrl = () => {
      const nextLanguage = getInitialLanguage();
      setLanguage(nextLanguage);
      document.documentElement.lang = nextLanguage;
      if (i18n.language !== nextLanguage) i18n.changeLanguage(nextLanguage);
    };

    window.addEventListener('popstate', syncLanguageFromUrl);
    return () => window.removeEventListener('popstate', syncLanguageFromUrl);
  }, [i18n]);

  useEffect(() => {
    const currentTrip = {
      id: activeTripId,
      name: tripName || t('unnamedTrip'),
      startDateStr,
      tripDays,
      plans: normalizedPlans,
      schedule: normalizeSchedule(schedule),
      lodgings,
      checklistText: '',
      checklistState: {},
      archived: activeTripArchived,
    };
    const persistedTrips = pruneEmptyTripDrafts(
      trips.map((trip) => (trip.id === activeTripId ? currentTrip : trip)),
      activeTripId,
    ).map(stripChecklistFromTripSnapshot);

    localStorage.setItem(STORAGE_KEYS.schemaVersion, APP_SCHEMA_VERSION);
    localStorage.setItem(STORAGE_KEYS.trips, JSON.stringify(persistedTrips));
    localStorage.setItem(STORAGE_KEYS.currentTrip, activeTripId);
  }, [
    activeTripId,
    activeTripArchived,
    t,
    normalizedPlans,
    lodgings,
    schedule,
    startDateStr,
    tripName,
    tripDays,
    trips,
  ]);

  const getCurrentTripSnapshot = (): NormalizedTripSnapshot => ({
    id: activeTripId,
    name: tripName || t('unnamedTrip'),
    startDateStr,
    tripDays,
    plans: normalizedPlans,
    schedule: normalizeSchedule(schedule),
    lodgings,
    checklistText: '',
    checklistState: {},
    archived: activeTripArchived,
  });

  const applyTripSnapshot = (trip: unknown) => {
    const normalizedTrip = normalizeTripSnapshot(trip);
    setActiveTripId(normalizedTrip.id);
    setTripName(normalizedTrip.name);
    setStartDateStr(normalizedTrip.startDateStr);
    setTripDays(normalizedTrip.tripDays);
    setPlans(normalizedTrip.plans);
    setSchedule(normalizedTrip.schedule);
    setLodgings(normalizedTrip.lodgings || []);
    setSelectedDateId(getSmartSelectedDate(normalizedTrip.startDateStr, normalizedTrip.tripDays));
    clearWeatherError();
  };

  const saveCurrentTripInto = (tripList: NormalizedTripSnapshot[]): NormalizedTripSnapshot[] => {
    const currentTrip = getCurrentTripSnapshot();
    return tripList
      .map((trip) => (trip.id === activeTripId ? currentTrip : trip));
  };

  const exportAppSnapshot = (): AppSnapshot => ({
    appSchemaVersion: APP_SCHEMA_VERSION,
    snapshotVersion: 1,
    activeTripId,
    trips: pruneEmptyTripDrafts(saveCurrentTripInto(trips), activeTripId).map(stripChecklistFromTripSnapshot),
    checklistText,
    checklistState: reconciledChecklistState,
  });

  const isLocalWorkspaceEmpty = (snapshot: AppSnapshot = exportAppSnapshot()) => {
    const hasTripContent = snapshot.trips.some((trip) => (
      Array.isArray(trip.plans) && trip.plans.length > 0
    ) || (
      Array.isArray(trip.lodgings) && trip.lodgings.length > 0
    ) || Object.values(trip.schedule || {}).some((entry) => Boolean((entry as NormalizedSchedule[string] | undefined)?.planId)));
    const hasChecklistContent = Boolean(snapshot.checklistText?.trim())
      || Object.keys(snapshot.checklistState || {}).length > 0;

    return !hasTripContent && !hasChecklistContent;
  };

  const resetAiPlannerFields = () => {
    if (aiPlannerQuestionRef.current) aiPlannerQuestionRef.current.value = '';
    if (aiPlannerResultRef.current) aiPlannerResultRef.current.value = '';
  };

  const importAppSnapshot = (payload: any) => {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.trips)) {
      throw new Error(t('driveInvalidSnapshot'));
    }

    const importedTrips = payload.trips
      .map((trip: unknown, index: number) => normalizeTripSnapshot(trip, index));
    if (!importedTrips.length) throw new Error(t('driveInvalidSnapshot'));

    const preferredTripId = payload.activeTripId || importedTrips[0].id;
    const visibleImportedTrips = importedTrips.filter((trip: NormalizedTripSnapshot) => !trip.archived);
    const activeTrip = visibleImportedTrips.find((trip: NormalizedTripSnapshot) => trip.id === preferredTripId)
      || visibleImportedTrips[0]
      || importedTrips.find((trip: NormalizedTripSnapshot) => trip.id === preferredTripId)
      || importedTrips[0];
    const nextTrips: NormalizedTripSnapshot[] = pruneEmptyTripDrafts(importedTrips, activeTrip.id);
    const nextActiveTrip = nextTrips.find((trip) => trip.id === activeTrip.id) || nextTrips[0];

    setTrips(nextTrips);
    applyTripSnapshot(nextActiveTrip);
    applyChecklistSnapshot(
      payload.checklistText ?? payload.checklist ?? payload.packingList,
      payload.checklistState || payload.checklistStatus || {},
    );
    setImportModalOpen(false);
    setPendingAssignment(null);
    setArchivedViewTripId(null);
    setBatchAiOpen(false);
    setAiPlannerOpen(false);
    resetAiPlannerFields();
  };

  useEffect(() => {
    driveCallbacksRef.current = {
      exportAppSnapshot,
      importAppSnapshot,
      isLocalWorkspaceEmpty,
    };
  });

  const switchTrip = (nextTripId: string) => {
    setTripMenuOpen(false);
    if (nextTripId === activeTripId) return;
    const nextTrip = visibleTrips.find((trip) => trip.id === nextTripId);
    if (!nextTrip) return;

    setTrips(pruneEmptyTripDrafts(saveCurrentTripInto(trips), nextTripId));
    applyTripSnapshot(nextTrip);
  };

  const createNewTrip = () => {
    if (!hasInitializedPlans) {
      startUiTransition(() => {
        setTripMenuOpen(false);
        setEditorTab('itinerary');
        setEditorOpen(true);
        setBatchAiOpen(false);
      });
      notify(t('emptyPlanNotice'));
      return;
    }

    const nextTrip = createEmptyTripSnapshot(language === 'en' ? `Trip ${trips.length + 1}` : `旅行计划 ${trips.length + 1}`, getTodayId());
    setTrips([...pruneEmptyTripDrafts(saveCurrentTripInto(trips), activeTripId), nextTrip]);
    applyTripSnapshot(nextTrip);
    startUiTransition(() => {
      setTripMenuOpen(false);
      setEditorTab('itinerary');
      setEditorOpen(true);
      setBatchAiOpen(false);
    });
    notify(t('newTripCreated'));
  };

  const loadExampleTrip = () => {
    const hasCurrentContent = normalizedPlans.length > 0 || lodgings.length > 0 || Object.keys(schedule).length > 0;
    if (hasCurrentContent && !window.confirm(t('overwriteExampleConfirm'))) return;

    const exampleTrip = createExampleTripSnapshot(t('exampleTripName'), startDateStr, activeTripId);
    setTripName(exampleTrip.name);
    setTripDays(exampleTrip.tripDays);
    setPlans(exampleTrip.plans);
    setSchedule(exampleTrip.schedule);
    setLodgings(exampleTrip.lodgings || []);
    setWeatherData({});
    setSelectedDateId(exampleTrip.startDateStr);
    closePlanEditor();
    setBatchAiOpen(false);
    notify(t('exampleLoaded'));
  };

  const openBatchAiGenerator = () => {
    startUiTransition(() => {
      setAiPlannerMode('generate');
      setAiPlannerOpen(false);
      setEditorPlanId(null);
      setEditorTab('itinerary');
      setEditorOpen(true);
      setBatchAiOpen(true);
    });
    resetAiPlannerFields();
  };

  const openAiPlanner = (mode: AiPlannerMode = 'replan') => {
    if (mode === 'generate' || !hasInitializedPlans) {
      openBatchAiGenerator();
      return;
    }

    resetAiPlannerFields();
    startUiTransition(() => {
      setAiPlannerMode('replan');
      setEditorOpen(false);
      setAiPlannerOpen(true);
    });
  };

  const openPlanEditor = (planId: string = NEW_PLAN_EDITOR_ID) => {
    startUiTransition(() => {
      setEditorPlanId(planId);
      setEditorTab('itinerary');
      setEditorOpen(true);
      setBatchAiOpen(false);
      setAiPlannerOpen(false);
    });
  };

  const openLodgingEditor = () => {
    startUiTransition(() => {
      setEditorPlanId(null);
      setEditorTab('lodging');
      setEditorOpen(true);
      setBatchAiOpen(false);
      setAiPlannerOpen(false);
    });
    window.setTimeout(() => {
      lodgingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const closePlanEditor = () => {
    setEditorPlanId(null);
  };

  const removePlan = (planId: string) => {
    const plan = plansById.get(planId);
    if (!plan || !window.confirm(t('deletePlanConfirm', { name: plan.name }))) return;

    setPlans((current) => current.filter((item, index) => normalizePlan(item, index, tripDates).id !== planId));
    setSchedule((current) => Object.fromEntries(
      Object.entries(current).filter(([, entry]) => entry?.planId !== planId),
    ));
    if (editorPlanId === planId) closePlanEditor();
    notify(t('planDeleted'));
  };

  const saveLodgings = (nextLodgings: unknown[]) => {
    setLodgings(normalizeTripLodgings(nextLodgings));
    notify(t('lodgingsSaved'));
  };

  const updatePlanBookingStatus = (planId: string, bookingId: string, nextStatus: BookingStatus) => {
    setPlans((current) => current.map((plan, index) => {
      const normalizedPlan = normalizePlan(plan, index, tripDates);
      if (normalizedPlan.id !== planId) return plan;

      return {
        ...plan,
        bookings: normalizedPlan.bookings.map((booking) => (
          booking.id === bookingId ? { ...booking, status: nextStatus } : booking
        )),
      };
    }));
    notify(nextStatus === 'done' ? t('bookingDone') : t('bookingPending'));
  };

  const applyTripListAfterCurrentRemoved = (nextTrips: NormalizedTripSnapshot[], message: string) => {
    const tripsWithContent = nextTrips.filter((trip: NormalizedTripSnapshot) => !isEmptyTripDraft(trip));
    const nextTrip = tripsWithContent.find((trip: NormalizedTripSnapshot) => !trip.archived && trip.id !== activeTripId) || createEmptyTripSnapshot(language === 'en' ? `Trip ${tripsWithContent.length + 1}` : `旅行计划 ${tripsWithContent.length + 1}`, getTodayId());
    const finalTrips = tripsWithContent.some((trip: NormalizedTripSnapshot) => trip.id === nextTrip.id) ? tripsWithContent : [...tripsWithContent, nextTrip];

    setTrips(finalTrips);
    applyTripSnapshot(nextTrip);
    setEditorOpen(false);
    notify(message);
  };

  const archiveCurrentTrip = () => {
    if (!window.confirm(t('archiveTripConfirm', { name: tripName || t('unnamedTrip') }))) return;

    const archivedTrip = { ...getCurrentTripSnapshot(), archived: true };
    const updatedTrips = trips.map((trip) => (trip.id === activeTripId ? archivedTrip : trip));
    applyTripListAfterCurrentRemoved(updatedTrips, t('tripArchived'));
  };

  const deleteCurrentTrip = () => {
    const currentTripIsEmpty = !hasInitializedPlans && lodgings.length === 0 && Object.keys(schedule).length === 0;
    if (!currentTripIsEmpty && !window.confirm(t('deleteTripConfirm', { name: tripName || t('unnamedTrip') }))) return;

    const updatedTrips = trips.filter((trip) => trip.id !== activeTripId);
    applyTripListAfterCurrentRemoved(updatedTrips, t('tripDeleted'));
  };

  const restoreArchivedTrip = (tripId: string) => {
    const restoredTrips = trips.map((trip) => (trip.id === tripId ? { ...trip, archived: false } : trip));
    const restoredTrip = restoredTrips.find((trip) => trip.id === tripId);
    if (!restoredTrip) return;

    setTrips(saveCurrentTripInto(restoredTrips));
    applyTripSnapshot(restoredTrip);
    setEditorOpen(false);
    setArchivedViewTripId(null);
    notify(t('archivedRestored'));
  };

  const buildAssignmentImpact = (dateId: string, planId: string) => {
    const targetPlan = plansById.get(planId);
    if (!targetPlan) return null;

    const { clears, nextSchedule } = buildAssignmentPreview(schedule, dateId, targetPlan, plansById);
    const currentRiskKeys = new Set(riskItems.map(getRiskIdentity));

    const nextRisks = buildRiskItems({
      plans: normalizedPlans,
      tripDates,
      schedule: nextSchedule,
      plansById,
      weatherData,
      evaluateWeather,
    })
      .filter((risk) => risk.level !== 'info')
      .filter((risk) => !currentRiskKeys.has(getRiskIdentity(risk)));

    return { clears, nextSchedule, nextRisks, targetPlan, dateId };
  };

  const applySchedule = (nextSchedule: NormalizedSchedule, message = t('scheduleUpdated')) => {
    setSchedule(nextSchedule);
    notify(message);
  };

  const requestAssignPlan = (dateId: string, planId: string) => {
    const impact = buildAssignmentImpact(dateId, planId);
    if (!impact) return;

    if (impact.clears.length || impact.nextRisks.length) {
      setPendingAssignment(impact);
      return;
    }

    applySchedule(impact.nextSchedule, t('dayPlanUpdated'));
  };

  const confirmPendingAssignment = () => {
    if (!pendingAssignment) return;
    applySchedule(pendingAssignment.nextSchedule, pendingAssignment.clears.length ? t('impactedDatesCleared') : t('dayPlanUpdated'));
    setPendingAssignment(null);
  };

  const clearDay = (dateId: string) => {
    setSchedule((current) => {
      const next = { ...current };
      delete next[dateId];
      return next;
    });
    notify(t('dayCleared'));
  };

  const selectNeighborDate = (step: number) => {
    if (selectedIndex < 0) return;
    const next = tripDates[selectedIndex + step];
    if (next) setSelectedDateId(next.id);
  };

  const scrollToScheduleDate = (dateId: string) => {
    if (!window.matchMedia('(max-width: 560px)').matches) return;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        dayTileRefs.current.get(dateId)?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    });
  };

  const selectScheduleDate = (dateId: string, options: { scroll?: boolean } = {}) => {
    setSelectedDateId(dateId);
    if (options.scroll) scrollToScheduleDate(dateId);
  };

  const copyText = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(message);
    } catch {
      notify(t('copyFailed'));
    }
  };

  const downloadJson = (data: unknown, fileName: string, message: string) => {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      downloadBlob(blob, fileName);
      notify(message);
    } catch {
      notify(t('downloadFailed'));
    }
  };

  const buildAiPlanningPrompt = (mode: AiPlannerMode = aiPlannerMode) => {
    const planningStartDate = selectedDate || tripDates[0];
    const fixedDates = planningStartDate
      ? tripDates.filter((date) => date.id < planningStartDate.id)
      : [];
    const adjustableDates = planningStartDate
      ? tripDates.filter((date) => date.id >= planningStartDate.id)
      : tripDates;
    const completedPlanIds = new Set(
      fixedDates
        .map((date) => schedule[date.id]?.planId)
        .filter(Boolean),
    );
    const remainingPlans = normalizedPlans.filter((plan) => !completedPlanIds.has(plan.id));

    const summarizeScheduleDate = (date: DisplayTripDate) => {
      const plan = schedule[date.id]?.planId ? plansById.get(schedule[date.id].planId) : null;
      const insight = getDayInsight(plan, date.id, schedule, plansById, weatherData, language);
      return {
        date: date.id,
        day: 'D' + date.dayNumber,
        display: date.display,
        plan_id: plan?.id || null,
        plan_name: plan?.name || null,
        status: insight.label || t('normal'),
        weather: insight.weatherText || '',
        note: insight.riskText || '',
        lodging: getLodgingContextForDate(lodgings, date.id),
      };
    };

    const summarizePlan = (plan: NormalizedPlan) => ({
      plan_id: plan.id,
      name: plan.name,
      priority: getPriorityLabel(plan.priority, language),
      description: plan.description,
      current_assigned_date: planAssignments.get(plan.id) || null,
      available_dates: plan.available_dates,
      closed_dates: plan.closed_dates,
      weather_rules: plan.weather_rules,
      location: compactLocationForAi(plan.location),
      stops: plan.stops.map((stop: PlanStop) => ({
        time: stop.time,
        title: stop.title,
        location: stop.location.label,
        address: stop.location.address || '',
        transfer_from_previous: compactTransferForAi(stop.transferFromPrevious),
        opening_hours: stop.openingHours,
        note: stop.note,
      })),
      bookings: plan.bookings.map((booking: PlanBooking) => ({
        title: booking.title,
        type: booking.type,
        status: booking.status,
        address: booking.address,
        url: booking.url,
        cancel_url: booking.cancelUrl,
        note: booking.note,
      })),
      reminders: plan.reminders.map((item: PlanReminder) => ({
        time: item.time,
        text: item.text,
        links: item.links || [],
      })),
      tips: plan.tips,
      conflicts: plan.conflicts,
      weather_by_adjustable_date: adjustableDates.map((date) => {
        const weather = evaluateWeather(plan, date.id, weatherData, language);
        return {
          date: date.id,
          status: weather.label,
          summary: weather.snapshot ? formatWeatherSummary(weather.snapshot, language) : t('weatherUnknown'),
        };
      }),
    });

    const tripContext = {
      trip: {
        name: tripName || t('unnamedTrip'),
        range: formatTripRange(startDateStr, tripDays, language),
        days: tripDays,
        planning_from: planningStartDate?.id || null,
      },
      lodgings: lodgings.map(compactLodgingForAi),
      existing_schedule: tripDates.map(summarizeScheduleDate),
      existing_plans: normalizedPlans.map(summarizePlan),
      current_warnings: riskGroups.map((group) => ({
        title: translateRiskTitle(group.title, language),
        level: group.level,
        items: group.items,
      })),
    };

    return buildAiPlanningPromptText({
      mode,
      language,
      tripContext,
      hasInitializedPlans,
      plannerQuestion: aiPlannerQuestionRef.current?.value || '',
      unplannedDates: tripDates.filter((date) => !schedule[date.id]?.planId),
      fixedDates,
      adjustableDates,
      remainingPlans,
      normalizedPlans,
      summarizeScheduleDate,
      summarizePlan,
    });
  };

  const copyAiPlanningPrompt = () => {
    copyText(buildAiPlanningPrompt(), t('aiPromptCopied', { label: getAiModeText(aiPlannerMode, language).label }));
  };

  const copyBatchAiPrompt = () => {
    copyText(buildAiPlanningPrompt('generate'), t('aiPromptCopied', { label: aiGenerateText.label }));
  };

  const applyImportedPayload = (parsed: AnyRecord, message = t('jsonApplied')) => {
    let touched = false;

    if (parsed.startDateStr) setStartDateStr(parsed.startDateStr);
    if (parsed.tripDays) setTripDays(clampTripDays(parsed.tripDays));
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
          const existingIndex = next.findIndex((plan) => plan.id === normalized.id);
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

    if (!touched && !parsed.startDateStr && !parsed.tripDays) {
      throw new Error(t('noApplicableJson'));
    }

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


  const buildPlanAiPrompt = (planQuestion: string = '') => {
    const currentPlan = editorPlan
      ? compactPlanForAi(editorPlan, planAssignments.get(editorPlan.id) || null)
      : null;
    const planUserRequest = planQuestion.trim() || (isCreatingPlan
      ? (language === 'en' ? 'Add a plan that fits the current trip.' : '请新增一个适合当前旅行的计划。')
      : (language === 'en' ? 'Improve the current plan.' : '请优化当前计划。'));
    const tripContext = {
      name: tripName || t('unnamedTrip'),
      range: formatTripRange(startDateStr, tripDays, language),
      days: tripDays,
    };
    const planContext = isCreatingPlan
      ? {
        trip: tripContext,
        lodgings: lodgings.map(compactLodgingForAi),
        existing_plan_ids: normalizedPlans.map((plan) => plan.id),
      }
      : {
        trip: tripContext,
        lodgings: lodgings.map(compactLodgingForAi),
        current_plan: currentPlan,
      };

    return buildSinglePlanPrompt({
      language,
      isCreatingPlan,
      planContext,
      userRequest: planUserRequest,
    });
  };

  const copyPlanAiPrompt = (planQuestion: string = '') => {
    copyText(buildPlanAiPrompt(planQuestion), isCreatingPlan ? t('addPlanPromptCopied') : t('editPlanPromptCopied'));
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
      assertPlanDraftOption(payload.priority, new Set(Object.keys(PRIORITY_META)), 'priority');
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
    const data = { schemaVersion: APP_SCHEMA_VERSION, startDateStr, tripDays, lodgings, plans: normalizedPlans, schedule };
    const fileName = `${sanitizeFileNamePart(tripName || t('unnamedTrip'))}-${startDateStr || 'trip'}.json`;
    downloadJson(data, fileName, t('jsonDownloaded'));
  };

  const handleExportChecklist = () => {
    const data = {
      schemaVersion: APP_SCHEMA_VERSION,
      checklistText,
      checklistState,
    };
    const fileName = `${sanitizeFileNamePart(tripName || t('unnamedTrip'))}-checklist-${startDateStr || 'trip'}.json`;
    downloadJson(data, fileName, t('checklistExported'));
  };

  const renderDriveSyncPanel = () => {
    return (
      <DriveSyncPanel
        driveStorage={driveStorage}
        driveStatus={driveStatus}
        driveBusy={driveBusy}
        driveConflict={driveConflict}
        driveAutoSync={driveAutoSync}
        setDriveAutoSync={setDriveAutoSync}
        loadDriveFile={loadDriveFile}
        mergeDriveFile={mergeDriveFile}
        overwriteDriveFile={overwriteDriveFile}
        syncDrive={syncDrive}
        t={t}
        language={language}
      />
    );
  };

  const renderPlanStops = (plan: NormalizedPlan | null | undefined) => plan ? (
    <PlanStops
      plan={plan}
      t={t}
      language={language}
      onCopyPlace={(copyValue) => copyText(copyValue, t('placeCopied'))}
    />
  ) : null;

  const renderPlanBookings = (plan: NormalizedPlan | null | undefined, options: { readOnly?: boolean } = {}) => plan ? (
    <PlanBookings
      plan={plan}
      t={t}
      language={language}
      getBookingTypeMeta={getBookingTypeMeta}
      onUpdateBookingStatus={updatePlanBookingStatus}
      readOnly={options.readOnly}
    />
  ) : null;

  const renderPlanNotes = (plan: NormalizedPlan | null | undefined) => plan ? (
    <PlanNotes plan={plan} t={t} />
  ) : null;

  const renderCandidateGroups = (gridClassName: string = 'plan-grid') => (
    <CandidateGroups
      candidateGroups={candidateGroups}
      gridClassName={gridClassName}
      t={t}
      language={language}
      tripDates={tripDates}
      selectedDate={selectedDate}
      requestAssignPlan={requestAssignPlan}
      openPlanEditor={openPlanEditor}
      getPriorityLabel={getPriorityLabel}
      getPlanBookingBadge={getPlanBookingBadge}
      renderPlanStops={renderPlanStops}
      renderPlanBookings={renderPlanBookings}
      renderPlanNotes={renderPlanNotes}
    />
  );

  const renderCurrentPlanCard = (className: string) => (
    <CurrentPlanCard
      className={className}
      selectedDate={selectedDate}
      selectedPlan={selectedPlan}
      currentCandidate={currentCandidate}
      planImageBusy={planImageBusy}
      shareCurrentPlanImage={shareCurrentPlanImage}
      openPlanEditor={openPlanEditor}
      clearDay={clearDay}
      t={t}
      language={language}
      getPriorityLabel={getPriorityLabel}
      getPlanBookingBadge={getPlanBookingBadge}
      renderPlanStops={renderPlanStops}
      renderPlanBookings={renderPlanBookings}
      renderPlanNotes={renderPlanNotes}
    />
  );

  const renderArchivedTripRows = () => {
    return (
      <ArchivedTripRows
        archivedTrips={archivedTrips}
        formatTripRange={formatTripRange}
        language={language}
        onRestore={restoreArchivedTrip}
        onView={setArchivedViewTripId}
        t={t}
      />
    );
  };

  const renderEmptyPlanState = () => (
    <EmptyPlanState
      onImport={() => startUiTransition(() => setImportModalOpen(true))}
      onLoadExample={loadExampleTrip}
      onOpenAi={openBatchAiGenerator}
      renderArchivedTripRows={renderArchivedTripRows}
      t={t}
    />
  );

  const selectEditorTab = (tab: EditorTab) => {
    startUiTransition(() => setEditorTab(tab));
  };

  const changeEditorStartDate = (nextStartDate: string) => {
    if (!nextStartDate) return;
    setStartDateStr(nextStartDate);
    setSelectedDateId(getSmartSelectedDate(nextStartDate, tripDays));
  };

  const changeEditorEndDate = (nextEndDate: string) => {
    if (!nextEndDate) return;
    const nextTripDays = getInclusiveDateSpan(startDateStr, nextEndDate);
    setTripDays(nextTripDays);
    setSelectedDateId(getSmartSelectedDate(startDateStr, nextTripDays));
  };

  const openImportModal = () => {
    startUiTransition(() => setImportModalOpen(true));
  };

  const toggleBatchAiPanel = () => {
    startUiTransition(() => {
      setEditorPlanId(null);
      setEditorTab('itinerary');
      setAiPlannerMode('generate');
      setBatchAiOpen((current) => !current);
    });
  };

  const getTripDisplay = (trip: Partial<NormalizedTripSnapshot>, isCurrentTrip = false): TripDisplay => {
    const tripHasPlans = isCurrentTrip
      ? hasInitializedPlans
      : Array.isArray(trip.plans) && trip.plans.length > 0;

    return {
      isEmpty: !tripHasPlans,
      name: tripHasPlans ? (isCurrentTrip ? tripName : trip.name || t('unnamedTrip')) : t('emptyTripName'),
      meta: tripHasPlans
        ? `${formatTripRange(isCurrentTrip ? startDateStr : trip.startDateStr || startDateStr, isCurrentTrip ? tripDays : trip.tripDays || tripDays, language)} · ${t('daysCount', { count: isCurrentTrip ? tripDays : trip.tripDays || tripDays })}`
        : '',
    };
  };

  const activeTripDisplay = getTripDisplay(activeTripOption || {}, true);
  const tripMenuDisabled = activeTripDisplay.isEmpty && visibleTrips.length <= 1;

  return (
    <div className="app-shell">
      <TripHeader
        activeTripDisplay={activeTripDisplay}
        activeTripId={activeTripId}
        createNewTrip={createNewTrip}
        driveFeatureEnabled={driveFeatureEnabled}
        driveStorage={driveStorage}
        getTripDisplay={getTripDisplay}
        hasInitializedPlans={hasInitializedPlans}
        onOpenDriveSync={() => startUiTransition(() => setDrivePanelOpen(true))}
        onOpenTripEditor={() => {
          startUiTransition(() => {
            setTripMenuOpen(false);
            setEditorPlanId(null);
            setEditorTab('itinerary');
            setEditorOpen(true);
          });
        }}
        openAiPlanner={openAiPlanner}
        openChecklist={openChecklist}
        openLodgingEditor={openLodgingEditor}
        setTripMenuOpen={setTripMenuOpen}
        switchTrip={switchTrip}
        t={t}
        toggleLanguage={toggleLanguage}
        tripMenuDisabled={tripMenuDisabled}
        tripMenuOpen={tripMenuOpen}
        visibleTrips={visibleTrips}
      />

      {hasInitializedPlans ? (
        <main className="app-layout">
          <SchedulePanel
            availableCandidateCount={availableCandidateCount}
            dayTileRefs={dayTileRefs}
            formatMiniDate={formatMiniDate}
            getCalendarDayState={getCalendarDayState}
            getDayInsight={getDayInsight}
            getPriorityLabel={getPriorityLabel}
            language={language}
            mobileRisksOpen={mobileRisksOpen}
            onEditLodging={openLodgingEditor}
            onToggleMobileRisks={() => setMobileRisksOpen((current) => !current)}
            plansById={plansById}
            renderCandidateGroups={renderCandidateGroups}
            renderCurrentPlanCard={renderCurrentPlanCard}
            riskGroups={riskGroups}
            schedule={schedule}
            selectScheduleDate={selectScheduleDate}
            selectedDate={selectedDate}
            t={t}
            translateRiskTitle={translateRiskTitle}
            tripDates={tripDates}
            weatherData={weatherData}
          />

          <MainDayPanel
            availableCandidateCount={availableCandidateCount}
            renderCandidateGroups={renderCandidateGroups}
            renderCurrentPlanCard={renderCurrentPlanCard}
            selectNeighborDate={selectNeighborDate}
            selectedDate={selectedDate}
            selectedIndex={selectedIndex}
            t={t}
            tripDates={tripDates}
          />

          <StatusPanel
            riskGroups={riskGroups}
            t={t}
            language={language}
            translateRiskTitle={translateRiskTitle}
            onEditLodging={openLodgingEditor}
            refreshWeather={refreshWeather}
            weatherLoading={weatherLoading}
            weatherOverview={weatherOverview}
            weatherError={weatherError}
            weatherData={weatherData}
          />
        </main>
      ) : renderEmptyPlanState()}

      {aiPlannerOpen && (
        <AiPlannerModal
          aiPlannerQuestionRef={aiPlannerQuestionRef}
          aiPlannerResultRef={aiPlannerResultRef}
          aiReplanText={aiReplanText}
          applyAiPlannerResult={applyAiPlannerResult}
          copyAiPlanningPrompt={copyAiPlanningPrompt}
          onClose={() => setAiPlannerOpen(false)}
          t={t}
        />
      )}

      {editorOpen && (
        <TripEditorModal
          activeTripId={activeTripId}
          aiGenerateText={aiGenerateText}
          aiPlannerQuestionRef={aiPlannerQuestionRef}
          aiPlannerResultRef={aiPlannerResultRef}
          applyAiPlannerResult={applyAiPlannerResult}
          applyPlanEditDraft={applyPlanEditDraft}
          archiveCurrentTrip={archiveCurrentTrip}
          batchAiOpen={batchAiOpen}
          closePlanEditor={closePlanEditor}
          copyBatchAiPrompt={copyBatchAiPrompt}
          copyPlanAiPrompt={copyPlanAiPrompt}
          deleteCurrentTrip={deleteCurrentTrip}
          editorPlan={editorPlan}
          editorPlanId={editorPlanId}
          editorTab={editorTab}
          endDateStr={endDateStr}
          getPlanEditorDraftJson={getPlanEditorDraftJson}
          getPriorityLabel={getPriorityLabel}
          handleExportState={handleExportState}
          isCreatingPlan={isCreatingPlan}
          language={language}
          loadExampleTrip={loadExampleTrip}
          lodgingSectionRef={lodgingSectionRef}
          lodgings={lodgings}
          normalizedPlans={normalizedPlans}
          onChangeEndDate={changeEditorEndDate}
          onChangeStartDate={changeEditorStartDate}
          onClose={() => setEditorOpen(false)}
          onCommitTripName={setTripName}
          onOpenImport={openImportModal}
          onOpenPlanEditor={openPlanEditor}
          onRemovePlan={removePlan}
          onSaveLodgings={saveLodgings}
          onSelectTab={selectEditorTab}
          onToggleBatchAi={toggleBatchAiPanel}
          planAssignments={planAssignments}
          renderArchivedTripRows={renderArchivedTripRows}
          renderPlanBookings={renderPlanBookings}
          renderPlanNotes={renderPlanNotes}
          renderPlanStops={renderPlanStops}
          startDateStr={startDateStr}
          t={t}
          tripDays={tripDays}
          tripDates={tripDates}
          tripName={tripName}
        />
      )}

      {driveFeatureEnabled && drivePanelOpen && driveStorage && (
        <DriveSyncModal
          onClose={() => setDrivePanelOpen(false)}
          renderDriveSyncPanel={renderDriveSyncPanel}
          t={t}
        />
      )}

      {checklistOpen && (
        <ChecklistModal
          checklistDraftRef={checklistDraftRef}
          checklistEditing={checklistEditing}
          checklistGroups={checklistGroups}
          checklistState={checklistState}
          checklistStats={checklistStats}
          checklistText={checklistText}
          handleExportChecklist={handleExportChecklist}
          loadChecklistExample={loadChecklistExample}
          onClose={() => setChecklistOpen(false)}
          openChecklistImport={openChecklistImport}
          resetChecklistState={resetChecklistState}
          saveChecklistText={saveChecklistText}
          setChecklistEditing={setChecklistEditing}
          startUiTransition={startUiTransition}
          t={t}
          toggleChecklistDone={toggleChecklistDone}
          toggleChecklistSkipped={toggleChecklistSkipped}
        />
      )}

      {archivedViewTrip && (
        <ArchivedTripModal
          evaluateWeather={evaluateWeather}
          formatTripRange={formatTripRange}
          getPriorityLabel={getPriorityLabel}
          language={language}
          onClose={() => setArchivedViewTripId(null)}
          renderPlanBookings={renderPlanBookings}
          renderPlanNotes={renderPlanNotes}
          renderPlanStops={renderPlanStops}
          t={t}
          trip={archivedViewTrip}
          weatherData={weatherData}
        />
      )}

      {checklistImportOpen && (
        <ChecklistImportModal
          checklistImportConflicts={checklistImportConflicts}
          checklistImportText={checklistImportText}
          closeChecklistImport={closeChecklistImport}
          getChecklistConflictLabel={getChecklistConflictLabel}
          getChecklistStatusLabel={getChecklistStatusLabel}
          handleChecklistImportFile={handleChecklistImportFile}
          mergeChecklistFromImport={mergeChecklistFromImport}
          replaceChecklistFromImport={replaceChecklistFromImport}
          setChecklistImportConflicts={setChecklistImportConflicts}
          setChecklistImportText={setChecklistImportText}
          t={t}
        />
      )}

      {importModalOpen && (
        <JsonImportModal
          handleImport={handleImport}
          handleTripImportFile={handleTripImportFile}
          importTextRef={importTextRef}
          onClose={() => setImportModalOpen(false)}
          t={t}
        />
      )}

      {pendingAssignment && (
        <AssignmentImpactModal
          language={language}
          onClose={() => setPendingAssignment(null)}
          onConfirm={confirmPendingAssignment}
          pendingAssignment={pendingAssignment}
          t={t}
          translateIssue={translateIssue}
          translateRiskTitle={translateRiskTitle}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;

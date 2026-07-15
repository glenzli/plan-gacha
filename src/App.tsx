import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { AiPlannerModal } from './components/AiPlannerModal';
import { ArchivedTripRows } from './components/ArchivedTripRows';
import { ArchivedTripModal } from './components/ArchivedTripModal';
import { AssignmentImpactModal } from './components/AssignmentImpactModal';
import { CandidateGroups } from './components/CandidateCards';
import { ChecklistImportModal } from './components/ChecklistImportModal';
import { ChecklistModal } from './components/ChecklistModal';
import { CurrentPlanCard } from './components/CurrentPlanCard';
import { DayReviewModal, type DayReviewTarget } from './components/DayReview';
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
import { useAiPromptController } from './hooks/useAiPromptController';
import { usePlanImageShare } from './hooks/usePlanImageShare';
import { usePlanCandidates } from './hooks/usePlanCandidates';
import { useJsonPayloadController } from './hooks/useJsonPayloadController';
import { useScheduleAssignmentController } from './hooks/useScheduleAssignmentController';
import { useToast } from './hooks/useToast';
import { useWeatherSync } from './hooks/useWeatherSync';
import {
  compactPlanForAi,
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
  buildChecklistRiskGroup,
  buildLodgingRiskGroup,
  buildRiskItems,
} from './domain/planning';
import {
  buildWeatherOverview,
} from './domain/weather';
import { buildRiskGroups } from './domain/risk';
import { addDays, getTodayId } from './domain/date';
import {
  findDayReview,
  getDayReviewKey,
  getDayReviewsForDate,
  type DayReviewRating,
  type DayReviewTag,
  type NormalizedDayReviews,
} from './domain/dayReview';
import {
  type BookingStatus,
  type NormalizedLocation,
  type NormalizedPlan,
  normalizePlan,
} from './domain/plan';
import {
  countBlacklistedPlanStops,
  findPlaceFeedbackEntry,
  getPlaceFeedbackKey,
  getStopOutcomeKey,
  isEmptyTripDraft,
  normalizeSchedule,
  normalizeTripLodgings,
  normalizeTripSnapshot,
  pruneEmptyTripDrafts,
  stripChecklistFromTripSnapshot,
  PlaceFeedbackStatus,
  ScheduleEntryStatus,
  StopOutcomeStatus,
  type NormalizedLodging,
  type NormalizedPlaceFeedback,
  type NormalizedSchedule,
  type NormalizedStopOutcomes,
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
} from './domain/display';
import {
  STORAGE_KEYS,
  loadInitialState,
} from './domain/appStorage';
import {
  evaluateWeather,
  getCalendarDayState,
  getDayInsight,
} from './domain/dayInsight';
import type { EditorTab, PlanRenderOptions, TranslateFn } from './types/ui';

const NEW_PLAN_EDITOR_ID = '__new_plan__';

type AiPlannerMode = 'replan' | 'generate';

interface TripDisplay {
  isEmpty: boolean;
  name: string;
  meta: string;
}

interface AppSnapshotInput {
  trips: unknown[];
  activeTripId?: string;
  checklistText?: unknown;
  checklist?: unknown;
  packingList?: unknown;
  checklistState?: unknown;
  checklistStatus?: unknown;
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
  const [plans, setPlans] = useState<unknown[]>(initial.plans);
  const [schedule, setSchedule] = useState<NormalizedSchedule>(initial.schedule);
  const [lodgings, setLodgings] = useState<NormalizedLodging[]>(initial.lodgings);
  const [placeFeedback, setPlaceFeedback] = useState<NormalizedPlaceFeedback>(initial.placeFeedback);
  const [stopOutcomes, setStopOutcomes] = useState<NormalizedStopOutcomes>(initial.stopOutcomes);
  const [dayReviews, setDayReviews] = useState<NormalizedDayReviews>(initial.dayReviews);
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
  const [dayReviewTarget, setDayReviewTarget] = useState<DayReviewTarget | null>(null);

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
    weatherLoading,
    weatherError,
    refreshWeather,
    clearWeatherError,
    clearWeatherData,
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
  const selectedDayAbandoned = selectedDateEntry?.status === ScheduleEntryStatus.Abandoned;
  const selectedDayReview = selectedDate && selectedPlan && !selectedDayAbandoned
    ? findDayReview(selectedDate.id, selectedPlan.id, dayReviews)
    : undefined;
  const canReviewSelectedDay = Boolean(
    selectedDate
    && selectedPlan
    && !selectedDayAbandoned
    && selectedDate.id <= getTodayId(),
  );
  const editedDayReview = dayReviewTarget
    ? findDayReview(dayReviewTarget.dateId, dayReviewTarget.planId, dayReviews)
    : undefined;
  const previousDayReviews = dayReviewTarget
    ? getDayReviewsForDate(dayReviewTarget.dateId, dayReviews)
      .filter((review) => review.planId !== dayReviewTarget.planId)
    : [];
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
  const {
    clearDay,
    confirmPendingAssignment,
    pendingAssignment,
    requestAssignPlan,
    selectNeighborDate,
    setPendingAssignment,
    toggleDayAbandoned,
  } = useScheduleAssignmentController({
    normalizedPlans,
    notify,
    plansById,
    riskItems,
    schedule,
    selectedIndex,
    setSchedule,
    setSelectedDateId,
    t,
    tripDates,
    weatherData,
  });

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
        .filter(([, entry]) => entry?.planId && entry.status !== ScheduleEntryStatus.Abandoned)
        .map(([dateId, entry]) => [entry.planId, dateId]),
    );
  }, [schedule]);
  const dayReviewHistory = useMemo(() => {
    const activeReviews = Object.values(dayReviews).map((review) => ({
      ...review,
      tripId: activeTripId,
      tripName: tripName || t('unnamedTrip'),
    }));
    const storedReviews = trips
      .filter((trip) => trip.id !== activeTripId)
      .flatMap((trip) => Object.values(trip.dayReviews || {}).map((review) => ({
        ...review,
        tripId: trip.id,
        tripName: trip.name,
      })));

    return [...activeReviews, ...storedReviews]
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .slice(0, 50);
  }, [activeTripId, dayReviews, t, tripName, trips]);

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
      placeFeedback,
      stopOutcomes,
      dayReviews,
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
    placeFeedback,
    stopOutcomes,
    dayReviews,
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
    placeFeedback,
    stopOutcomes,
    dayReviews,
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
    setPlaceFeedback(normalizedTrip.placeFeedback || {});
    setStopOutcomes(normalizedTrip.stopOutcomes || {});
    setDayReviews(normalizedTrip.dayReviews || {});
    setDayReviewTarget(null);
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

  const importAppSnapshot = (payload: unknown) => {
    const snapshot = payload as Partial<AppSnapshotInput> | null;
    if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.trips)) {
      throw new Error(t('driveInvalidSnapshot'));
    }

    const importedTrips = snapshot.trips
      .map((trip: unknown, index: number) => normalizeTripSnapshot(trip, index));
    if (!importedTrips.length) throw new Error(t('driveInvalidSnapshot'));

    const preferredTripId = snapshot.activeTripId || importedTrips[0].id;
    const visibleImportedTrips = importedTrips.filter((trip: NormalizedTripSnapshot) => !trip.archived);
    const activeTrip = visibleImportedTrips.find((trip: NormalizedTripSnapshot) => trip.id === preferredTripId)
      || visibleImportedTrips[0]
      || importedTrips.find((trip: NormalizedTripSnapshot) => trip.id === preferredTripId)
      || importedTrips[0];
    const nextTrips: NormalizedTripSnapshot[] = pruneEmptyTripDrafts(importedTrips, activeTrip.id);
    const nextActiveTrip = nextTrips.find((trip) => trip.id === activeTrip.id) || nextTrips[0];

    setTrips(nextTrips);
    applyTripSnapshot(nextActiveTrip);
    clearWeatherData();
    applyChecklistSnapshot(
      snapshot.checklistText ?? snapshot.checklist ?? snapshot.packingList,
      snapshot.checklistState || snapshot.checklistStatus || {},
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
    setPlaceFeedback(exampleTrip.placeFeedback || {});
    setStopOutcomes(exampleTrip.stopOutcomes || {});
    setDayReviews(exampleTrip.dayReviews || {});
    setDayReviewTarget(null);
    clearWeatherData();
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

  const {
    applyAiPlannerResult,
    applyPlanEditDraft,
    handleChecklistImportFile,
    handleExportChecklist,
    handleExportState,
    handleImport,
    handleTripImportFile,
  } = useJsonPayloadController({
    aiPlannerResultRef,
    checklistState,
    checklistText,
    closePlanEditor,
    dayReviews,
    editorPlanId,
    importTextRef,
    isCreatingPlan,
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
    invalidateWeatherCache: clearWeatherData,
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
  });

  const removePlan = (planId: string) => {
    const plan = plansById.get(planId);
    if (!plan || !window.confirm(t('deletePlanConfirm', { name: plan.name }))) return;

    setPlans((current) => current.filter((item, index) => normalizePlan(item, index, tripDates).id !== planId));
    setSchedule((current) => Object.fromEntries(
      Object.entries(current).filter(([, entry]) => entry?.planId !== planId),
    ));
    clearWeatherData();
    if (editorPlanId === planId) closePlanEditor();
    notify(t('planDeleted'));
  };

  const saveLodgings = (nextLodgings: unknown[]) => {
    setLodgings(normalizeTripLodgings(nextLodgings));
    clearWeatherData();
    notify(t('lodgingsSaved'));
  };

  const updatePlanBookingStatus = (planId: string, bookingId: string, nextStatus: BookingStatus) => {
    setPlans((current) => current.map((plan, index) => {
      const normalizedPlan = normalizePlan(plan, index, tripDates);
      if (normalizedPlan.id !== planId) return plan;
      const planRecord = plan && typeof plan === 'object' && !Array.isArray(plan)
        ? plan as Record<string, unknown>
        : normalizedPlan;

      return {
        ...planRecord,
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

  const togglePlaceBlacklist = (location: NormalizedLocation) => {
    const existingFeedback = findPlaceFeedbackEntry(location, placeFeedback);
    const key = existingFeedback?.key || getPlaceFeedbackKey(location);
    if (!key) return;

    const currentlyBlacklisted = existingFeedback?.status === PlaceFeedbackStatus.Blacklisted;
    setPlaceFeedback((current) => ({
      ...current,
      [key]: {
        key,
        label: location.label,
        address: location.address,
        status: currentlyBlacklisted ? PlaceFeedbackStatus.Allowed : PlaceFeedbackStatus.Blacklisted,
        updatedAt: new Date().toISOString(),
      },
    }));
    notify(currentlyBlacklisted ? t('placeBlacklistRemoved') : t('placeAddedToBlacklist'));
  };

  const toggleStopAbandoned = (dateId: string, planId: string, stopId: string, stopTitle: string) => {
    const key = getStopOutcomeKey(dateId, planId, stopId);
    const currentlyAbandoned = stopOutcomes[key]?.status === StopOutcomeStatus.Abandoned;
    setStopOutcomes((current) => ({
      ...current,
      [key]: {
        key,
        dateId,
        planId,
        stopId,
        stopTitle,
        status: currentlyAbandoned ? StopOutcomeStatus.Active : StopOutcomeStatus.Abandoned,
        updatedAt: new Date().toISOString(),
      },
    }));
    notify(currentlyAbandoned ? t('stopRestored') : t('stopMarkedAbandoned'));
  };

  const openSelectedDayReview = () => {
    if (!selectedDate || !selectedPlan || !canReviewSelectedDay) return;
    setDayReviewTarget({
      dateId: selectedDate.id,
      dateLabel: selectedDate.display,
      planId: selectedPlan.id,
      planName: selectedPlan.name,
    });
  };

  const saveDayReview = ({
    rating,
    tags,
    note,
  }: {
    rating: DayReviewRating;
    tags: DayReviewTag[];
    note: string;
  }) => {
    if (!dayReviewTarget) return;
    const key = getDayReviewKey(dayReviewTarget.dateId, dayReviewTarget.planId);
    setDayReviews((current) => ({
      ...current,
      [key]: {
        key,
        dateId: dayReviewTarget.dateId,
        planId: dayReviewTarget.planId,
        planName: dayReviewTarget.planName,
        rating,
        tags,
        note,
        updatedAt: new Date().toISOString(),
      },
    }));
    setDayReviewTarget(null);
    notify(t('dayReviewSaved'));
  };

  const {
    copyAiPlanningPrompt,
    copyBatchAiPrompt,
    copyPlanAiPrompt,
  } = useAiPromptController({
    aiGenerateText,
    aiPlannerMode,
    aiPlannerQuestionRef,
    copyText,
    editorPlan,
    hasInitializedPlans,
    isCreatingPlan,
    language,
    lodgings,
    normalizedPlans,
    placeFeedback,
    stopOutcomes,
    dayReviewHistory,
    planAssignments,
    plansById,
    riskGroups,
    schedule,
    selectedDate,
    startDateStr,
    t,
    tripDates,
    tripDays,
    tripName,
    weatherData,
  });

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

  const renderPlanStops = (plan: NormalizedPlan | null | undefined, options: PlanRenderOptions = {}) => plan ? (
    <PlanStops
      plan={plan}
      t={t}
      language={language}
      onCopyPlace={(copyValue) => copyText(copyValue, t('placeCopied'))}
      dateId={options.dateId}
      onToggleStopAbandoned={toggleStopAbandoned}
      onTogglePlaceBlacklist={togglePlaceBlacklist}
      placeFeedback={options.placeFeedback || placeFeedback}
      stopOutcomes={options.stopOutcomes || stopOutcomes}
      readOnly={options.readOnly}
    />
  ) : null;

  const renderPlanBookings = (plan: NormalizedPlan | null | undefined, options: PlanRenderOptions = {}) => plan ? (
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
      getBlacklistedStopCount={(plan) => countBlacklistedPlanStops(plan, placeFeedback)}
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
      currentCandidate={selectedDayAbandoned ? null : currentCandidate}
      planImageBusy={planImageBusy}
      shareCurrentPlanImage={shareCurrentPlanImage}
      openPlanEditor={openPlanEditor}
      clearDay={clearDay}
      isAbandoned={selectedDayAbandoned}
      toggleDayAbandoned={toggleDayAbandoned}
      canReviewDay={canReviewSelectedDay}
      dayReview={selectedDayReview}
      openDayReview={openSelectedDayReview}
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
        refreshWeather={refreshWeather}
        setTripMenuOpen={setTripMenuOpen}
        switchTrip={switchTrip}
        t={t}
        toggleLanguage={toggleLanguage}
        tripMenuDisabled={tripMenuDisabled}
        tripMenuOpen={tripMenuOpen}
        visibleTrips={visibleTrips}
        weatherLoading={weatherLoading}
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
            dayReviews={dayReviews}
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

      {dayReviewTarget && (
        <DayReviewModal
          key={`${dayReviewTarget.dateId}:${dayReviewTarget.planId}`}
          currentReview={editedDayReview}
          onClose={() => setDayReviewTarget(null)}
          onSave={saveDayReview}
          previousReviews={previousDayReviews}
          t={t}
          target={dayReviewTarget}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;

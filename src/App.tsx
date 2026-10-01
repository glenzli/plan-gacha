import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { AiPlannerModal } from './components/AiPlannerModal';
import { ArchiveLibraryModal } from './components/ArchiveLibraryModal';
import { ArchiveTripModal } from './components/ArchiveTripModal';
import { ArchivedTripRows } from './components/ArchivedTripRows';
import { ArchivedTripModal } from './components/ArchivedTripModal';
import { AssignmentImpactModal } from './components/AssignmentImpactModal';
import { ImportPreviewModal } from './components/ImportPreviewModal';
import { DayLodgingCard } from './components/LodgingPanel';
import { NO_LODGING, resolveNightLodging, resolveLodgingStops, nightLodgingLabel, getLodgingTasks, lodgingTaskLabel } from './domain/lodging';
import { CandidateGroups } from './components/CandidateCards';
import { ChecklistImportModal } from './components/ChecklistImportModal';
import { ChecklistModal } from './components/ChecklistModal';
import { CurrentPlanCard } from './components/CurrentPlanCard';
import { DayReviewModal, type DayReviewTarget } from './components/DayReview';
import { updateArchivedDayReview, updateArchivedTripSummary } from './domain/archivedTripEdits';
import { DriveSyncModal } from './components/DriveSyncModal';
import { DriveSyncPanel } from './components/DriveSyncPanel';
import { EmptyPlanState } from './components/EmptyPlanState';
import { JsonImportModal } from './components/JsonImportModal';
import { MainDayPanel } from './components/MainDayPanel';
import { MapSettingsModal } from './components/MapSettingsModal';
import {
  PlanBookings,
  PlanNotes,
  PlanStops,
} from './components/PlanContent';
import { SchedulePanel } from './components/SchedulePanel';
import { StatusPanel } from './components/StatusPanel';
import { TripHeader } from './components/TripHeader';
import { TripEditorModal } from './components/TripEditorModal';
import { useRetainedTextarea } from './hooks/useRetainedTextarea';
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
  createTripArchiveSummary,
  type TripArchiveSummary,
  type TripArchiveSummaryDraft,
} from './domain/tripArchive';
import {
  findNearestRelevantTrip,
  isTripEnded,
} from './domain/tripLifecycle';
import {
  APP_SCHEMA_VERSION,
  normalizeAppSnapshotForSync,
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
import { buildRiskGroups, type RiskActionTarget } from './domain/risk';
import { addDays, getTodayId } from './domain/date';
import { downloadBlob } from './domain/browserExport';
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
  STORAGE_ERROR_EVENT,
  writeStoredValue,
  loadInitialState,
} from './domain/appStorage';
import { loadMapPreferences, saveMapPreferences, type MapPreferences } from './domain/mapPreferences';
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
  const [storageWarning, setStorageWarning] = useState(initial.storageReadFailed);
  const recoveryBackupSaved = useRef(false);
  useEffect(() => {
    const showWarning = () => setStorageWarning(true);
    window.addEventListener(STORAGE_ERROR_EVENT, showWarning);
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, showWarning);
  }, []);
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
  const [archiveSummary, setArchiveSummary] = useState<TripArchiveSummary | null>(initial.archiveSummary);
  const [selectedDateId, setSelectedDateId] = useState(initial.selectedDate);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPlanId, setEditorPlanId] = useState<string | null>(null);
  const [editorInitialMode, setEditorInitialMode] = useState<'content' | 'constraints'>('content');
  const [editorInitialStopId, setEditorInitialStopId] = useState<string | undefined>();
  const [editorReturnTarget, setEditorReturnTarget] = useState<'list' | 'itinerary' | 'alternatives'>('list');
  const [mobileOverviewOpen, setMobileOverviewOpen] = useState(false);
  const [showingAlternatives, setShowingAlternatives] = useState(false);
  const [dayFocusRequest, setDayFocusRequest] = useState<{ dateId: string; section: 'heading' | 'bookings' | 'alternatives' } | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>('itinerary');
  const [batchAiOpen, setBatchAiOpen] = useState(false);
  const [aiPlannerOpen, setAiPlannerOpen] = useState(false);
  const [aiPlannerMode, setAiPlannerMode] = useState<AiPlannerMode>('replan');
  const [tripMenuOpen, setTripMenuOpen] = useState(false);
  const [mobileRisksOpen, setMobileRisksOpen] = useState(false);
  const [archiveLibraryOpen, setArchiveLibraryOpen] = useState(false);
  const [archivedViewTripId, setArchivedViewTripId] = useState<string | null>(null);
  const [archivedSummaryTripId, setArchivedSummaryTripId] = useState<string | null>(null);
  const [dayReviewTarget, setDayReviewTarget] = useState<DayReviewTarget | null>(null);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [mapSettingsOpen, setMapSettingsOpen] = useState(false);
  const [mapPreferences, setMapPreferences] = useState(loadMapPreferences);
  const [archivePromptIsAutomatic, setArchivePromptIsAutomatic] = useState(false);

  const dayTileRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const mainDayRef = useRef<HTMLElement | null>(null);
  const editorReturnFocusRef = useRef<HTMLElement | null>(null);
  const todayId = getTodayId();
  const { ref: aiPlannerQuestionRef, fieldRef: aiPlannerQuestionFieldRef, reset: clearAiQuestion } = useRetainedTextarea();
  const { ref: aiPlannerResultRef, fieldRef: aiPlannerResultFieldRef, reset: clearAiResult } = useRetainedTextarea();
  const importTextRef = useRef<HTMLTextAreaElement | null>(null);
  const lodgingSectionRef = useRef<HTMLDivElement | null>(null);
  const driveCallbacksRef = useRef<DriveSyncCallbacks | null>(null);
  const archivePromptedTripIdsRef = useRef(new Set<string>());
  const { toast, notify } = useToast();
  const t: TranslateFn = useMemo(() => (key, vars) => translate(key, language, vars), [language]);
  const {
    driveFeatureEnabled,
    driveStorage,
    driveStatus,
    driveBusy,
    driveError,
    driveOffline,
    driveConflict,
    drivePanelOpen,
    setDrivePanelOpen,
    driveAutoSync,
    setDriveAutoSync,
    loadDriveFile,
    mergeDriveFile,
    overwriteDriveFile,
    syncDrive,
    redetectDriveStorage,
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
  const hasActiveTrip = Boolean(activeTripId);
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
  const targetDayReviews = dayReviewTarget?.tripId
    ? trips.find((trip) => trip.id === dayReviewTarget.tripId && trip.archived)?.dayReviews || {}
    : dayReviews;
  const editedDayReview = dayReviewTarget
    ? findDayReview(dayReviewTarget.dateId, dayReviewTarget.planId, targetDayReviews)
    : undefined;
  const previousDayReviews = dayReviewTarget
    ? getDayReviewsForDate(dayReviewTarget.dateId, targetDayReviews)
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
    () => {
      const items = tripDates.filter((date) => date.id >= todayId).flatMap((date) =>
        getLodgingTasks(date.id, schedule, plansById, lodgings)
          .filter((task) => task.type !== 'missing')
          .map((task) => `D${date.dayNumber} · ${date.display} · ${lodgingTaskLabel(task, t)}`));
      return items.length ? { title: '住宿待处理', level: 'warning', items, unit: '项' }
        : buildLodgingRiskGroup(lodgings, hasInitializedPlans || scheduleHasEntries, t('lodgingMissingHelp'));
    },
    [hasInitializedPlans, lodgings, scheduleHasEntries, t, tripDates, schedule, plansById, todayId],
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
    setPendingAssignment,
    toggleDayAbandoned,
  } = useScheduleAssignmentController({
    normalizedPlans,
    lodgings,
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

  useEffect(() => {
    if (editorOpen || pendingAssignment || !dayFocusRequest || dayFocusRequest.dateId !== selectedDate?.id) return;
    const frame = window.requestAnimationFrame(() => {
      const target = mainDayRef.current?.querySelector<HTMLElement>(`[data-day-${dayFocusRequest.section}]`);
      target?.scrollIntoView({ block: 'start', behavior: 'auto' });
      target?.focus({ preventScroll: true });
      setDayFocusRequest(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dayFocusRequest, selectedDate?.id, showingAlternatives, editorOpen, pendingAssignment]);

  const visibleTrips = useMemo(
    () => pruneEmptyTripDrafts(trips, activeTripId).filter((trip) => !trip.archived),
    [activeTripId, trips],
  );
  const archivedTrips = useMemo(() => trips.filter((trip) => trip.archived), [trips]);
  const archivedViewTrip = useMemo(
    () => archivedTrips.find((trip) => trip.id === archivedViewTripId) || null,
    [archivedTrips, archivedViewTripId],
  );
  const archivedSummaryTrip = archivedTrips.find((trip) => trip.id === archivedSummaryTripId) || null;
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
      archiveSummary,
      checklistText: '',
      checklistState: {},
      archived: activeTripArchived,
    };
    const persistedTrips = pruneEmptyTripDrafts(
      hasActiveTrip
        ? trips.map((trip) => (trip.id === activeTripId ? currentTrip : trip))
        : trips,
      hasActiveTrip ? activeTripId : undefined,
    ).map(stripChecklistFromTripSnapshot);

    // Preserve unreadable/future-format bytes before the initial empty state
    // can replace them. If saving the backup fails, leave the original intact.
    if (initial.recoveryData && !recoveryBackupSaved.current) {
      if (!writeStoredValue(STORAGE_KEYS.recoveryBackup, initial.recoveryData)) return;
      recoveryBackupSaved.current = true;
    }
    writeStoredValue(STORAGE_KEYS.schemaVersion, APP_SCHEMA_VERSION);
    writeStoredValue(STORAGE_KEYS.trips, JSON.stringify(persistedTrips));
    if (hasActiveTrip) {
      writeStoredValue(STORAGE_KEYS.currentTrip, activeTripId);
    } else {
      writeStoredValue(STORAGE_KEYS.currentTrip, null);
    }
  }, [
    activeTripId,
    activeTripArchived,
    archiveSummary,
    hasActiveTrip,
    initial.recoveryData,
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
    archiveSummary,
    checklistText: '',
    checklistState: {},
    archived: activeTripArchived,
  });

  const applyTripSnapshot = (trip: unknown) => {
    resetAiPlannerFields();
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
    setArchiveSummary(normalizedTrip.archiveSummary);
    setDayReviewTarget(null);
    setSelectedDateId(getSmartSelectedDate(normalizedTrip.startDateStr, normalizedTrip.tripDays));
    setMobileOverviewOpen(false);
    setShowingAlternatives(false);
    setDayFocusRequest(null);
    clearWeatherError();
  };

  const showCurrentStageEmpty = () => {
    resetAiPlannerFields();
    const emptyTrip = normalizeTripSnapshot(
      createEmptyTripSnapshot(
        language === 'en' ? 'New trip' : '新旅行计划',
        getTodayId(),
        'trip-current-stage-empty',
      ),
    );
    setActiveTripId('');
    setTripName(emptyTrip.name);
    setStartDateStr(emptyTrip.startDateStr);
    setTripDays(emptyTrip.tripDays);
    setPlans([]);
    setSchedule({});
    setLodgings([]);
    setPlaceFeedback({});
    setStopOutcomes({});
    setDayReviews({});
    setArchiveSummary(null);
    setDayReviewTarget(null);
    setSelectedDateId(emptyTrip.startDateStr);
    clearWeatherError();
  };

  const ensureActiveTrip = () => {
    if (hasActiveTrip) return;
    const nextTrip = normalizeTripSnapshot(createEmptyTripSnapshot(
      language === 'en' ? `Trip ${trips.length + 1}` : `旅行计划 ${trips.length + 1}`,
      startDateStr || getTodayId(),
    ));
    setTrips((current) => [...pruneEmptyTripDrafts(current), nextTrip]);
    applyTripSnapshot(nextTrip);
  };

  const saveCurrentTripInto = (tripList: NormalizedTripSnapshot[]): NormalizedTripSnapshot[] => {
    if (!hasActiveTrip) return tripList;
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
    clearAiQuestion();
    clearAiResult();
  };

  const importAppSnapshot = (payload: unknown) => {
    const snapshot = normalizeAppSnapshotForSync(payload, language, 'remote');
    const importedTrips = snapshot.trips
      .map((trip: unknown, index: number) => normalizeTripSnapshot(trip, index));

    const nextTrips: NormalizedTripSnapshot[] = pruneEmptyTripDrafts(importedTrips);
    const nextActiveTrip = findNearestRelevantTrip(nextTrips, getTodayId());

    setTrips(nextTrips);
    if (nextActiveTrip) {
      applyTripSnapshot(nextActiveTrip);
    } else {
      showCurrentStageEmpty();
    }
    clearWeatherData();
    applyChecklistSnapshot(
      snapshot.checklistText,
      snapshot.checklistState,
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
    setAiPlannerMode('generate');
    setEditorPlanId(null);
    if (!hasActiveTrip) {
      const nextTrip = normalizeTripSnapshot(createEmptyTripSnapshot(
        language === 'en' ? `Trip ${trips.length + 1}` : `旅行计划 ${trips.length + 1}`,
        getTodayId(),
      ));
      setTrips((current) => [...pruneEmptyTripDrafts(current), nextTrip]);
      applyTripSnapshot(nextTrip);
      startUiTransition(() => {
        setTripMenuOpen(false);
        setEditorTab('itinerary');
        setEditorOpen(true);
        setBatchAiOpen(true);
      });
      notify(t('newTripCreated'));
      return;
    }

    if (!hasInitializedPlans) {
      startUiTransition(() => {
        setTripMenuOpen(false);
        setEditorTab('itinerary');
        setEditorOpen(true);
        setBatchAiOpen(true);
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
      setBatchAiOpen(true);
    });
    notify(t('newTripCreated'));
  };

  const loadExampleTrip = () => {
    const hasCurrentContent = normalizedPlans.length > 0 || lodgings.length > 0 || Object.keys(schedule).length > 0;
    if (hasCurrentContent && !window.confirm(t('overwriteExampleConfirm'))) return;

    const exampleTrip = normalizeTripSnapshot(createExampleTripSnapshot(
      t('exampleTripName'),
      startDateStr,
      activeTripId || undefined,
    ));
    if (!hasActiveTrip) {
      setTrips((current) => [...pruneEmptyTripDrafts(current), exampleTrip]);
      applyTripSnapshot(exampleTrip);
    }
    setTripName(exampleTrip.name);
    setTripDays(exampleTrip.tripDays);
    setPlans(exampleTrip.plans);
    setSchedule(exampleTrip.schedule);
    setLodgings(exampleTrip.lodgings || []);
    setPlaceFeedback(exampleTrip.placeFeedback || {});
    setStopOutcomes(exampleTrip.stopOutcomes || {});
    setDayReviews(exampleTrip.dayReviews || {});
    setArchiveSummary(null);
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
  };

  const openAiPlanner = (mode: AiPlannerMode = 'replan') => {
    if (mode === 'generate' || !hasInitializedPlans) {
      openBatchAiGenerator();
      return;
    }

    startUiTransition(() => {
      setAiPlannerMode('replan');
      setEditorOpen(false);
      setAiPlannerOpen(true);
    });
  };

  const openPlanEditor = (planId: string = NEW_PLAN_EDITOR_ID, initialMode: 'content' | 'constraints' = 'content', stopId?: string) => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    editorReturnFocusRef.current = trigger?.closest('.stop-more-menu')?.querySelector('summary') || trigger;
    setEditorReturnTarget(editorOpen ? 'list' : showingAlternatives ? 'alternatives' : 'itinerary');
    setEditorInitialStopId(stopId);
    setEditorInitialMode(initialMode);
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
    setEditorInitialStopId(undefined);
    if (editorReturnTarget !== 'list') setEditorOpen(false);
    restoreEditorFocus();
  };

  const restoreEditorFocus = () => {
    window.requestAnimationFrame(() => {
      const trigger = editorReturnFocusRef.current;
      if (trigger?.isConnected && trigger.getClientRects().length) trigger.focus({ preventScroll: true });
    });
  };

  const closeTripEditor = () => {
    setEditorOpen(false);
    restoreEditorFocus();
  };

  const {
    applyAiPlannerResult,
    pendingImport,
    confirmImport,
    cancelImportPreview,
    applyPlanEditDraft,
    parseSinglePlanDraft,
    handleChecklistImportFile,
    handleExportChecklist,
    handleExportState,
    handleImport,
    handleTripImportFile,
  } = useJsonPayloadController({
    aiPlannerResultRef,
    planningFrom: selectedDate?.id || startDateStr,
    aiPlannerMode,
    archiveSummary,
    checklistState,
    checklistText,
    closePlanEditor,
    dayReviews,
    editorPlanId,
    importTextRef,
    isCreatingPlan,
    ensureActiveTrip,
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
    const nextTrip = findNearestRelevantTrip(tripsWithContent, getTodayId());

    setTrips(tripsWithContent);
    if (nextTrip) {
      applyTripSnapshot(nextTrip);
    } else {
      showCurrentStageEmpty();
    }
    setEditorOpen(false);
    notify(message);
  };

  const requestArchiveCurrentTrip = (automatic = false) => {
    if (!hasActiveTrip) return;
    setArchivePromptIsAutomatic(automatic);
    setArchiveModalOpen(true);
    setEditorOpen(false);
  };

  const archiveCurrentTrip = (draft: TripArchiveSummaryDraft) => {
    const archivedTrip = {
      ...getCurrentTripSnapshot(),
      archiveSummary: createTripArchiveSummary({
        ...draft,
        archivedAt: archiveSummary?.archivedAt || draft.archivedAt,
      }),
      archived: true,
    };
    const updatedTrips = trips.map((trip) => (trip.id === activeTripId ? archivedTrip : trip));
    setArchiveModalOpen(false);
    applyTripListAfterCurrentRemoved(updatedTrips, t('tripArchived'));
  };

  const saveArchivedSummary = (draft: TripArchiveSummaryDraft) => {
    if (!archivedSummaryTrip) return;
    setTrips((current) => updateArchivedTripSummary(current, archivedSummaryTrip.id, draft));
    setArchivedSummaryTripId(null);
    notify(t('tripSummarySaved'));
  };

  useEffect(() => {
    if (
      !hasActiveTrip
      || activeTripArchived
      || !isTripEnded({ startDateStr, tripDays }, getTodayId())
      || archivePromptedTripIdsRef.current.has(activeTripId)
    ) return;

    archivePromptedTripIdsRef.current.add(activeTripId);
    setArchivePromptIsAutomatic(true);
    setArchiveModalOpen(true);
  }, [activeTripArchived, activeTripId, hasActiveTrip, startDateStr, tripDays]);

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
    setArchiveLibraryOpen(false);
    setArchivedViewTripId(null);
    notify(t('archivedRestored'));
  };

  const selectScheduleDate = (dateId: string) => {
    setSelectedDateId(dateId);
    setMobileOverviewOpen(false);
    setMobileRisksOpen(false);
    setShowingAlternatives(false);
    setDayFocusRequest({ dateId, section: 'heading' });
  };

  const showDayAlternatives = () => {
    if (!selectedDate) return;
    setShowingAlternatives(true);
    setDayFocusRequest({ dateId: selectedDate.id, section: 'heading' });
  };

  const openRisk = (target: RiskActionTarget) => {
    if (!plansById.has(target.planId)) return;
    if (target.dateId) selectScheduleDate(target.dateId);
    if (target.section === 'constraints' || !target.dateId) {
      setDayFocusRequest(null);
      openPlanEditor(target.planId, 'constraints');
    } else {
      setShowingAlternatives(target.section === 'alternatives');
      setDayFocusRequest({ dateId: target.dateId, section: target.section === 'alternatives' ? 'heading' : 'bookings' });
    }
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
    if (dayReviewTarget.tripId) {
      const tripId = dayReviewTarget.tripId;
      setTrips((current) => updateArchivedDayReview(current, tripId, {
        dateId: dayReviewTarget.dateId,
        planId: dayReviewTarget.planId,
        planName: dayReviewTarget.planName,
        rating,
        tags,
        note,
      }));
    } else {
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
    }
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
        driveError={driveError}
        driveOffline={driveOffline}
        driveConflict={driveConflict}
        driveAutoSync={driveAutoSync}
        setDriveAutoSync={setDriveAutoSync}
        loadDriveFile={loadDriveFile}
        mergeDriveFile={mergeDriveFile}
        overwriteDriveFile={overwriteDriveFile}
        syncDrive={syncDrive}
        redetectDriveStorage={redetectDriveStorage}
        exportLocalBackup={() => {
          try {
            downloadBlob(new Blob([JSON.stringify(exportAppSnapshot(), null, 2)], { type: 'application/json;charset=utf-8' }), 'plan-gacha-workspace.json');
            notify(t('jsonDownloaded'));
          } catch { notify(t('downloadFailed')); }
        }}
        reloadSite={() => {
          try { window.parent.location.reload(); } catch { window.location.reload(); }
        }}
        t={t}
        language={language}
      />
    );
  };

  const renderPlanStops = (plan: NormalizedPlan | null | undefined, options: PlanRenderOptions = {}) => plan ? (
    <PlanStops
      plan={options.dateId && !options.readOnly ? resolveLodgingStops(plan, options.dateId,
        { ...schedule, [options.dateId]: { ...(schedule[options.dateId]?.planId === plan.id || schedule[options.dateId]?.lodgingLocked ? schedule[options.dateId] : {}), planId: plan.id } }, plansById, lodgings) : plan}
      t={t}
      language={language}
      mapPreferences={mapPreferences}
      onCopyPlace={(copyValue) => copyText(copyValue, t('placeCopied'))}
      dateId={options.dateId}
      onToggleStopAbandoned={toggleStopAbandoned}
      onTogglePlaceBlacklist={togglePlaceBlacklist}
      onEditStop={(planId, stopId) => openPlanEditor(planId, 'content', stopId)}
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
      key={`${activeTripId}-${selectedDate?.id}`}
      candidateGroups={candidateGroups}
      gridClassName={gridClassName}
      t={t}
      language={language}
      tripDates={tripDates}
      selectedDate={selectedDate}
      requestAssignPlan={(dateId, planId) => {
        if (requestAssignPlan(dateId, planId)) selectScheduleDate(dateId);
      }}
      openPlanEditor={openPlanEditor}
      getPriorityLabel={getPriorityLabel}
      getPlanBookingBadge={getPlanBookingBadge}
      getBlacklistedStopCount={(plan) => countBlacklistedPlanStops(plan, placeFeedback)}
      getLodgingLabel={(plan) => {
        if (!selectedDate) return '';
        const night = resolveNightLodging(selectedDate.id, { ...schedule, [selectedDate.id]: { ...(schedule[selectedDate.id]?.lodgingLocked ? schedule[selectedDate.id] : {}), planId: plan.id } }, plansById, lodgings);
        return night.status === 'missing' ? '' : nightLodgingLabel(night, t);
      }}
      renderPlanStops={renderPlanStops}
      renderPlanBookings={renderPlanBookings}
      renderPlanNotes={renderPlanNotes}
    />
  );

  const renderCurrentPlanCard = (className: string) => (
    <CurrentPlanCard
      availableCandidateCount={availableCandidateCount}
      onShowAlternatives={showDayAlternatives}
      className={className}
      lodgingContent={selectedDate && <DayLodgingCard key={selectedDate.id} dateId={selectedDate.id} schedule={schedule} plans={plansById} lodgings={lodgings} mapPreferences={mapPreferences} t={t}
        onChoose={(id) => setSchedule((current) => {
          const entry = { ...current[selectedDate.id], planId: current[selectedDate.id]?.planId || '' };
          if (id) entry.lodgingId = id;
          else { delete entry.lodgingId; delete entry.lodgingLocked; }
          return { ...current, [selectedDate.id]: entry };
        })}
        onLock={(locked) => setSchedule((current) => {
          const night = resolveNightLodging(selectedDate.id, current, plansById, lodgings);
          return { ...current, [selectedDate.id]: { ...current[selectedDate.id], planId: current[selectedDate.id]?.planId || '', lodgingId: night.selected?.id || NO_LODGING, lodgingLocked: locked } };
        })}
        onBooked={(id) => setLodgings((current) => current.map((hotel) => hotel.id === id ? { ...hotel, reservations: [...(hotel.reservations || []), { id: `reservation-${Date.now()}`, checkIn: selectedDate.id, checkOut: addDays(selectedDate.id, 1), status: 'booked', cancelBy: '', cancelUrl: '', note: '' }] } : hotel))}
        onManage={openLodgingEditor}
      />}
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
      currentStageEmpty={!hasActiveTrip}
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

  const changeTripRange = (nextStartDate: string, nextTripDays: number) => {
    const nextEndDate = addDays(nextStartDate, nextTripDays - 1);
    const removed = Object.entries(schedule).filter(([date]) => date < nextStartDate || date > nextEndDate);
    if (removed.length && !window.confirm(t('tripRangeChangeConfirm', {
      dates: removed.map(([date, entry]) => `${date} · ${plansById.get(entry.planId)?.name || t('tonightLodging')}`).join('\n'),
    }))) return;
    if (removed.length) setSchedule(Object.fromEntries(Object.entries(schedule).filter(([date]) => date >= nextStartDate && date <= nextEndDate)));
    setStartDateStr(nextStartDate);
    setTripDays(nextTripDays);
    setSelectedDateId(getSmartSelectedDate(nextStartDate, nextTripDays));
  };

  const changeEditorStartDate = (nextStartDate: string) => {
    if (!nextStartDate) return;
    changeTripRange(nextStartDate, tripDays);
  };

  const changeEditorEndDate = (nextEndDate: string) => {
    if (!nextEndDate) return;
    const nextTripDays = getInclusiveDateSpan(startDateStr, nextEndDate);
    changeTripRange(startDateStr, nextTripDays);
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

  const activeTripDisplay = hasActiveTrip
    ? getTripDisplay(activeTripOption || {}, true)
    : { isEmpty: true, name: t('currentStageNoPlan'), meta: '' };
  const tripMenuDisabled = visibleTrips.length === 0;

  return (
    <div className="app-shell">
      <TripHeader
        activeTripDisplay={activeTripDisplay}
        activeTripId={activeTripId}
        archivedTripCount={archivedTrips.length}
        createNewTrip={createNewTrip}
        driveFeatureEnabled={driveFeatureEnabled}
        getTripDisplay={getTripDisplay}
        hasInitializedPlans={hasInitializedPlans}
        onArchiveTrip={() => requestArchiveCurrentTrip(false)}
        onOpenArchiveLibrary={() => {
          setTripMenuOpen(false);
          setArchiveLibraryOpen(true);
        }}
        onOpenDriveSync={() => startUiTransition(() => setDrivePanelOpen(true))}
        onOpenMapSettings={() => {
          setTripMenuOpen(false);
          setMapSettingsOpen(true);
        }}
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

      {storageWarning && <div className="storage-warning" role="alert">{t('storageSaveFailed')}</div>}
      {initial.recoveryData && <div className="storage-warning" role="alert">
        <span>{t('storageRecoveryHelp')}</span>{' '}
        <button className="btn btn-small btn-outline" type="button" onClick={() => downloadBlob(
          new Blob([initial.recoveryData!], { type: 'application/json;charset=utf-8' }), 'plan-gacha-recovery.json',
        )}>{t('exportRecoveryBackup')}</button>
      </div>}

      {hasInitializedPlans ? (
        <main className="app-layout">
          <SchedulePanel
            mobileOverviewOpen={mobileOverviewOpen}
            onToggleOverview={() => setMobileOverviewOpen((open) => !open)}
            todayId={todayId}
            onOpenRisk={openRisk}
            onOpenChecklist={openChecklist}
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
            riskGroups={riskGroups}
            schedule={schedule}
            dayReviews={dayReviews}
            selectScheduleDate={selectScheduleDate}
            selectedDate={selectedDate}
            t={t}
            translateRiskTitle={translateRiskTitle}
            tripDates={tripDates}
            weatherData={weatherData}
            weatherError={weatherError}
            weatherLoading={weatherLoading}
            refreshWeather={refreshWeather}
          />

          <MainDayPanel
            panelRef={mainDayRef}
            todayId={todayId}
            canReturnToToday={tripDates.some((date) => date.id === todayId)}
            onReturnToToday={() => selectScheduleDate(todayId)}
            showingAlternatives={showingAlternatives}
            onReturnToItinerary={() => selectedDate && selectScheduleDate(selectedDate.id)}
            mobileOverviewOpen={mobileOverviewOpen}
            availableCandidateCount={availableCandidateCount}
            renderCandidateGroups={renderCandidateGroups}
            renderCurrentPlanCard={renderCurrentPlanCard}
            selectNeighborDate={(step) => { const date = tripDates[selectedIndex + step]; if (date) selectScheduleDate(date.id); }}
            selectedDate={selectedDate}
            selectedIndex={selectedIndex}
            t={t}
            tripDates={tripDates}
          />

          <StatusPanel
            onOpenRisk={openRisk}
            onOpenChecklist={openChecklist}
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
          aiPlannerQuestionRef={aiPlannerQuestionFieldRef}
          aiPlannerResultRef={aiPlannerResultFieldRef}
          aiReplanText={aiReplanText}
          applyAiPlannerResult={applyAiPlannerResult}
          copyAiPlanningPrompt={copyAiPlanningPrompt}
          onClose={() => setAiPlannerOpen(false)}
          t={t}
        />
      )}

      {editorOpen && (
        <TripEditorModal
          editorInitialMode={editorInitialMode}
          editorInitialStopId={editorInitialStopId}
          editorBackLabel={t(editorReturnTarget === 'list' ? 'backToList' : editorReturnTarget === 'alternatives' ? 'backToAlternatives' : 'backToItinerary')}
          activeTripId={activeTripId}
          aiGenerateText={aiGenerateText}
          aiPlannerQuestionRef={aiPlannerQuestionFieldRef}
          aiPlannerResultRef={aiPlannerResultFieldRef}
          applyAiPlannerResult={applyAiPlannerResult}
          applyPlanEditDraft={applyPlanEditDraft}
          archiveCurrentTrip={() => requestArchiveCurrentTrip(false)}
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
          mapPreferences={mapPreferences}
          normalizedPlans={normalizedPlans}
          onChangeEndDate={changeEditorEndDate}
          onChangeStartDate={changeEditorStartDate}
          onClose={closeTripEditor}
          onCommitTripName={setTripName}
          onOpenImport={openImportModal}
          onOpenPlanEditor={openPlanEditor}
          onRemovePlan={removePlan}
          onSaveLodgings={saveLodgings}
          parsePlanDraft={parseSinglePlanDraft}
          onSelectTab={selectEditorTab}
          onToggleBatchAi={toggleBatchAiPanel}
          planAssignments={planAssignments}
          renderArchivedTripRows={renderArchivedTripRows}
          renderPlanBookings={renderPlanBookings}
          renderPlanNotes={renderPlanNotes}
          renderPlanStops={renderPlanStops}
          schedule={schedule}
          startDateStr={startDateStr}
          t={t}
          tripDays={tripDays}
          tripDates={tripDates}
          tripName={tripName}
          weatherData={weatherData}
        />
      )}

      {driveFeatureEnabled && drivePanelOpen && (
        <DriveSyncModal
          onClose={() => setDrivePanelOpen(false)}
          renderDriveSyncPanel={renderDriveSyncPanel}
          t={t}
        />
      )}

      {mapSettingsOpen && (
        <MapSettingsModal
          preferences={mapPreferences}
          onChange={(provider: MapPreferences['mainlandChina']) => {
            const next = { ...mapPreferences, mainlandChina: provider };
            if (saveMapPreferences(next)) setMapPreferences(next);
            else notify(t('mapSettingsSaveFailed'));
          }}
          onClose={() => setMapSettingsOpen(false)}
          t={t}
        />
      )}

      {checklistOpen && (
        <ChecklistModal
          checklistEditing={checklistEditing}
          checklistGroups={checklistGroups}
          checklistState={checklistState}
          checklistStats={checklistStats}
          checklistText={checklistText}
          language={language}
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

      {archiveLibraryOpen && archivedTrips.length > 0 && (
        <ArchiveLibraryModal
          archivedTrips={archivedTrips}
          formatTripRange={formatTripRange}
          language={language}
          onClose={() => setArchiveLibraryOpen(false)}
          onRestore={restoreArchivedTrip}
          onView={setArchivedViewTripId}
          t={t}
        />
      )}

      {archivedViewTrip && (
        <ArchivedTripModal
          evaluateWeather={evaluateWeather}
          formatTripRange={formatTripRange}
          getPriorityLabel={getPriorityLabel}
          language={language}
          onClose={() => setArchivedViewTripId(null)}
          onEditSummary={setArchivedSummaryTripId}
          onEditDayReview={setDayReviewTarget}
          renderPlanBookings={renderPlanBookings}
          renderPlanNotes={renderPlanNotes}
          renderPlanStops={renderPlanStops}
          t={t}
          trip={archivedViewTrip}
          weatherData={weatherData}
        />
      )}

      {archiveModalOpen && hasActiveTrip && (
        <ArchiveTripModal
          key={activeTripId}
          endedPrompt={archivePromptIsAutomatic}
          initialSummary={archiveSummary}
          onClose={() => setArchiveModalOpen(false)}
          onSubmit={archiveCurrentTrip}
          t={t}
          tripName={tripName || t('unnamedTrip')}
        />
      )}

      {archivedSummaryTrip && (
        <ArchiveTripModal
          key={archivedSummaryTrip.id}
          editing
          endedPrompt={false}
          initialSummary={archivedSummaryTrip.archiveSummary}
          onClose={() => setArchivedSummaryTripId(null)}
          onSubmit={saveArchivedSummary}
          t={t}
          tripName={archivedSummaryTrip.name}
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
          onConfirm={() => { const dateId = pendingAssignment.dateId; confirmPendingAssignment(); selectScheduleDate(dateId); }}
          pendingAssignment={pendingAssignment}
          t={t}
          translateIssue={translateIssue}
          translateRiskTitle={translateRiskTitle}
        />
      )}
      {pendingImport && <ImportPreviewModal preview={pendingImport.preview} warnings={Array.isArray(pendingImport.parsed.warnings) ? pendingImport.parsed.warnings.map(String) : []} t={t} onClose={cancelImportPreview} onConfirm={confirmImport} />}

      {dayReviewTarget && (
        <DayReviewModal
          key={`${dayReviewTarget.tripId || 'active'}:${dayReviewTarget.dateId}:${dayReviewTarget.planId}`}
          currentReview={editedDayReview}
          onClose={() => setDayReviewTarget(null)}
          onSave={saveDayReview}
          previousReviews={previousDayReviews}
          t={t}
          target={dayReviewTarget}
        />
      )}

      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  );
}

export default App;

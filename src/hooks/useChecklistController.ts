// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from 'react';
import { STORAGE_KEYS } from '../domain/appStorage';
import {
  CHECKLIST_STATUS,
  EXAMPLE_CHECKLIST_TEXT,
  getChecklistStats,
  mergeChecklistPayload,
  normalizeChecklistText,
  parseChecklistImportPayload,
  parseChecklistText,
  reconcileChecklistStateForGroups,
} from '../domain/checklist';

export function useChecklistController({
  initialChecklistState,
  initialChecklistText,
  language,
  notify,
  startUiTransition,
  t,
}) {
  const [checklistText, setChecklistText] = useState(initialChecklistText);
  const [checklistState, setChecklistState] = useState(initialChecklistState);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistEditing, setChecklistEditing] = useState(false);
  const [checklistImportOpen, setChecklistImportOpen] = useState(false);
  const [checklistImportText, setChecklistImportText] = useState('');
  const [checklistImportConflicts, setChecklistImportConflicts] = useState([]);
  const checklistDraftRef = useRef(null);

  const checklistGroups = useMemo(
    () => parseChecklistText(checklistText, language),
    [checklistText, language],
  );
  const checklistStats = useMemo(
    () => getChecklistStats(checklistGroups, checklistState),
    [checklistGroups, checklistState],
  );
  const reconciledChecklistState = useMemo(
    () => reconcileChecklistStateForGroups(checklistState, checklistGroups),
    [checklistGroups, checklistState],
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.checklistText, checklistText);
    localStorage.setItem(STORAGE_KEYS.checklistState, JSON.stringify(checklistState));
  }, [checklistState, checklistText]);

  const openChecklist = () => {
    startUiTransition(() => {
      setChecklistEditing(false);
      setChecklistOpen(true);
    });
  };

  const updateChecklistItemStatus = (itemId, nextStatus) => {
    setChecklistState((current) => {
      const next = { ...current };
      if (nextStatus === CHECKLIST_STATUS.todo) {
        delete next[itemId];
      } else {
        next[itemId] = nextStatus;
      }
      return next;
    });
  };

  const toggleChecklistDone = (itemId) => {
    const currentStatus = checklistState[itemId] || CHECKLIST_STATUS.todo;
    updateChecklistItemStatus(
      itemId,
      currentStatus === CHECKLIST_STATUS.done ? CHECKLIST_STATUS.todo : CHECKLIST_STATUS.done,
    );
  };

  const toggleChecklistSkipped = (itemId) => {
    const currentStatus = checklistState[itemId] || CHECKLIST_STATUS.todo;
    updateChecklistItemStatus(
      itemId,
      currentStatus === CHECKLIST_STATUS.skipped ? CHECKLIST_STATUS.todo : CHECKLIST_STATUS.skipped,
    );
  };

  const saveChecklistText = () => {
    const nextChecklistText = normalizeChecklistText(checklistDraftRef.current?.value ?? checklistText);
    const nextGroups = parseChecklistText(nextChecklistText, language);

    setChecklistText(nextChecklistText);
    setChecklistState((current) => reconcileChecklistStateForGroups(current, nextGroups));
    setChecklistEditing(false);
    notify(t('checklistSaved'));
  };

  const loadChecklistExample = () => {
    const nextChecklistText = normalizeChecklistText(EXAMPLE_CHECKLIST_TEXT);
    setChecklistText(nextChecklistText);
    setChecklistState({});
    setChecklistEditing(false);
    notify(t('checklistExampleLoaded'));
  };

  const resetChecklistState = () => {
    setChecklistState({});
    notify(t('checklistStateReset'));
  };

  const openChecklistImport = () => {
    startUiTransition(() => {
      setChecklistImportText('');
      setChecklistImportConflicts([]);
      setChecklistImportOpen(true);
    });
  };

  const closeChecklistImport = () => {
    startUiTransition(() => {
      setChecklistImportOpen(false);
      setChecklistImportConflicts([]);
    });
  };

  const getChecklistImportPayload = () => parseChecklistImportPayload(checklistImportText, language);

  const replaceChecklistFromImport = () => {
    try {
      const payload = getChecklistImportPayload();
      setChecklistText(payload.checklistText);
      setChecklistState(payload.checklistState);
      setChecklistEditing(false);
      setChecklistImportText('');
      closeChecklistImport();
      notify(t('checklistImported'));
    } catch (error) {
      notify(t('importFailed', { message: error.message }));
    }
  };

  const mergeChecklistFromImport = () => {
    try {
      const payload = getChecklistImportPayload();
      const merged = mergeChecklistPayload(
        checklistText,
        checklistState,
        payload.checklistText,
        payload.checklistState,
        language,
      );

      setChecklistText(merged.checklistText);
      setChecklistState(merged.checklistState);
      setChecklistEditing(false);
      setChecklistImportConflicts(merged.conflicts);

      if (merged.conflicts.length) {
        notify(t('checklistMergeConflicts', { count: merged.conflicts.length }));
      } else {
        setChecklistImportText('');
        closeChecklistImport();
        notify(t('checklistMerged'));
      }
    } catch (error) {
      notify(t('importFailed', { message: error.message }));
    }
  };

  const getChecklistStatusLabel = (status) => {
    if (status === CHECKLIST_STATUS.done) return t('checklistDone');
    if (status === CHECKLIST_STATUS.skipped) return t('checklistNotNeeded');
    return t('checklistTodo');
  };

  const getChecklistConflictLabel = (type) => {
    if (type === 'category') return t('checklistConflictCategory');
    if (type === 'status') return t('checklistConflictStatus');
    return t('checklistConflictDuplicate');
  };

  const applyChecklistSnapshot = (text, state) => {
    const nextChecklistText = normalizeChecklistText(text, '');
    const nextChecklistGroups = parseChecklistText(nextChecklistText, language);

    setChecklistText(nextChecklistText);
    setChecklistState(reconcileChecklistStateForGroups(state || {}, nextChecklistGroups));
    setChecklistEditing(false);
    setChecklistImportOpen(false);
    setChecklistImportConflicts([]);
  };

  return {
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
  };
}

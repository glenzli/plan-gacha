import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPlanGachaDriveStorage, hasStoredDriveStorageFile } from '../driveStorageAdapter';
import { STORAGE_KEYS, readStoredValue, writeStoredValue } from '../domain/appStorage';
import {
  mergeAppSnapshots,
  normalizeAppSnapshotForSync,
  remoteSnapshotMatchesLocal,
  type AppSnapshot,
} from '../domain/sync';
import type {
  DriveStorageStatus,
  PlanGachaDriveStorage,
} from '../types/driveStorage';
import type { TranslateFn } from '../types/ui';

const DRIVE_AUTO_SYNC_MS = 5 * 60 * 1000;
const DRIVE_STORAGE_EXPOSURE = normalizeDriveStorageExposure(
  import.meta.env.VITE_DRIVE_STORAGE_EXPOSURE || 'url',
);

export interface DriveSyncCallbacks {
  exportAppSnapshot: () => AppSnapshot;
  importAppSnapshot: (payload: unknown) => void;
  isLocalWorkspaceEmpty: (snapshot?: AppSnapshot) => boolean;
}

interface UseDriveSyncControllerOptions {
  callbacksRef: RefObject<DriveSyncCallbacks | null>;
  language: string;
  notify: (message: string) => void;
  t: TranslateFn;
}

interface ErrorLike {
  code?: string;
  name?: string;
  message?: string;
  details?: Record<string, unknown>;
}

function normalizeDriveStorageExposure(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['0', 'false', 'no', 'none', 'off'].includes(normalized)) return 'off';
  return 'url';
}

function getDriveStorageEnabledFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('sync') === '1';
  } catch {
    return false;
  }
}

function getDriveStorageFeatureEnabled() {
  if (DRIVE_STORAGE_EXPOSURE === 'off') return false;
  return getDriveStorageEnabledFromUrl() || hasStoredDriveStorageFile();
}

function asErrorLike(error: unknown): ErrorLike {
  if (error && typeof error === 'object') return error as ErrorLike;
  return { message: String(error) };
}

function getErrorMessage(error: unknown) {
  const errorLike = asErrorLike(error);
  return errorLike.message || String(error);
}

function isDriveFileNotFoundError(error: unknown) {
  const errorLike = asErrorLike(error);
  return errorLike.code === 'file_not_found' || errorLike.name === 'DriveStorageFileNotFoundError';
}

function isDriveInvalidJsonError(error: unknown) {
  return asErrorLike(error).code === 'invalid_json';
}

function assertRemoteSnapshotImportable(payload: unknown): asserts payload is AppSnapshot {
  normalizeAppSnapshotForSync(payload);
}

export function useDriveSyncController({
  callbacksRef,
  language,
  notify,
  t,
}: UseDriveSyncControllerOptions) {
  const [driveFeatureEnabled, setDriveFeatureEnabled] = useState(getDriveStorageFeatureEnabled);
  const [driveStorage, setDriveStorage] = useState<PlanGachaDriveStorage | null>(null);
  const [driveStatus, setDriveStatus] = useState<DriveStorageStatus | null>(null);
  const [driveBusy, setDriveBusy] = useState('');
  const [driveConflict, setDriveConflict] = useState(false);
  const [drivePanelOpen, setDrivePanelOpen] = useState(false);
  const [driveAutoSync, setDriveAutoSync] = useState(() => readStoredValue(STORAGE_KEYS.driveAutoSync) === 'true');
  const driveBusyRef = useRef('');
  const driveConflictRef = useRef(false);

  const callbacks = useCallback(() => {
    const current = callbacksRef.current;
    if (!current) throw new Error('Drive sync callbacks are not ready.');
    return current;
  }, [callbacksRef]);

  useEffect(() => {
    const syncDriveFeatureFromUrl = () => {
      const nextDriveFeatureEnabled = getDriveStorageFeatureEnabled();
      setDriveFeatureEnabled(nextDriveFeatureEnabled);
      if (!nextDriveFeatureEnabled) setDrivePanelOpen(false);
    };

    window.addEventListener('popstate', syncDriveFeatureFromUrl);
    return () => window.removeEventListener('popstate', syncDriveFeatureFromUrl);
  }, []);

  useEffect(() => {
    if (!driveFeatureEnabled) return undefined;

    let cancelled = false;

    createPlanGachaDriveStorage().then((storage: PlanGachaDriveStorage | null) => {
      if (cancelled) return;
      setDriveStorage(storage);
      setDriveStatus(storage?.status() || null);
    });

    return () => {
      cancelled = true;
    };
  }, [driveFeatureEnabled]);

  useEffect(() => {
    writeStoredValue(STORAGE_KEYS.driveAutoSync, driveAutoSync ? 'true' : 'false');
  }, [driveAutoSync]);

  useEffect(() => {
    driveBusyRef.current = driveBusy;
    driveConflictRef.current = driveConflict;
  });

  const refreshDriveStatus = useCallback((storage = driveStorage) => {
    setDriveStatus(storage?.status() || null);
  }, [driveStorage]);

  const ensureDriveConnected = useCallback(async (storage: PlanGachaDriveStorage) => {
    if (!storage.status()?.connected) {
      await storage.connect({ prompt: 'consent' });
    }
  }, []);

  const formatDriveMergeError = useCallback((error: unknown) => {
    const errorLike = asErrorLike(error);
    if (errorLike.code === 'merge_invalid_snapshot') {
      const source = String(errorLike.details?.source || 'remote');
      return t('driveMergeInvalidSnapshot', { source: t(`syncSource.${source}`, { defaultValue: source }) });
    }
    if (errorLike.code === 'merge_schema_mismatch') {
      const source = String(errorLike.details?.source || 'remote');
      return t('driveMergeSchemaMismatch', {
        source: t(`syncSource.${source}`, { defaultValue: source }),
        version: String(errorLike.details?.version || 'missing'),
      });
    }
    if (errorLike.code === 'merge_data_conflict') {
      return t('driveMergeDataConflict', { path: String(errorLike.details?.path || 'unknown') });
    }
    return getErrorMessage(error);
  }, [t]);

  const runDriveAction = useCallback(async (
    busyKey: string,
    action: (storage: PlanGachaDriveStorage) => Promise<void>,
  ) => {
    const storage = driveStorage;
    if (driveBusyRef.current) return;
    if (!storage) {
      notify(t('driveActionFailed', { message: t('driveUnavailable') }));
      return;
    }

    driveBusyRef.current = busyKey;
    setDriveBusy(busyKey);
    try {
      await action(storage);
      refreshDriveStatus(storage);
    } catch (error) {
      const errorLike = asErrorLike(error);
      if (errorLike.name === 'DriveStorageAmbiguousFileError') {
        notify(t('driveAmbiguousFile'));
        refreshDriveStatus(storage);
        return;
      }

      if (isDriveFileNotFoundError(error)) {
        setDriveConflict(false);
        notify(t('driveFileMissing'));
        refreshDriveStatus(storage);
        return;
      }

      if (isDriveInvalidJsonError(error)) {
        setDriveConflict(false);
        notify(t('driveInvalidJson'));
        refreshDriveStatus(storage);
        return;
      }

      if (String(errorLike.code || '').startsWith('merge_')) {
        notify(t('driveMergeFailed', { message: formatDriveMergeError(error) }));
        refreshDriveStatus(storage);
        return;
      }

      if (errorLike.name === 'DriveStorageConflictError') {
        setDriveConflict(true);
        notify(t('driveConflictTitle'));
        refreshDriveStatus(storage);
        return;
      }

      notify(t('driveActionFailed', { message: getErrorMessage(error) }));
      refreshDriveStatus(storage);
    } finally {
      driveBusyRef.current = '';
      setDriveBusy('');
    }
  }, [driveStorage, formatDriveMergeError, notify, refreshDriveStatus, t]);

  const syncDrive = useCallback(() => runDriveAction('sync', async (storage) => {
    const { exportAppSnapshot, importAppSnapshot, isLocalWorkspaceEmpty } = callbacks();
    await ensureDriveConnected(storage);
    const localSnapshot = exportAppSnapshot();

    if (storage.status()?.file?.id) {
      await storage.save(localSnapshot);
      setDriveConflict(false);
      notify(t('driveSynced'));
      return;
    }

    if (typeof storage.findFile === 'function') {
      const existing = await storage.findFile();

      if (existing?.file?.id) {
        const remoteSnapshot = await storage.load();
        assertRemoteSnapshotImportable(remoteSnapshot);
        if (remoteSnapshotMatchesLocal(remoteSnapshot, localSnapshot)) {
          setDriveConflict(false);
          notify(t('driveLinkedExisting'));
        } else if (isLocalWorkspaceEmpty(localSnapshot)) {
          importAppSnapshot(remoteSnapshot);
          setDriveConflict(false);
          notify(t('driveLoaded'));
        } else {
          setDriveConflict(true);
          notify(t('driveRemoteFound'));
        }
        return;
      }
    }

    await storage.create(exportAppSnapshot());
    setDriveConflict(false);
    notify(t('driveSynced'));
  }), [callbacks, ensureDriveConnected, notify, runDriveAction, t]);

  const loadDriveFile = useCallback(() => runDriveAction('load', async (storage) => {
    const remote = await storage.load();
    callbacks().importAppSnapshot(remote);
    setDriveConflict(false);
    notify(t('driveLoaded'));
  }), [callbacks, notify, runDriveAction, t]);

  const mergeDriveFile = useCallback(() => runDriveAction('merge', async (storage) => {
    const { exportAppSnapshot, importAppSnapshot } = callbacks();
    await ensureDriveConnected(storage);
    const localSnapshot = exportAppSnapshot();
    const remoteSnapshot = await storage.load();
    const mergedSnapshot = mergeAppSnapshots(localSnapshot, remoteSnapshot, language);
    await storage.save(mergedSnapshot, { force: true });
    importAppSnapshot(mergedSnapshot);
    setDriveConflict(false);
    notify(t('driveMerged'));
  }), [callbacks, ensureDriveConnected, language, notify, runDriveAction, t]);

  const overwriteDriveFile = useCallback(() => runDriveAction('overwrite', async (storage) => {
    await ensureDriveConnected(storage);
    await storage.save(callbacks().exportAppSnapshot(), { force: true });
    setDriveConflict(false);
    notify(t('driveSynced'));
  }), [callbacks, ensureDriveConnected, notify, runDriveAction, t]);

  useEffect(() => {
    const fileId = driveStatus?.file?.id;
    if (!driveFeatureEnabled || !driveAutoSync || !driveStorage || driveStorage.available === false || !driveStatus?.connected || !fileId || driveConflict) {
      return undefined;
    }

    const timer = window.setInterval(async () => {
      if (driveBusyRef.current || driveConflictRef.current) return;

      driveBusyRef.current = 'auto';
      setDriveBusy('auto');
      try {
        const snapshot = callbacksRef.current?.exportAppSnapshot();
        if (snapshot) await driveStorage.save(snapshot);
        setDriveStatus(driveStorage.status());
      } catch (error) {
        const errorLike = asErrorLike(error);
        if (isDriveFileNotFoundError(error)) {
          setDriveConflict(false);
          notify(t('driveFileMissing'));
        } else if (isDriveInvalidJsonError(error)) {
          setDriveConflict(false);
          notify(t('driveInvalidJson'));
        } else if (errorLike.name === 'DriveStorageConflictError') {
          setDriveConflict(true);
          notify(t('driveConflictTitle'));
        } else {
          notify(t('driveActionFailed', { message: getErrorMessage(error) }));
        }
        setDriveStatus(driveStorage.status());
      } finally {
        driveBusyRef.current = '';
        setDriveBusy('');
      }
    }, DRIVE_AUTO_SYNC_MS);

    return () => window.clearInterval(timer);
  }, [callbacksRef, driveAutoSync, driveConflict, driveFeatureEnabled, driveStatus?.connected, driveStatus?.file?.id, driveStorage, notify, t]);

  return useMemo(() => ({
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
  }), [
    driveAutoSync,
    driveBusy,
    driveConflict,
    driveFeatureEnabled,
    drivePanelOpen,
    driveStatus,
    driveStorage,
    loadDriveFile,
    mergeDriveFile,
    overwriteDriveFile,
    syncDrive,
  ]);
}

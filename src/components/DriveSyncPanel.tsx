import type { TranslateFn, VoidFn } from '../types/ui';

interface DriveSyncFile {
  id: string;
  name?: string | null;
  modifiedTime?: string | null;
}

interface DriveSyncStatus {
  connected?: boolean;
  configured?: boolean;
  file?: DriveSyncFile | null;
}

interface DriveSyncStorageView {
  available?: boolean;
}

interface DriveSyncPanelProps {
  driveStorage?: DriveSyncStorageView | null;
  driveStatus?: DriveSyncStatus | null;
  driveBusy: string;
  driveError: string;
  driveOffline: boolean;
  driveConflict: boolean;
  driveAutoSync: boolean;
  setDriveAutoSync: (enabled: boolean) => void;
  loadDriveFile: VoidFn;
  mergeDriveFile: VoidFn;
  overwriteDriveFile: VoidFn;
  syncDrive: VoidFn;
  redetectDriveStorage: VoidFn;
  exportLocalBackup: VoidFn;
  reloadSite: VoidFn;
  t: TranslateFn;
  language: string;
}

export function DriveSyncPanel({
  driveStorage,
  driveStatus,
  driveBusy,
  driveError,
  driveOffline,
  driveConflict,
  driveAutoSync,
  setDriveAutoSync,
  loadDriveFile,
  mergeDriveFile,
  overwriteDriveFile,
  syncDrive,
  redetectDriveStorage,
  exportLocalBackup,
  reloadSite,
  t,
  language,
}: DriveSyncPanelProps) {
  const file = driveStatus?.file;
  const hasFile = Boolean(file?.id);
  const isConnected = Boolean(driveStatus?.connected);
  const isAvailable = Boolean(driveStorage) && driveStorage?.available !== false && driveStatus?.configured !== false;
  const isBusy = Boolean(driveBusy);
  const disabled = !isAvailable || isBusy;
  const syncDisabled = disabled || driveConflict;
  const canAutoSync = isAvailable && isConnected && hasFile;
  const modifiedAt = file?.modifiedTime ? new Date(file.modifiedTime) : null;
  const modifiedLabel = modifiedAt && !Number.isNaN(modifiedAt.getTime())
    ? t('driveLastKnownUpdatedAt', {
      time: modifiedAt.toLocaleString(language === 'en' ? 'en-US' : 'zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    })
    : '';
  const statusLabel = driveBusy === 'detect'
    ? t('driveDetecting')
    : !isAvailable
    ? t(driveStatus?.configured === false ? 'driveNotConfigured' : 'driveUnavailable')
    : !isConnected ? t('driveNotConnected')
    : hasFile ? t('driveConnectedFile', { name: file?.name || 'plan-gacha.state.json' })
    : t('driveNoFile');
  const recoveryHelp = driveOffline ? 'driveOfflineHelp'
    : !isAvailable ? driveStatus?.configured === false ? 'driveNotConfiguredHelp' : 'driveUnavailableHelp'
    : !isConnected ? 'driveNotConnectedHelp' : '';

  return (
    <div className={`drive-sync-panel ${isAvailable ? '' : 'is-unavailable'}`}>
      <div className="drive-sync-head">
        <div>
          <strong>{t('driveSync')}</strong>
          <span>{t('driveSyncHelp')}</span>
        </div>
        {isBusy && <em>{t(driveBusy === 'detect' ? 'driveDetecting' : 'driveBusy')}</em>}
      </div>
      <div className="drive-sync-status" role="status">
        <span>{statusLabel}</span>
        {hasFile && (!isConnected || !isAvailable) && <span>{t('driveStoredFile', { name: file?.name || 'plan-gacha.state.json' })}</span>}
        {modifiedLabel && <span>{modifiedLabel}</span>}
      </div>
      {recoveryHelp && driveBusy !== 'detect' && <p className="helper-text drive-recovery-help">{t(recoveryHelp)}</p>}
      {driveError && <p className="drive-recovery-error" role="alert">{t(driveError, { defaultValue: driveError })}</p>}
      {isAvailable && (
        <label className={`drive-auto-sync ${canAutoSync ? '' : 'is-disabled'}`}>
          <input
            type="checkbox"
            checked={driveAutoSync}
            disabled={!canAutoSync || isBusy}
            onChange={(event) => setDriveAutoSync(event.target.checked)}
          />
          <span>
            <strong>{t('driveAutoSync')}</strong>
            <em>{t('driveAutoSyncHelp')}</em>
          </span>
        </label>
      )}
      {driveConflict && (
        <div className="drive-conflict">
          <strong>{t('driveConflictTitle')}</strong>
          <p>{t('driveConflictHelp')}</p>
          <div>
            <button className="btn btn-outline" type="button" onClick={loadDriveFile} disabled={disabled || !hasFile}>
              {t('drivePullRemote')}
            </button>
            <button className="btn btn-outline" type="button" onClick={mergeDriveFile} disabled={disabled || !hasFile}>
              {t('driveMergeRemote')}
            </button>
            <button className="btn btn-primary" type="button" onClick={overwriteDriveFile} disabled={disabled}>
              {t('driveOverwriteRemote')}
            </button>
          </div>
        </div>
      )}
      <div className="drive-sync-actions">
        <button className="btn btn-primary drive-sync-main" type="button" onClick={syncDrive} disabled={syncDisabled}>
          {isConnected ? t('driveSyncNow') : t('driveConnectAndSync')}
        </button>
        <button className="btn btn-outline" type="button" onClick={redetectDriveStorage} disabled={isBusy}>
          {t(driveBusy === 'detect' ? 'driveDetecting' : 'driveRedetect')}
        </button>
        {!isAvailable && <button className="btn btn-outline" type="button" onClick={reloadSite} disabled={isBusy}>{t('driveReloadSite')}</button>}
        <button className="btn btn-outline" type="button" onClick={exportLocalBackup}>{t('driveExportLocalBackup')}</button>
      </div>
    </div>
  );
}

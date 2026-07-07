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
  driveConflict: boolean;
  driveAutoSync: boolean;
  setDriveAutoSync: (enabled: boolean) => void;
  loadDriveFile: VoidFn;
  mergeDriveFile: VoidFn;
  overwriteDriveFile: VoidFn;
  syncDrive: VoidFn;
  t: TranslateFn;
  language: string;
}

export function DriveSyncPanel({
  driveStorage,
  driveStatus,
  driveBusy,
  driveConflict,
  driveAutoSync,
  setDriveAutoSync,
  loadDriveFile,
  mergeDriveFile,
  overwriteDriveFile,
  syncDrive,
  t,
  language,
}: DriveSyncPanelProps) {
  if (!driveStorage) return null;

  const file = driveStatus?.file;
  const hasFile = Boolean(file?.id);
  const isConnected = Boolean(driveStatus?.connected);
  const isAvailable = driveStorage.available !== false;
  const isBusy = Boolean(driveBusy);
  const disabled = !isAvailable || isBusy;
  const syncDisabled = disabled || driveConflict;
  const canAutoSync = isAvailable && isConnected && hasFile;
  const modifiedAt = file?.modifiedTime ? new Date(file.modifiedTime) : null;
  const modifiedLabel = modifiedAt && !Number.isNaN(modifiedAt.getTime())
    ? t('driveUpdatedAt', {
      time: modifiedAt.toLocaleString(language === 'en' ? 'en-US' : 'zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    })
    : '';
  const statusLabel = !isAvailable
    ? t(driveStatus?.configured === false ? 'driveNotConfigured' : 'driveUnavailable')
    : hasFile
    ? t('driveConnectedFile', { name: file?.name || 'plan-gacha.state.json' })
    : isConnected
      ? t('driveNoFile')
      : t('driveNotConnected');

  return (
    <div className={`drive-sync-panel ${isAvailable ? '' : 'is-unavailable'}`}>
      <div className="drive-sync-head">
        <div>
          <strong>{t('driveSync')}</strong>
          <span>{t('driveSyncHelp')}</span>
        </div>
        {isBusy && <em>{t('driveBusy')}</em>}
      </div>
      <div className="drive-sync-status">
        <span>{statusLabel}</span>
        {modifiedLabel && <span>{modifiedLabel}</span>}
      </div>
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
      </div>
    </div>
  );
}

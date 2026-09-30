import { useModalDialog } from '../hooks/useModalDialog';
import type { RenderNode, TranslateFn, VoidFn } from '../types/ui';
import { Icon } from './Icon';

interface DriveSyncModalProps {
  onClose: VoidFn;
  renderDriveSyncPanel: RenderNode;
  t: TranslateFn;
}

export function DriveSyncModal({
  onClose,
  renderDriveSyncPanel,
  t,
}: DriveSyncModalProps) {
  const dialogRef = useModalDialog(onClose);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal drive-sync-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('driveSync')} onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">{t('driveSync')}</p>
            <h2>{t('driveSync')}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={t('close')} title={t('close')}>
            <Icon name="x" />
          </button>
        </div>
        {renderDriveSyncPanel()}
      </div>
    </div>
  );
}

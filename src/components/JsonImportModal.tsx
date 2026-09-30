import { useModalDialog } from '../hooks/useModalDialog';
import type { FileInputChange, TextAreaRef, TranslateFn, VoidFn } from '../types/ui';
import { Icon } from './Icon';

interface JsonImportModalProps {
  handleImport: VoidFn;
  handleTripImportFile: (event: FileInputChange) => void;
  importTextRef: TextAreaRef;
  onClose: VoidFn;
  t: TranslateFn;
}

export function JsonImportModal({
  handleImport,
  handleTripImportFile,
  importTextRef,
  onClose,
  t,
}: JsonImportModalProps) {
  const dialogRef = useModalDialog(onClose);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('importJsonTitle')} onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <h2>{t('importJsonTitle')}</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={t('close')} title={t('close')}>
            <Icon name="x" />
          </button>
        </div>
        <div className="import-file-row">
          <label className="btn btn-outline file-import-btn">
            {t('importFile')}
            <input type="file" accept=".json,application/json" onChange={handleTripImportFile} />
          </label>
        </div>
        <textarea
          className="textarea"
          rows={12}
          aria-label={t('importJsonTitle')}
          ref={importTextRef}
          placeholder='{"plans":[]}'
        />
        <div className="modal-actions">
          <button className="btn btn-outline" type="button" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn btn-primary" type="button" onClick={handleImport}>
            {t('import')}
          </button>
        </div>
      </div>
    </div>
  );
}

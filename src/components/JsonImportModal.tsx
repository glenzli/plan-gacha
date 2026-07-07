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
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <h2>{t('importJsonTitle')}</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={t('close')}>
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

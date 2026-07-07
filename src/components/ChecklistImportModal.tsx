import { Icon } from './Icon';
import type { Dispatch, SetStateAction, ChangeEvent } from 'react';
import type { ChecklistMergeConflict } from '../domain/checklist';
import type { TranslateFn } from '../types/ui';

interface ChecklistImportModalProps {
  checklistImportConflicts: ChecklistMergeConflict[];
  checklistImportText: string;
  closeChecklistImport: () => void;
  getChecklistConflictLabel: (type: string) => string;
  getChecklistStatusLabel: (status: string) => string;
  handleChecklistImportFile: (event: ChangeEvent<HTMLInputElement>) => void;
  mergeChecklistFromImport: () => void;
  replaceChecklistFromImport: () => void;
  setChecklistImportConflicts: Dispatch<SetStateAction<ChecklistMergeConflict[]>>;
  setChecklistImportText: Dispatch<SetStateAction<string>>;
  t: TranslateFn;
}

export function ChecklistImportModal({
  checklistImportConflicts,
  checklistImportText,
  closeChecklistImport,
  getChecklistConflictLabel,
  getChecklistStatusLabel,
  handleChecklistImportFile,
  mergeChecklistFromImport,
  replaceChecklistFromImport,
  setChecklistImportConflicts,
  setChecklistImportText,
  t,
}: ChecklistImportModalProps) {
  return (
    <div className="modal-overlay" onClick={closeChecklistImport}>
      <div className="modal checklist-import-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">{t('checklist')}</p>
            <h2>{t('checklistImportTitle')}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={closeChecklistImport} aria-label={t('close')}>
            <Icon name="x" />
          </button>
        </div>

        <p className="helper-text">{t('checklistImportHelp')}</p>
        <div className="import-file-row">
          <label className="btn btn-outline file-import-btn">
            {t('importFile')}
            <input type="file" accept=".json,application/json,text/plain" onChange={handleChecklistImportFile} />
          </label>
        </div>
        <textarea
          className="textarea checklist-textarea"
          value={checklistImportText}
          onChange={(event) => {
            setChecklistImportText(event.target.value);
            setChecklistImportConflicts([]);
          }}
          placeholder={t('checklistImportPlaceholder')}
        />

        {checklistImportConflicts.length > 0 && (
          <div className="checklist-conflicts">
            <strong>{t('checklistMergeConflicts', { count: checklistImportConflicts.length })}</strong>
            <p>{t('checklistMergeConflictHelp')}</p>
            <div className="checklist-conflict-list">
              {checklistImportConflicts.slice(0, 8).map((conflict, index) => (
                <div className="checklist-conflict-row" key={`${conflict.type}-${conflict.text}-${index}`}>
                  <span>{getChecklistConflictLabel(conflict.type)}</span>
                  <strong>{conflict.text}</strong>
                  <em>
                    {conflict.currentGroup || '-'} → {conflict.incomingGroup || '-'}
                    {conflict.currentStatus || conflict.incomingStatus
                      ? ` · ${getChecklistStatusLabel(conflict.currentStatus || '')} / ${getChecklistStatusLabel(conflict.incomingStatus || '')}`
                      : ''}
                  </em>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-outline" type="button" onClick={closeChecklistImport}>
            {t('cancel')}
          </button>
          <button className="btn btn-outline" type="button" onClick={mergeChecklistFromImport}>
            {t('checklistMerge')}
          </button>
          <button className="btn btn-primary" type="button" onClick={replaceChecklistFromImport}>
            {t('checklistReplace')}
          </button>
        </div>
      </div>
    </div>
  );
}

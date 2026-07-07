import { Icon } from './Icon';
import { CHECKLIST_STATUS, getChecklistStats, type ChecklistGroup, type ChecklistState } from '../domain/checklist';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { TranslateFn } from '../types/ui';

interface ChecklistStats {
  done: number;
  skipped: number;
  total: number;
}

interface ChecklistModalProps {
  checklistDraftRef: RefObject<HTMLTextAreaElement | null>;
  checklistEditing: boolean;
  checklistGroups: ChecklistGroup[];
  checklistState: ChecklistState;
  checklistStats: ChecklistStats;
  checklistText: string;
  handleExportChecklist: () => void;
  loadChecklistExample: () => void;
  onClose: () => void;
  openChecklistImport: () => void;
  resetChecklistState: () => void;
  saveChecklistText: () => void;
  setChecklistEditing: Dispatch<SetStateAction<boolean>>;
  startUiTransition: (callback: () => void) => void;
  t: TranslateFn;
  toggleChecklistDone: (id: string) => void;
  toggleChecklistSkipped: (id: string) => void;
}

export function ChecklistModal({
  checklistDraftRef,
  checklistEditing,
  checklistGroups,
  checklistState,
  checklistStats,
  checklistText,
  handleExportChecklist,
  loadChecklistExample,
  onClose,
  openChecklistImport,
  resetChecklistState,
  saveChecklistText,
  setChecklistEditing,
  startUiTransition,
  t,
  toggleChecklistDone,
  toggleChecklistSkipped,
}: ChecklistModalProps) {
  const renderChecklistItems = () => {
    if (!checklistGroups.length) return <div className="empty-state">{t('checklistEmpty')}</div>;

    return (
      <div className="checklist-groups">
        {checklistGroups.map((group) => {
          const groupStats = getChecklistStats([group], checklistState);

          return (
            <section className="checklist-group" key={group.id}>
              <div className="checklist-group-head">
                <h3>{group.title}</h3>
                <span>{t('checklistProgress', { done: groupStats.done, total: groupStats.total })}</span>
              </div>

              <div className="checklist-items">
                {group.items.map((item) => {
                  const status = checklistState[item.id] || CHECKLIST_STATUS.todo;
                  const isDone = status === CHECKLIST_STATUS.done;
                  const isSkipped = status === CHECKLIST_STATUS.skipped;

                  return (
                    <div className={`checklist-item status-${status}`} key={item.id}>
                      <button
                        className="checklist-check"
                        type="button"
                        onClick={() => toggleChecklistDone(item.id)}
                        aria-label={isDone ? t('checklistTodo') : t('checklistDone')}
                      >
                        {isDone && <Icon name="check" />}
                      </button>
                      <span>{item.text}</span>
                      <button className="checklist-skip" type="button" onClick={() => toggleChecklistSkipped(item.id)}>
                        {isSkipped ? t('checklistUndoSkip') : t('checklistNotNeeded')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal checklist-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">{t('checklist')}</p>
            <h2>{t('checklistTitle')}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={t('close')}>
            <Icon name="x" />
          </button>
        </div>

        <div className="checklist-overview">
          <div>
            <strong>{t('checklistProgress', { done: checklistStats.done, total: checklistStats.total })}</strong>
            {checklistStats.skipped > 0 && <span>{t('checklistSkipped', { count: checklistStats.skipped })}</span>}
          </div>
          <div className="checklist-progress" aria-hidden="true">
            <span style={{ width: `${checklistStats.total ? Math.round((checklistStats.done / checklistStats.total) * 100) : 0}%` }} />
          </div>
        </div>

        <div className="checklist-scroll">
          {checklistEditing ? (
            <div className="checklist-editor">
              <p className="helper-text">{t('checklistFormatHint')}</p>
              <label>
                <span>{t('checklistTextLabel')}</span>
                <textarea
                  key={checklistText}
                  className="textarea checklist-textarea"
                  ref={checklistDraftRef}
                  defaultValue={checklistText}
                />
              </label>
            </div>
          ) : (
            renderChecklistItems()
          )}
        </div>

        <div className="modal-actions checklist-actions">
          {checklistEditing ? (
            <>
              <button className="btn btn-outline" type="button" onClick={() => setChecklistEditing(false)}>
                {t('cancel')}
              </button>
              <button className="btn btn-primary" type="button" onClick={saveChecklistText}>
                {t('checklistSave')}
              </button>
            </>
          ) : (
            <>
              {checklistStats.total === 0 && (
                <button className="btn btn-outline" type="button" onClick={loadChecklistExample}>
                  {t('checklistUseExample')}
                </button>
              )}
              <button className="btn btn-outline" type="button" onClick={() => startUiTransition(() => setChecklistEditing(true))}>
                {t('checklistEdit')}
              </button>
              <button className="btn btn-outline" type="button" onClick={openChecklistImport}>
                {t('checklistImport')}
              </button>
              <button className="btn btn-outline" type="button" onClick={handleExportChecklist}>
                {t('checklistExport')}
              </button>
              <button
                className="btn btn-outline"
                type="button"
                onClick={resetChecklistState}
                disabled={checklistStats.done === 0 && checklistStats.skipped === 0}
              >
                {t('checklistResetState')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

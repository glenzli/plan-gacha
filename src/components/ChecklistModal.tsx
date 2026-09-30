import { useModalDialog } from '../hooks/useModalDialog';
import { Icon } from './Icon';
import { CHECKLIST_STATUS, getChecklistStats, parseChecklistText, reconcileChecklistStateForGroups, serializeChecklistDraft, type ChecklistGroup, type ChecklistState } from '../domain/checklist';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { TranslateFn } from '../types/ui';

interface ChecklistStats {
  done: number;
  skipped: number;
  total: number;
}

interface ChecklistModalProps {
  checklistEditing: boolean;
  checklistGroups: ChecklistGroup[];
  checklistState: ChecklistState;
  checklistStats: ChecklistStats;
  checklistText: string;
  language: string;
  handleExportChecklist: () => void;
  loadChecklistExample: () => void;
  onClose: () => void;
  openChecklistImport: () => void;
  resetChecklistState: () => void;
  saveChecklistText: (text: string, state: ChecklistState) => void;
  setChecklistEditing: Dispatch<SetStateAction<boolean>>;
  startUiTransition: (callback: () => void) => void;
  t: TranslateFn;
  toggleChecklistDone: (id: string) => void;
  toggleChecklistSkipped: (id: string) => void;
}

function createDraft(text: string, state: ChecklistState, language: string) {
  return {
    text,
    groups: parseChecklistText(text, language, { keepEmptyGroups: true }),
    state,
    rawState: state,
    groupsChanged: false,
  };
}

export function ChecklistModal({
  checklistEditing,
  checklistGroups,
  checklistState,
  checklistStats,
  checklistText,
  language,
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
  const [draft, setDraft] = useState(() => createDraft(checklistText, checklistState, language));
  const [editMode, setEditMode] = useState<'groups' | 'raw'>('groups');
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [editError, setEditError] = useState('');
  const [pendingExit, setPendingExit] = useState<'close' | 'cancel' | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const hasChanges = checklistEditing && (draft.groupsChanged || draft.text !== checklistText);
  useEffect(() => {
    if (!hasChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasChanges]);

  const beginEditing = (groupId?: string) => {
    const next = createDraft(checklistText, checklistState, language);
    setDraft(next);
    setEditMode('groups');
    setExpandedGroups(groupId ? [groupId] : next.groups.slice(0, 1).map((group) => group.id));
    setEditError('');
    startUiTransition(() => setChecklistEditing(true));
  };
  const performExit = (target: 'close' | 'cancel') => {
    setChecklistEditing(false);
    if (target === 'close') onClose();
    else window.requestAnimationFrame(() => dialogRef.current?.focus());
  };
  const requestExit = (target: 'close' | 'cancel') => {
    if (hasChanges) setPendingExit(target);
    else performExit(target);
  };
  const continueEditing = () => {
    setPendingExit(null);
    window.requestAnimationFrame(() => dialogRef.current?.focus());
  };
  useModalDialog(() => requestExit('close'), dialogRef);
  const leaveRef = useModalDialog(continueEditing, undefined, Boolean(pendingExit));
  const updateGroups = (groups: ChecklistGroup[]) => {
    setDraft((current) => ({ ...current, groups, groupsChanged: true }));
    setEditError('');
  };
  const updateGroup = (groupId: string, update: Partial<ChecklistGroup>) => {
    updateGroups(draft.groups.map((group) => group.id === groupId ? { ...group, ...update } : group));
  };
  const switchMode = (mode: 'groups' | 'raw') => {
    if (mode === 'raw' && draft.groupsChanged) {
      try {
        const next = serializeChecklistDraft(draft.groups, draft.state, language);
        const nextDraft = createDraft(next.checklistText, next.checklistState, language);
        setDraft(nextDraft);
        setExpandedGroups(nextDraft.groups.filter((_, index) => expandedGroups.includes(draft.groups[index]?.id)).map((group) => group.id));
      } catch (error) {
        setEditError(t(error instanceof Error ? error.message : 'checklistCategoryRequired'));
        return;
      }
    }
    if (mode === 'groups' && !draft.groups.some((group) => expandedGroups.includes(group.id))) {
      setExpandedGroups(draft.groups.slice(0, 1).map((group) => group.id));
    }
    setEditMode(mode);
    setEditError('');
  };
  const saveDraft = () => {
    try {
      const next = draft.groupsChanged
        ? serializeChecklistDraft(draft.groups, draft.state, language)
        : { checklistText: draft.text, checklistState: draft.state };
      saveChecklistText(next.checklistText, next.checklistState);
    } catch (error) {
      setEditError(t(error instanceof Error ? error.message : 'checklistCategoryRequired'));
    }
  };
  const addGroup = () => {
    const id = `group-${crypto.randomUUID()}`;
    let number = 1;
    while (draft.groups.some((group) => group.title === t('checklistNewCategory', { number }))) number += 1;
    updateGroups([...draft.groups, { id, title: t('checklistNewCategory', { number }), items: [] }]);
    setExpandedGroups((current) => [...current, id]);
  };

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
                <button className="icon-btn" type="button" onClick={() => beginEditing(group.id)} title={t('checklistEditCategory', { name: group.title })} aria-label={t('checklistEditCategory', { name: group.title })}><Icon name="pencil" /></button>
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
                        aria-label={`${isDone ? t('checklistTodo') : t('checklistDone')}: ${item.text}`}
                        aria-pressed={isDone}
                        title={isDone ? t('checklistTodo') : t('checklistDone')}
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
    <div className="modal-overlay" onClick={() => requestExit('close')}>
      <div className="modal checklist-modal" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="checklist-title" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">{t('checklist')}</p>
            <h2 id="checklist-title">{t('checklistTitle')}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={() => requestExit('close')} aria-label={t('close')} title={t('close')}>
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
              <div className="ai-mode-tabs checklist-edit-modes" role="group" aria-label={t('checklistEditMode')}>
                <button type="button" className={editMode === 'groups' ? 'is-selected' : ''} aria-pressed={editMode === 'groups'} onClick={() => switchMode('groups')}>{t('checklistGroupEdit')}</button>
                <button type="button" className={editMode === 'raw' ? 'is-selected' : ''} aria-pressed={editMode === 'raw'} onClick={() => switchMode('raw')}>{t('checklistRawEdit')}</button>
              </div>
              {editError && <p className="checklist-edit-error" role="alert">{editError}</p>}
              {editMode === 'raw' ? <>
                <p className="helper-text">{t('checklistFormatHint')}</p>
                <label>
                <span>{t('checklistTextLabel')}</span>
                <textarea
                  className="textarea checklist-textarea"
                  value={draft.text}
                  spellCheck={false}
                  onChange={(event) => {
                    const text = event.target.value;
                    const groups = parseChecklistText(text, language, { keepEmptyGroups: true });
                    setDraft((current) => ({ ...current, text, groups, state: reconcileChecklistStateForGroups(current.rawState, groups), groupsChanged: false }));
                  }}
                />
                </label>
              </> : <>
                <p className="helper-text">{t('checklistGroupEditHelp')}</p>
                {draft.groups.length === 0 && <div className="empty-state">{t('checklistEmpty')}</div>}
                {draft.groups.map((group) => <details className="checklist-category-editor" key={group.id} open={expandedGroups.includes(group.id)}>
                  <summary onClick={(event) => { event.preventDefault(); setExpandedGroups((current) => current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id]); }}>
                    <Icon name="chevronDown" /><strong>{group.title || t('checklistCategoryName')}</strong><span>{t('itemsCount', { count: group.items.filter((item) => item.text.trim()).length })}</span>
                  </summary>
                  <div className="checklist-category-fields">
                    <div className="checklist-category-name">
                      <label><span>{t('checklistCategoryName')}</span><input className="input" value={group.title} autoFocus={group.id.startsWith('group-')} onChange={(event) => updateGroup(group.id, { title: event.target.value })} /></label>
                      <button className="icon-btn" type="button" title={t('checklistRemoveCategory', { name: group.title })} aria-label={t('checklistRemoveCategory', { name: group.title })} onClick={() => updateGroups(draft.groups.filter((item) => item.id !== group.id))}><Icon name="trash" /></button>
                    </div>
                    <div className="checklist-edit-items">
                      {group.items.map((item, index) => <div className="checklist-edit-item" key={item.id}>
                        <input className="input" value={item.text} autoFocus={item.id.startsWith('item-') && !item.text} aria-label={t('checklistItemLabel', { number: index + 1, name: group.title })} placeholder={t('checklistItemPlaceholder')} onChange={(event) => updateGroup(group.id, { items: group.items.map((entry) => entry.id === item.id ? { ...entry, text: event.target.value } : entry) })} />
                        <button className="icon-btn" type="button" title={t('checklistRemoveItem', { name: item.text || index + 1 })} aria-label={t('checklistRemoveItem', { name: item.text || index + 1 })} onClick={() => updateGroup(group.id, { items: group.items.filter((entry) => entry.id !== item.id) })}><Icon name="x" /></button>
                      </div>)}
                    </div>
                    <button className="btn btn-small btn-outline" type="button" onClick={() => updateGroup(group.id, { items: [...group.items, { id: `item-${crypto.randomUUID()}`, text: '' }] })}><Icon name="plus" />{t('checklistAddItem')}</button>
                  </div>
                </details>)}
                <button className="btn btn-outline checklist-add-category" type="button" onClick={addGroup}><Icon name="plus" />{t('checklistAddCategory')}</button>
              </>}
            </div>
          ) : (
            renderChecklistItems()
          )}
        </div>

        <div className="modal-actions checklist-actions">
          {checklistEditing ? (
            <>
              <button className="btn btn-outline" type="button" onClick={() => requestExit('cancel')}>
                {t('cancel')}
              </button>
              <button className="btn btn-primary" type="button" onClick={saveDraft}>
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
              <button className="btn btn-outline" type="button" onClick={() => beginEditing()}>
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
      {pendingExit && <div className="modal-overlay editor-leave-overlay" onClick={(event) => event.stopPropagation()}>
        <div ref={leaveRef} className="modal editor-leave-dialog" role="alertdialog" aria-modal="true" aria-labelledby="leave-checklist-title" aria-describedby="leave-checklist-help">
          <h3 id="leave-checklist-title">{t('leavePlanTitle')}</h3>
          <p id="leave-checklist-help">{t('leaveChecklistHelp')}</p>
          <div className="modal-actions">
            <button className="btn btn-outline" type="button" onClick={() => { const target = pendingExit; setPendingExit(null); performExit(target); }}>{t('discardPlanEdits')}</button>
            <button className="btn btn-primary" type="button" autoFocus onClick={continueEditing}>{t('keepEditingPlan')}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

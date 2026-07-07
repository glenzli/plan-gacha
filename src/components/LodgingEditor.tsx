import { useState } from 'react';
import { normalizeLodgingDrafts, type NormalizedLodging } from '../domain/trip';
import { getTodayId } from '../domain/date';
import { Icon } from './Icon';
import type { TranslateFn } from '../types/ui';

type LodgingDraftInput = Record<string, any>;

interface LodgingEditorDraft {
  id: string;
  name: string;
  checkIn: string;
  checkOut: string;
  address: string;
  note: string;
  order: number;
}

interface LodgingEditorProps {
  lodgings: NormalizedLodging[];
  startDateStr: string;
  endDateStr: string;
  t: TranslateFn;
  onSave: (lodgings: NormalizedLodging[]) => void;
}

function createLodgingId() {
  return `lodging-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function createLodgingEditorDraft(
  lodging: LodgingDraftInput = {},
  index = 0,
  startDateStr = getTodayId(),
  endDateStr = startDateStr,
): LodgingEditorDraft {
  const location = lodging.location || {};

  return {
    id: lodging.id || createLodgingId(),
    name: lodging.name || lodging.title || lodging.hotel || location.label || '',
    checkIn: lodging.checkIn || lodging.check_in || lodging.startDate || lodging.start_date || startDateStr,
    checkOut: lodging.checkOut || lodging.check_out || lodging.endDate || lodging.end_date || endDateStr,
    address: lodging.address || location.address || '',
    note: lodging.note || lodging.description || '',
    order: index,
  };
}

export function LodgingEditor({ lodgings, startDateStr, endDateStr, t, onSave }: LodgingEditorProps) {
  const [drafts, setDrafts] = useState(() => (
    lodgings.length
      ? lodgings.map((lodging: NormalizedLodging, index: number) => createLodgingEditorDraft(lodging, index, startDateStr, endDateStr))
      : []
  ));

  const addDraft = () => {
    setDrafts((current: LodgingEditorDraft[]) => [
      ...current,
      createLodgingEditorDraft({}, current.length, startDateStr, endDateStr),
    ]);
  };

  const updateDraft = (id: string, field: keyof LodgingEditorDraft, value: string) => {
    setDrafts((current: LodgingEditorDraft[]) => current.map((draft: LodgingEditorDraft) => (
      draft.id === id ? { ...draft, [field]: value } : draft
    )));
  };

  const removeDraft = (id: string) => {
    setDrafts((current: LodgingEditorDraft[]) => current.filter((draft: LodgingEditorDraft) => draft.id !== id));
  };

  const saveDrafts = () => {
    onSave(normalizeLodgingDrafts(drafts));
  };

  return (
    <div className="lodging-editor">
      <div className="lodging-editor-head">
        <div>
          <h3>{t('lodgingSection')}</h3>
          <p>{t('lodgingSectionHelp')}</p>
        </div>
        <button className="btn btn-small btn-outline" type="button" onClick={addDraft}>
          {t('addLodging')}
        </button>
      </div>

      {drafts.length === 0 ? (
        <div className="lodging-empty">
          <strong>{t('lodgingEmpty')}</strong>
          <span>{t('lodgingEmptyHelp')}</span>
        </div>
      ) : (
        <div className="lodging-list">
          {drafts.map((draft) => (
            <div className="lodging-row" key={draft.id}>
              <div className="lodging-row-main">
                <label>
                  <span>{t('lodgingNameLabel')}</span>
                  <input
                    className="input"
                    value={draft.name}
                    onChange={(event) => updateDraft(draft.id, 'name', event.target.value)}
                  />
                </label>
                <label>
                  <span>{t('lodgingAddressLabel')}</span>
                  <input
                    className="input"
                    value={draft.address}
                    onChange={(event) => updateDraft(draft.id, 'address', event.target.value)}
                  />
                </label>
              </div>
              <div className="lodging-row-meta">
                <label>
                  <span>{t('lodgingCheckIn')}</span>
                  <input
                    className="input"
                    type="date"
                    value={draft.checkIn}
                    onChange={(event) => updateDraft(draft.id, 'checkIn', event.target.value)}
                  />
                </label>
                <label>
                  <span>{t('lodgingCheckOut')}</span>
                  <input
                    className="input"
                    type="date"
                    min={draft.checkIn || startDateStr}
                    value={draft.checkOut}
                    onChange={(event) => updateDraft(draft.id, 'checkOut', event.target.value)}
                  />
                </label>
              </div>
              <div className="lodging-row-footer">
                <label>
                  <span>{t('lodgingNote')}</span>
                  <input
                    className="input"
                    value={draft.note}
                    onChange={(event) => updateDraft(draft.id, 'note', event.target.value)}
                  />
                </label>
                <button
                  className="icon-btn compact-icon-btn danger-icon-btn"
                  type="button"
                  onClick={() => removeDraft(draft.id)}
                  aria-label={t('delete')}
                  title={t('delete')}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="modal-actions lodging-actions">
        <button className="btn btn-primary" type="button" onClick={saveDrafts}>
          {t('saveLodgings')}
        </button>
      </div>
    </div>
  );
}

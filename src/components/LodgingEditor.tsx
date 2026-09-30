import { useEffect, useState } from 'react';
import { normalizeLodgingDrafts, normalizeLodging, type NormalizedLodging, type NormalizedSchedule } from '../domain/trip';
import { getTodayId, addDays } from '../domain/date';
import { getLodgingTasks, lodgingTaskLabel, type LodgingReservation } from '../domain/lodging';
import { normalizeExternalLinkUrl, type NormalizedPlan } from '../domain/plan';
import { getMapProviderNameKey, getMapSearchLink } from '../domain/locationLinks';
import type { MapPreferences, MapRegion } from '../domain/mapPreferences';
import { Icon } from './Icon';
import type { TranslateFn } from '../types/ui';

interface LodgingEditorDraft extends NormalizedLodging {
  address: string;
  order: number;
}

interface LodgingEditorProps {
  lodgings: NormalizedLodging[];
  mapPreferences: MapPreferences;
  mapRegionHint: MapRegion;
  mapSearchRegion: string;
  startDateStr: string;
  endDateStr: string;
  t: TranslateFn;
  onSave: (lodgings: NormalizedLodging[]) => void;
  plans: NormalizedPlan[];
  schedule: NormalizedSchedule;
  dates: string[];
  onAi: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

function createLodgingId() {
  return `lodging-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function createLodgingEditorDraft(
  lodging: Partial<NormalizedLodging> = {},
  index = 0,
  startDateStr = getTodayId(),
  endDateStr = startDateStr,
): LodgingEditorDraft {
  const location = lodging.location || { label: '', address: '' };

  return {
    ...normalizeLodging(lodging)!,
    id: lodging.id || createLodgingId(),
    name: lodging.name || location.label || '',
    checkIn: lodging.checkIn || startDateStr,
    checkOut: lodging.checkOut || (endDateStr > startDateStr ? endDateStr : addDays(startDateStr, 1)),
    address: location.address || '',
    note: lodging.note || '',
    order: index,
  };
}

export function LodgingEditor({ lodgings, mapPreferences, mapRegionHint, mapSearchRegion, startDateStr, endDateStr, t, onSave, plans, schedule, dates, onAi, onDirtyChange }: LodgingEditorProps) {
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState(() => (
    lodgings.length
      ? lodgings.map((lodging: NormalizedLodging, index: number) => createLodgingEditorDraft(lodging, index, startDateStr, endDateStr))
      : []
  ));
  const [savedDraft, setSavedDraft] = useState(() => JSON.stringify(drafts));
  const dirty = JSON.stringify(drafts) !== savedDraft;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

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
    if (drafts.some((draft) => draft.defaultForTrip !== false && (!draft.checkIn || draft.checkOut <= draft.checkIn)
      || draft.reservations?.some((reservation) => !reservation.checkIn || reservation.checkOut <= reservation.checkIn))) {
      setError(t('lodgingDatesInvalid')); return;
    }
    setError('');
    onSave(normalizeLodgingDrafts(drafts));
    setSavedDraft(JSON.stringify(drafts));
  };
  const updateReservation = (hotelId: string, reservationId: string, field: keyof LodgingReservation, value: string) => {
    setDrafts((current) => current.map((hotel) => hotel.id !== hotelId ? hotel : { ...hotel, reservations: hotel.reservations?.map((reservation) => reservation.id === reservationId ? { ...reservation, [field]: value } : reservation) }));
  };
  const tasks = dates.flatMap((date) => getLodgingTasks(date, schedule, new Map(plans.map((plan) => [plan.id, plan])), lodgings)).filter((task) => task.type !== 'missing');

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
      <button className="btn btn-small btn-outline" type="button" onClick={onAi}>{t('lodgingAiEdit')}</button>
      {tasks.length > 0 && <details className="constraint-details"><summary>{t('lodgingTodoCount', { count: tasks.length })}</summary><ul>{tasks.map((task, index) => <li key={index}>{task.dateId} · {lodgingTaskLabel(task, t)}</li>)}</ul></details>}

      {drafts.length === 0 ? (
        <div className="lodging-empty">
          <strong>{t('lodgingEmpty')}</strong>
          <span>{t('lodgingEmptyHelp')}</span>
        </div>
      ) : (
        <div className="lodging-list">
          {drafts.map((draft) => {
            const existingLocation = lodgings.find((lodging) => lodging.id === draft.id)?.location;
            const inUse = plans.some((plan) => plan.lodging?.optionIds.includes(draft.id)) || Object.values(schedule).some((entry) => entry.lodgingId === draft.id) || draft.reservations?.some((reservation) => reservation.status === 'booked');
            const city = existingLocation?.admin2 || existingLocation?.weatherLabel || mapSearchRegion;
            const address = draft.address.trim();
            const searchAddress = city && !address.includes(city) ? [city, address].filter(Boolean).join(' ') : address;
            const mapLink = getMapSearchLink({
              ...existingLocation,
              label: draft.name.trim(),
              address: searchAddress,
              weatherLabel: city,
            }, mapPreferences, mapRegionHint);
            const mapLabel = t('findLodgingOnMap', { provider: t(getMapProviderNameKey(mapLink.provider)) });
            return (
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
                <label className="lodging-check"><input type="checkbox" checked={draft.defaultForTrip !== false} onChange={(event) => setDrafts((current) => current.map((hotel) => hotel.id === draft.id ? { ...hotel, defaultForTrip: event.target.checked } : hotel))} />{t('lodgingUseDefault')}</label>
              </div>
              {draft.defaultForTrip !== false && <div className="lodging-row-meta">
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
              </div>}
              <details className="lodging-reservations">
                <summary>{t('lodgingOrders')} · {draft.reservations?.length || 0}</summary>
                {(draft.reservations || []).map((reservation) => <div className="lodging-order" key={reservation.id}>
                  <div className="lodging-row-meta">
                    <label><span>{t('lodgingCheckIn')}</span><input className="input" type="date" value={reservation.checkIn} onChange={(event) => updateReservation(draft.id, reservation.id, 'checkIn', event.target.value)} /></label>
                    <label><span>{t('lodgingCheckOut')}</span><input className="input" type="date" min={reservation.checkIn ? addDays(reservation.checkIn, 1) : undefined} value={reservation.checkOut} onChange={(event) => updateReservation(draft.id, reservation.id, 'checkOut', event.target.value)} /></label>
                    <label><span>{t('lodgingOrderStatus')}</span><select className="input" value={reservation.status} onChange={(event) => updateReservation(draft.id, reservation.id, 'status', event.target.value)}>{(['pending', 'booked', 'cancelled'] as const).map((status) => <option key={status} value={status}>{t(`lodgingOrder_${status}`)}</option>)}</select></label>
                  </div>
                  <label><span>{t('lodgingCancelBy')}</span><input className="input" value={reservation.cancelBy} placeholder={t('lodgingCancelByPlaceholder')} onChange={(event) => updateReservation(draft.id, reservation.id, 'cancelBy', event.target.value)} /></label>
                  <label><span>{t('lodgingCancelUrl')}</span><input className="input" type="url" value={reservation.cancelUrl} onChange={(event) => updateReservation(draft.id, reservation.id, 'cancelUrl', event.target.value)} /></label>
                  {normalizeExternalLinkUrl(reservation.cancelUrl) && <a href={normalizeExternalLinkUrl(reservation.cancelUrl)} target="_blank" rel="noreferrer">{t('lodgingManageOrder')}</a>}
                  <label><span>{t('lodgingNote')}</span><input className="input" value={reservation.note} onChange={(event) => updateReservation(draft.id, reservation.id, 'note', event.target.value)} /></label>
                </div>)}
                <button className="btn btn-small btn-outline" type="button" onClick={() => setDrafts((current) => current.map((hotel) => hotel.id === draft.id ? { ...hotel, reservations: [...(hotel.reservations || []), { id: createLodgingId(), checkIn: draft.checkIn || startDateStr, checkOut: draft.checkOut || addDays(startDateStr, 1), status: 'pending', cancelBy: '', cancelUrl: '', note: '' }] } : hotel))}>{t('lodgingAddOrder')}</button>
              </details>
              <div className="lodging-row-footer">
                <label>
                  <span>{t('lodgingNote')}</span>
                  <input
                    className="input"
                    value={draft.note}
                    onChange={(event) => updateDraft(draft.id, 'note', event.target.value)}
                  />
                </label>
                <span className="lodging-row-actions">
                  {(draft.name.trim() || address) && mapLink.url && (
                    <a className="btn btn-small btn-outline" href={mapLink.url} target="_blank" rel="noreferrer">
                      <Icon name="mapPin" />
                      {mapLabel}
                    </a>
                  )}
                  <button
                    className="icon-btn compact-icon-btn danger-icon-btn"
                    type="button"
                    onClick={() => removeDraft(draft.id)}
                    disabled={Boolean(inUse)}
                    aria-label={t('delete')}
                    title={t(inUse ? 'lodgingInUse' : 'delete')}
                  >
                    <Icon name="trash" />
                  </button>
                </span>
              </div>
            </div>
            );
          })}
        </div>
      )}

      <div className="modal-actions lodging-actions">
        {error && <p className="constraint-error" role="alert">{error}</p>}
        <button className="btn btn-primary" type="button" onClick={saveDrafts}>
          {t('saveLodgings')}
        </button>
      </div>
    </div>
  );
}

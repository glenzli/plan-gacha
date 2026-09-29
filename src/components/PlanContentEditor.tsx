import { useState } from 'react';
import { Icon } from './Icon';
import { inferMapRouteMode } from '../domain/locationLinks';
import { editStopLocation, replacePlanStops } from '../domain/planEditing';
import type { NormalizedPlan, PlanStop, PreferredRouteMode, StopTransfer } from '../domain/plan';
import type { TranslateFn } from '../types/ui';

interface PlanContentEditorProps {
  plan: NormalizedPlan;
  locationSource: NormalizedPlan;
  onChange: (plan: NormalizedPlan) => void;
  t: TranslateFn;
}

const EMPTY_TRANSFER: StopTransfer = { departAt: '', arriveAt: '', duration: '', mode: '', note: '', via: [] };

export function PlanContentEditor({ plan, locationSource, onChange, t }: PlanContentEditorProps) {
  const [undoStops, setUndoStops] = useState<{ stops: PlanStop[]; clearedTransfers: boolean } | null>(null);
  const [expandedStop, setExpandedStop] = useState<string | null>(null);
  const updateStop = (index: number, patch: Partial<PlanStop>) => {
    setUndoStops(null);
    onChange({ ...plan, stops: plan.stops.map((stop, i) => i === index ? { ...stop, ...patch } : stop) });
  };
  const updateTransfer = (index: number, patch: Partial<StopTransfer>) => {
    updateStop(index, { transferFromPrevious: { ...EMPTY_TRANSFER, ...plan.stops[index].transferFromPrevious, ...patch } });
  };
  const changeOrder = (stops: PlanStop[]) => {
    const updated = replacePlanStops(plan, stops);
    const clearedTransfers = updated.stops.some((stop) => !stop.transferFromPrevious && plan.stops.some((previous) => previous.id === stop.id && previous.transferFromPrevious));
    setUndoStops({ stops: plan.stops, clearedTransfers });
    onChange(updated);
  };
  const moveStop = (index: number, offset: number) => {
    const stops = [...plan.stops];
    [stops[index], stops[index + offset]] = [stops[index + offset], stops[index]];
    changeOrder(stops);
  };
  const addStop = () => {
    const stop: PlanStop = {
      id: `stop-${crypto.randomUUID()}`,
      title: '', time: '', note: '', openingHours: '', weatherRelevant: true,
      location: { ...plan.location, label: '', address: '', mapPoint: undefined },
      transferFromPrevious: null,
    };
    changeOrder([...plan.stops, stop]);
    setExpandedStop(stop.id);
  };

  return (
    <section className="plan-content-editor">
      <p className="editor-help">{t('contentEditorHelp')}</p>
      <details className="constraint-details plan-info-editor" open={locationSource.stops.length === 0}>
        <summary>{t('planInfoDetails')}</summary>
        <label>
          <span>{t('planName')}</span>
          <input className="input" value={plan.name} onChange={(event) => onChange({ ...plan, name: event.target.value })} />
        </label>
        <label>
          <span>{t('planDescription')}</span>
          <textarea className="textarea plan-description-input" value={plan.description} onChange={(event) => onChange({ ...plan, description: event.target.value })} />
        </label>
      </details>

      <div className="stop-editor-heading">
        <h4>{t('editStopsTitle', { count: plan.stops.length })}</h4>
        <button className="btn btn-small btn-outline" type="button" onClick={addStop}><Icon name="plus" />{t('addStop')}</button>
      </div>
      {undoStops && (
        <div className="stop-order-notice" role="status">
          <span>{t(undoStops.clearedTransfers ? 'stopOrderChanged' : 'stopListUpdated')}</span>
          <button className="btn btn-small btn-outline" type="button" onClick={() => { onChange({ ...plan, stops: undoStops.stops }); setUndoStops(null); }}>{t('undoEdit')}</button>
        </div>
      )}
      {plan.stops.length === 0 && <p className="editor-help">{t('noStopsToEdit')}</p>}
      {plan.stops.map((stop, index) => {
        const source = locationSource.stops.find((item) => item.id === stop.id)?.location || stop.location;
        const transfer = stop.transferFromPrevious;
        const locationChanged = source.mapPoint && !stop.location.mapPoint;
        return (
          <details className="stop-editor" key={stop.id} open={expandedStop === stop.id}>
            <summary onClick={(event) => { event.preventDefault(); setExpandedStop(expandedStop === stop.id ? null : stop.id); }}>
              <span className="stop-editor-number">{index + 1}</span>
              <span className="stop-editor-summary">
                <strong>{stop.time && `${stop.time} · `}{stop.title || t('newStop')}</strong>
                <span>{stop.location.label || t('stopPlacePlaceholder')}</span>
              </span>
            </summary>
            <div className="stop-editor-fields">
              <div className="stop-editor-actions">
                <button className="btn btn-small btn-outline" type="button" disabled={index === 0} title={t('moveStopUp')} onClick={() => moveStop(index, -1)}>{t('moveStopUp')}</button>
                <button className="btn btn-small btn-outline" type="button" disabled={index === plan.stops.length - 1} title={t('moveStopDown')} onClick={() => moveStop(index, 1)}>{t('moveStopDown')}</button>
                <button className="icon-btn compact-icon-btn" type="button" aria-label={t('removeStop', { name: stop.title || t('newStop') })} title={t('removeStop', { name: stop.title || t('newStop') })} onClick={() => changeOrder(plan.stops.filter((_, i) => i !== index))}><Icon name="trash" /></button>
              </div>
              <div className="stop-editor-pair">
                <label><span>{t('stopTime')}</span><input className="input" value={stop.time} placeholder="09:30" onChange={(event) => updateStop(index, { time: event.target.value })} /></label>
                <label><span>{t('stopTitle')}</span><input className="input" value={stop.title} onChange={(event) => updateStop(index, { title: event.target.value })} /></label>
              </div>
              <label><span>{t('stopPlace')}</span><input className="input" value={stop.location.label} placeholder={t('stopPlacePlaceholder')} onChange={(event) => updateStop(index, { location: editStopLocation(source, event.target.value, stop.location.address) })} /></label>
              <label><span>{t('stopAddress')}</span><input className="input" value={stop.location.address} onChange={(event) => updateStop(index, { location: editStopLocation(source, stop.location.label, event.target.value) })} /></label>
              {locationChanged && <p className="editor-inline-notice">{t('editedPlaceNeedsPosition')}</p>}
              <label><span>{t('stopNote')}</span><textarea className="textarea stop-note-input" value={stop.note} onChange={(event) => updateStop(index, { note: event.target.value })} /></label>
              <details className="stop-extra-fields">
                <summary>{t('stopExtraFields')}</summary>
                <label><span>{t('stopOpeningHours')}</span><input className="input" value={stop.openingHours} onChange={(event) => updateStop(index, { openingHours: event.target.value })} /></label>
                <label className="constraint-any-weather"><input type="checkbox" checked={stop.weatherRelevant} onChange={(event) => updateStop(index, { weatherRelevant: event.target.checked })} /><span>{t('stopWeatherRelevant')}</span></label>
              </details>
              {index > 0 && (
                <fieldset className="stop-transfer-editor">
                  <legend>{t('transferFromStop', { name: plan.stops[index - 1].title || t('newStop') })}</legend>
                  <div className="stop-editor-pair">
                    <label><span>{t('transferDepartAt')}</span><input className="input" value={transfer?.departAt || ''} placeholder="09:00" onChange={(event) => updateTransfer(index, { departAt: event.target.value })} /></label>
                    <label><span>{t('transferDuration')}</span><input className="input" value={transfer?.duration || ''} onChange={(event) => updateTransfer(index, { duration: event.target.value })} /></label>
                    <label><span>{t('transferMode')}</span><input className="input" value={transfer?.mode || ''} placeholder={t('transferModePlaceholder')} onChange={(event) => updateTransfer(index, { mode: event.target.value, preferredRouteMode: inferMapRouteMode(event.target.value) })} /></label>
                    <label><span>{t('transferNavigation')}</span><select className="input" value={transfer?.preferredRouteMode || ''} onChange={(event) => updateTransfer(index, { preferredRouteMode: event.target.value as PreferredRouteMode || null })}>
                      <option value="">{t('routeModeAuto')}</option><option value="walking">{t('routeModeWalking')}</option><option value="transit">{t('routeModeTransit')}</option><option value="driving">{t('routeModeDriving')}</option>
                    </select></label>
                  </div>
                  <label><span>{t('transferNote')}</span><textarea className="textarea stop-note-input" value={transfer?.note || ''} onChange={(event) => updateTransfer(index, { note: event.target.value })} /></label>
                  {Boolean(transfer?.via?.length) && <p className="editor-help">{t('transferViaKept', { places: transfer?.via?.map((place) => place.label).join(' → ') })}</p>}
                </fieldset>
              )}
            </div>
          </details>
        );
      })}
    </section>
  );
}

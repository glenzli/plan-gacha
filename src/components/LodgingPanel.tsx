import { useState } from 'react';
import { getMapSearchLink, getMapProviderNameKey, getMapRegion } from '../domain/locationLinks';
import type { MapPreferences } from '../domain/mapPreferences';
import type { NormalizedPlan, PlanLodging } from '../domain/plan';
import { NO_LODGING, getLodgingTasks, resolveNightLodging, nightLodgingLabel, lodgingTaskLabel, type LodgingImpact, type NormalizedLodging } from '../domain/lodging';
import type { NormalizedSchedule } from '../domain/trip';
import type { TranslateFn } from '../types/ui';

export function LodgingImpactList({ impacts, t }: { impacts: LodgingImpact[]; t: TranslateFn }) {
  if (!impacts.length) return null;
  return <section className="lodging-impact-list">
    <h3>{t('lodgingChanges')}</h3>
    {impacts.map((impact) => <div className="lodging-impact-item" key={impact.dateId}>
      <strong>{t('lodgingNight', { date: impact.dateId })}</strong>
      <p>{nightLodgingLabel(impact.before, t)} → {nightLodgingLabel(impact.after, t)}</p>
      {impact.tasks.map((task, index) => <p key={index}>{lodgingTaskLabel(task, t)}{task.partial ? ` · ${t('lodgingPartialCancellation')}` : ''}</p>)}
      {impact.nextMorning && <small>{t('lodgingNextMorning', { date: impact.nextMorning })}</small>}
    </div>)}
  </section>;
}

export function DayLodgingCard({ dateId, schedule, plans, lodgings, mapPreferences, t, onChoose, onLock, onBooked, onManage }: {
  dateId: string; schedule: NormalizedSchedule; plans: Map<string, NormalizedPlan>; lodgings: NormalizedLodging[];
  mapPreferences: MapPreferences; t: TranslateFn;
  onChoose: (id: string) => void; onLock: (locked: boolean) => void; onBooked: (id: string) => void; onManage: () => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const night = resolveNightLodging(dateId, schedule, plans, lodgings);
  const tasks = getLodgingTasks(dateId, schedule, plans, lodgings);
  const hotel = night.selected;
  const mapLink = hotel ? getMapSearchLink(hotel.location, mapPreferences, getMapRegion(plans.get(schedule[dateId]?.planId)?.location)) : null;
  return <section className="day-lodging" aria-label={t('tonightLodging')}>
    <div className="day-lodging-heading"><div><small>{t('tonightLodging')}{night.locked ? ` · ${t('lodgingFixed')}` : ''}</small><strong>{nightLodgingLabel(night, t)}</strong></div>
      <button className="btn btn-small btn-outline" type="button" aria-expanded={choosing} onClick={() => setChoosing(!choosing)}>{t('lodgingChange')}</button>
    </div>
    {hotel && <p>{hotel.location.address}</p>}
    {choosing && <div className="lodging-choice-controls">
      <label><span>{t('lodgingForNight')}</span><select className="input" value={schedule[dateId]?.lodgingId || ''} onChange={(event) => onChoose(event.target.value)}>
        <option value="">{t('lodgingFollowPlan')}</option>
        {[...night.options, ...lodgings.filter((item) => !night.options.some((option) => option.id === item.id))].map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        <option value={NO_LODGING}>{t('lodgingNotNeeded')}</option>
      </select></label>
      {(hotel || night.status === 'none') && <label className="lodging-check"><input type="checkbox" checked={night.locked} onChange={(event) => onLock(event.target.checked)} />{t('lodgingLockNight')}</label>}
      <button className="btn btn-small btn-outline" type="button" onClick={onManage}>{t('lodgingManage')}</button>
    </div>}
    {tasks.length > 0 && <ul className="lodging-tasks">{tasks.map((task, index) => <li key={`${task.type}-${index}`}>
      <span>{lodgingTaskLabel(task, t)}</span>
      {task.type === 'review' && <><small>{task.reservation?.checkIn} → {task.reservation?.checkOut}{task.partial ? ` · ${t('lodgingPartialCancellation')}` : ''}</small><small>{task.reservation?.cancelBy ? t('lodgingCancelDeadline', { time: task.reservation.cancelBy }) : t('lodgingCancelUnknown')}</small></>}
      {task.type === 'book' && <button className="btn btn-small btn-outline" type="button" onClick={() => onBooked(task.hotel!.id)}>{t('lodgingMarkNightBooked')}</button>}
      {task.type === 'review' && <button className="btn btn-small btn-outline" type="button" onClick={onManage}>{t('lodgingManageOrder')}</button>}
    </li>)}</ul>}
    {hotel && <div className="lodging-links">
      {!tasks.some((task) => task.type === 'book') && <span>{t('lodgingBooked')}</span>}
      {mapLink?.url && <a href={mapLink.url} target="_blank" rel="noreferrer">{t('findLodgingOnMap', { provider: t(getMapProviderNameKey(mapLink.provider)) })}</a>}
      {hotel.bookingUrl && <a href={hotel.bookingUrl} target="_blank" rel="noreferrer">{t('lodgingBookingLink')}</a>}
    </div>}
  </section>;
}

export function PlanLodgingEditor({ plan, hotels, onChange, t }: {
  plan: NormalizedPlan; hotels: NormalizedLodging[]; onChange: (plan: NormalizedPlan) => void; t: TranslateFn;
}) {
  const intent = plan.lodging || { mode: 'inherit', optionIds: [], preferredId: '' };
  const update = (next: PlanLodging) => onChange({ ...plan, lodging: next });
  return <details className="constraint-details plan-lodging-editor" open={intent.mode !== 'inherit' || undefined}>
    <summary>{t('lodgingPlanOptions')} · {t(`lodgingMode_${intent.mode}`)}</summary>
    <label><span>{t('lodgingPlanBehavior')}</span><select className="input" value={intent.mode} onChange={(event) => update({ mode: event.target.value as PlanLodging['mode'], optionIds: [], preferredId: '' })}>
      {(['inherit', 'options', 'none'] as const).map((mode) => <option key={mode} value={mode}>{t(`lodgingMode_${mode}`)}</option>)}
    </select></label>
    {intent.mode === 'options' && <>
      <p>{t('lodgingOptionsHelp')}</p>
      {!hotels.length && <p>{t('lodgingAddWithAi')}</p>}
      {hotels.map((hotel) => <label className="lodging-check" key={hotel.id}><input type="checkbox" checked={intent.optionIds.includes(hotel.id)} onChange={(event) => {
        const ids = event.target.checked ? [...intent.optionIds, hotel.id] : intent.optionIds.filter((id) => id !== hotel.id);
        update({ ...intent, optionIds: ids, preferredId: ids.includes(intent.preferredId) ? intent.preferredId : '' });
      }} />{hotel.name}</label>)}
      <label><span>{t('lodgingPreferred')}</span><select className="input" value={intent.preferredId} onChange={(event) => update({ ...intent, preferredId: event.target.value })}>
        <option value="">{t('lodgingChooseLater')}</option>
        {hotels.filter((hotel) => intent.optionIds.includes(hotel.id)).map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
      </select></label>
    </>}
  </details>;
}

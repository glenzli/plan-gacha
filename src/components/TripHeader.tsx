import { useEffect, useId, useRef, type Dispatch, type SetStateAction } from 'react';
import type { NormalizedTripSnapshot } from '../domain/trip';
import type { TranslateFn, VoidFn } from '../types/ui';
import { Icon } from './Icon';

interface TripDisplay {
  name: string;
  meta?: string;
  isEmpty: boolean;
}

interface TripHeaderProps {
  activeTripDisplay: TripDisplay;
  activeTripId: string;
  archivedTripCount: number;
  createNewTrip: () => void;
  driveFeatureEnabled: boolean;
  getTripDisplay: (trip: Partial<NormalizedTripSnapshot>, isCurrentTrip?: boolean) => TripDisplay;
  hasInitializedPlans: boolean;
  onOpenDriveSync: () => void;
  onOpenMapSettings: VoidFn;
  onOpenArchiveLibrary: VoidFn;
  onArchiveTrip: VoidFn;
  onOpenTripEditor: () => void;
  openAiPlanner: (mode: 'replan' | 'generate') => void;
  openChecklist: () => void;
  openLodgingEditor: () => void;
  refreshWeather: VoidFn;
  setTripMenuOpen: Dispatch<SetStateAction<boolean>>;
  switchTrip: (tripId: string) => void;
  t: TranslateFn;
  toggleLanguage: () => void;
  tripMenuDisabled: boolean;
  tripMenuOpen: boolean;
  visibleTrips: NormalizedTripSnapshot[];
  weatherLoading: boolean;
}

export function TripHeader({
  activeTripDisplay,
  activeTripId,
  archivedTripCount,
  createNewTrip,
  driveFeatureEnabled,
  getTripDisplay,
  hasInitializedPlans,
  onOpenDriveSync,
  onOpenMapSettings,
  onOpenArchiveLibrary,
  onArchiveTrip,
  onOpenTripEditor,
  openAiPlanner,
  openChecklist,
  openLodgingEditor,
  refreshWeather,
  setTripMenuOpen,
  switchTrip,
  t,
  toggleLanguage,
  tripMenuDisabled,
  tripMenuOpen,
  visibleTrips,
  weatherLoading,
}: TripHeaderProps) {
  const moreRef = useRef<HTMLDetailsElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setTripMenuOpen(false);
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) moreRef.current.open = false;
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [setTripMenuOpen]);
  useEffect(() => {
    if (tripMenuOpen) {
      const option = menuRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
        || menuRef.current?.querySelector<HTMLElement>('[role="option"]');
      option?.focus({ preventScroll: true });
    }
  }, [tripMenuOpen]);
  return (
    <header className="trip-header">
      <div className="trip-brand">
        <div className="brand-topline">
          <p className="eyebrow">Travel Gacha</p>
          <button className="language-toggle" type="button" onClick={toggleLanguage} title={t('langSwitchTitle')} aria-label={t('langSwitchTitle')}>
            {t('langSwitch')}
          </button>
        </div>
        <h1>{t('appName')}</h1>
      </div>
      <div className="trip-switcher" aria-label={t('tripSwitcher')}>
        <div className="trip-primary-row">
          <div
            className="trip-menu"
            ref={menuRef}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault(); setTripMenuOpen(false); triggerRef.current?.focus();
              } else if (event.key === 'Tab' && tripMenuOpen) {
                triggerRef.current?.focus(); setTripMenuOpen(false);
              } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                if (!tripMenuOpen) { setTripMenuOpen(true); return; }
                const options = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="option"]') || [])];
                const current = options.indexOf(document.activeElement as HTMLElement);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
                  : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
                options[next]?.focus(); options[next]?.scrollIntoView({ block: 'nearest' });
              }
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setTripMenuOpen(false);
            }}
          >
            <button
              className={`trip-menu-trigger ${tripMenuOpen ? 'is-open' : ''} ${activeTripDisplay.isEmpty ? 'is-empty-plan' : ''}`}
              type="button"
              ref={triggerRef}
              aria-controls={tripMenuOpen ? menuId : undefined}
              aria-label={`${t('tripSwitcher')}: ${activeTripDisplay.name}${activeTripDisplay.meta ? ` · ${activeTripDisplay.meta}` : ''}`}
              aria-haspopup="listbox"
              aria-expanded={tripMenuOpen}
              disabled={tripMenuDisabled}
              onClick={() => setTripMenuOpen((current) => !current)}
            >
              <span>{activeTripDisplay.name}</span>
              {activeTripDisplay.meta && <em>{activeTripDisplay.meta}</em>}
            </button>
            {tripMenuOpen && (
              <div className="trip-menu-popover" id={menuId} role="listbox" aria-label={t('tripList')}>
                {visibleTrips.map((trip) => {
                  const isCurrentTrip = trip.id === activeTripId;
                  const tripDisplay = getTripDisplay(trip, isCurrentTrip);

                  return (
                    <button
                      className={`trip-menu-option ${isCurrentTrip ? 'is-selected' : ''} ${tripDisplay.isEmpty ? 'is-empty-plan' : ''}`}
                      key={trip.id}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={isCurrentTrip}
                      onClick={() => { switchTrip(trip.id); triggerRef.current?.focus({ preventScroll: true }); }}
                    >
                      <span>{tripDisplay.name}</span>
                      {tripDisplay.meta && <em>{tripDisplay.meta}</em>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button className="icon-btn mobile-language-toggle" type="button" onClick={toggleLanguage} title={t('langSwitchTitle')} aria-label={t('langSwitchTitle')}>
            {t('langSwitch')}
          </button>
        </div>
        <div className="trip-actions">
          {hasInitializedPlans && <button className="btn btn-small header-action" type="button" onClick={() => openAiPlanner('replan')} title={t('aiReplan')}><Icon name="sparkles" />{t('aiReplan')}</button>}
          <button className="btn btn-small header-action" type="button" onClick={openChecklist} title={t('checklistTitle')}><Icon name="listChecks" />{t('checklistShort')}</button>
          <button className="btn btn-small header-action" type="button" disabled={activeTripDisplay.isEmpty} onClick={openLodgingEditor} title={t('lodgingSection')}><Icon name="home" />{t('lodgingSection')}</button>
          {archivedTripCount > 0 && <button className="btn btn-small header-action archive-library-shortcut" type="button" onClick={onOpenArchiveLibrary} aria-label={t('openArchiveLibrary', { count: archivedTripCount })} title={t('openArchiveLibrary', { count: archivedTripCount })}><Icon name="history" /><span>{t('archived')}</span><em>{archivedTripCount}</em></button>}
          <details className="action-menu" ref={moreRef} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }} onKeyDown={(event) => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
            <summary className="btn btn-small header-action">{t('moreActions')}<Icon name="chevronDown" /></summary>
            <div className="action-menu-panel" onClick={(event) => {
              if (event.target instanceof Element && event.target.closest('button') && moreRef.current) {
                moreRef.current.open = false;
                moreRef.current.querySelector('summary')?.focus({ preventScroll: true });
              }
            }}>
              <button type="button" disabled={activeTripDisplay.isEmpty} onClick={onOpenTripEditor}><Icon name="pencil" />{t('manageTrip')}</button>
              <button type="button" onClick={createNewTrip}><Icon name="plus" />{t('createTrip')}</button>
              {hasInitializedPlans && <button type="button" onClick={refreshWeather} disabled={weatherLoading}><Icon name="refresh" className={weatherLoading ? 'is-spinning' : ''} />{t(weatherLoading ? 'updating' : 'updateWeather')}</button>}
              <button type="button" onClick={onOpenMapSettings}><Icon name="settings" />{t('mapSettingsTitle')}</button>
              {driveFeatureEnabled && <button type="button" onClick={onOpenDriveSync}><Icon name="cloud" />{t('driveSync')}</button>}
              {hasInitializedPlans && <button type="button" onClick={onArchiveTrip}><Icon name="archive" />{t('archive')}</button>}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

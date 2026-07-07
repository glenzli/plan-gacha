import type { Dispatch, SetStateAction } from 'react';
import type { NormalizedTripSnapshot } from '../domain/trip';
import type { TranslateFn } from '../types/ui';
import { Icon } from './Icon';

interface TripDisplay {
  name: string;
  meta?: string;
  isEmpty: boolean;
}

interface TripHeaderProps {
  activeTripDisplay: TripDisplay;
  activeTripId: string;
  createNewTrip: () => void;
  driveFeatureEnabled: boolean;
  driveStorage: unknown;
  getTripDisplay: (trip: Partial<NormalizedTripSnapshot>, isCurrentTrip?: boolean) => TripDisplay;
  hasInitializedPlans: boolean;
  onOpenDriveSync: () => void;
  onOpenTripEditor: () => void;
  openAiPlanner: (mode: 'replan' | 'generate') => void;
  openChecklist: () => void;
  openLodgingEditor: () => void;
  setTripMenuOpen: Dispatch<SetStateAction<boolean>>;
  switchTrip: (tripId: string) => void;
  t: TranslateFn;
  toggleLanguage: () => void;
  tripMenuDisabled: boolean;
  tripMenuOpen: boolean;
  visibleTrips: NormalizedTripSnapshot[];
}

export function TripHeader({
  activeTripDisplay,
  activeTripId,
  createNewTrip,
  driveFeatureEnabled,
  driveStorage,
  getTripDisplay,
  hasInitializedPlans,
  onOpenDriveSync,
  onOpenTripEditor,
  openAiPlanner,
  openChecklist,
  openLodgingEditor,
  setTripMenuOpen,
  switchTrip,
  t,
  toggleLanguage,
  tripMenuDisabled,
  tripMenuOpen,
  visibleTrips,
}: TripHeaderProps) {
  return (
    <header className="trip-header">
      <div className="trip-brand">
        <div className="brand-topline">
          <p className="eyebrow">Travel Gacha</p>
          <button className="language-toggle" type="button" onClick={toggleLanguage} title={t('langSwitchTitle')}>
            {t('langSwitch')}
          </button>
        </div>
        <h1>{t('appName')}</h1>
      </div>
      <div className="trip-switcher" aria-label={t('tripSwitcher')}>
        <div className="trip-primary-row">
          <div
            className="trip-menu"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setTripMenuOpen(false);
            }}
          >
            <button
              className={`trip-menu-trigger ${tripMenuOpen ? 'is-open' : ''} ${activeTripDisplay.isEmpty ? 'is-empty-plan' : ''}`}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={tripMenuOpen}
              disabled={tripMenuDisabled}
              onClick={() => setTripMenuOpen((current) => !current)}
            >
              <span>{activeTripDisplay.name}</span>
              {activeTripDisplay.meta && <em>{activeTripDisplay.meta}</em>}
            </button>
            {tripMenuOpen && (
              <div className="trip-menu-popover" role="listbox" aria-label={t('tripList')}>
                {visibleTrips.map((trip) => {
                  const isCurrentTrip = trip.id === activeTripId;
                  const tripDisplay = getTripDisplay(trip, isCurrentTrip);

                  return (
                    <button
                      className={`trip-menu-option ${isCurrentTrip ? 'is-selected' : ''} ${tripDisplay.isEmpty ? 'is-empty-plan' : ''}`}
                      key={trip.id}
                      type="button"
                      role="option"
                      aria-selected={isCurrentTrip}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => switchTrip(trip.id)}
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
          {hasInitializedPlans && (
            <button
              className="icon-btn ai-replan-btn"
              type="button"
              onClick={() => openAiPlanner('replan')}
              aria-label={t('aiReplan')}
              title={t('aiReplan')}
            >
              <Icon name="sparkles" />
            </button>
          )}
          <button className="icon-btn checklist-btn" type="button" onClick={openChecklist} aria-label={t('checklistTitle')} title={t('checklistTitle')}>
            <Icon name="listChecks" />
          </button>
          <button
            className="icon-btn lodging-shortcut-btn"
            type="button"
            disabled={activeTripDisplay.isEmpty}
            onClick={openLodgingEditor}
            aria-label={activeTripDisplay.isEmpty ? t('createOrImportFirst') : t('lodgingSection')}
            title={activeTripDisplay.isEmpty ? t('createOrImportFirst') : t('lodgingSection')}
          >
            <Icon name="home" />
          </button>
          {driveFeatureEnabled && Boolean(driveStorage) && (
            <button className="icon-btn drive-sync-btn" type="button" onClick={onOpenDriveSync} aria-label={t('driveSync')} title={t('driveSync')}>
              <Icon name="cloud" />
            </button>
          )}
          <button
            className="icon-btn trip-edit-btn"
            type="button"
            disabled={activeTripDisplay.isEmpty}
            onClick={onOpenTripEditor}
            aria-label={activeTripDisplay.isEmpty ? t('noEditablePlan') : t('editPlan')}
            title={activeTripDisplay.isEmpty ? t('createOrImportFirst') : t('editPlan')}
          >
            <Icon name="pencil" />
          </button>
          <button className="icon-btn" type="button" onClick={createNewTrip} aria-label={t('createTrip')}>
            <Icon name="plus" />
          </button>
        </div>
      </div>
    </header>
  );
}

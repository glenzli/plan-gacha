import { Fragment, useState } from 'react';
import {
  BookingStatus,
  formatStopTransfer,
  formatStopTransferDeparture,
  type BookingType,
  type NormalizedPlan,
  type NormalizedLocation,
} from '../domain/plan';
import {
  isPlaceBlacklisted,
  isStopAbandoned,
  type NormalizedPlaceFeedback,
  type NormalizedStopOutcomes,
} from '../domain/trip';
import {
  getMapDirectionsLink,
  getMapProvider,
  getMapRegion,
  getMapSearchLink,
  getMapProviderNameKey,
  getPreferredMapRouteMode,
  getLocationCopyText,
  type MapRouteMode,
} from '../domain/locationLinks';
import type { MapPreferences } from '../domain/mapPreferences';
import {
  getWeatherIconLabel,
} from '../domain/weather';
import { Icon } from './Icon';
import type { TranslateFn } from '../types/ui';

interface WeatherIconProps {
  condition?: string;
  level?: string;
}

interface PlanStopsProps {
  plan?: NormalizedPlan | null;
  t: TranslateFn;
  language: string;
  onCopyPlace: (copyValue: string) => void;
  dateId?: string;
  onToggleStopAbandoned?: (dateId: string, planId: string, stopId: string, stopTitle: string) => void;
  onTogglePlaceBlacklist?: (location: NormalizedLocation) => void;
  placeFeedback?: NormalizedPlaceFeedback;
  stopOutcomes?: NormalizedStopOutcomes;
  readOnly?: boolean;
  mapPreferences: MapPreferences;
}

interface BookingTypeMeta {
  pending: string;
  done: string;
  link: string;
  doneAction: string;
}

interface PlanBookingsProps {
  plan?: NormalizedPlan | null;
  t: TranslateFn;
  language: string;
  getBookingTypeMeta: (bookingType: BookingType | string, language: string) => BookingTypeMeta;
  onUpdateBookingStatus?: (planId: string, bookingId: string, nextStatus: BookingStatus) => void;
  readOnly?: boolean;
}

interface PlanNotesProps {
  plan?: NormalizedPlan | null;
  t: TranslateFn;
}

export function WeatherIcon({ condition = 'unknown', level = 'unknown' }: WeatherIconProps) {
  const label = getWeatherIconLabel(condition);
  const normalizedCondition = label === '?' ? 'unknown' : condition;

  return (
    <span className={`weather-icon condition-${normalizedCondition} level-${level}`} aria-hidden="true">
      {label}
    </span>
  );
}

export function PlanStops({
  plan,
  t,
  language,
  onCopyPlace,
  dateId,
  onToggleStopAbandoned,
  onTogglePlaceBlacklist,
  placeFeedback = {},
  stopOutcomes = {},
  readOnly = false,
  mapPreferences,
}: PlanStopsProps) {
  const [openRouteStopId, setOpenRouteStopId] = useState<string | null>(null);
  if (!plan?.stops.length) return null;

  return (
    <ol className="stop-list" aria-label={t('stopsAria', { name: plan.name })}>
      {plan.stops.map((stop, index) => {
        const previousStop = index > 0 ? plan.stops[index - 1] : null;
        const preferredRouteMode = getPreferredMapRouteMode(stop.transferFromPrevious);
        const routeModes: MapRouteMode[] = preferredRouteMode
          ? [preferredRouteMode, ...(['transit', 'driving', 'walking'] as MapRouteMode[]).filter((mode) => mode !== preferredRouteMode)]
          : ['transit', 'driving', 'walking'];
        const via = stop.transferFromPrevious?.via || [];
        const routeLinks = previousStop
          ? routeModes.map((mode) => ({ mode, ...getMapDirectionsLink(previousStop.location, stop.location, mapPreferences, mode, via) }))
          : [];
        const directRoute = preferredRouteMode
          ? routeLinks.find(({ mode, url }) => mode === preferredRouteMode && Boolean(url))
          : undefined;
        const directRouteLabel = directRoute
          ? `${t('openRouteInMaps')} · ${t(`routeMode${directRoute.mode.charAt(0).toUpperCase()}${directRoute.mode.slice(1)}`)} · ${t(getMapProviderNameKey(directRoute.provider))}`
          : '';
        const selectedProvider = getMapProvider(stop.location, mapPreferences);
        const otherMainlandProvider = selectedProvider === 'amap' ? 'baidu' : selectedProvider === 'baidu' ? 'amap' : null;
        const routeAlternatives = previousStop && otherMainlandProvider
          && getMapRegion(previousStop.location) === 'mainlandChina'
          && getMapRegion(stop.location) === 'mainlandChina'
          ? routeModes.map((mode) => ({ mode, ...getMapDirectionsLink(
            previousStop.location, stop.location,
            { ...mapPreferences, mainlandChina: otherMainlandProvider }, mode, via,
          ) })).filter((link) => Boolean(link.url))
          : [];
        const hasRoute = [...routeAlternatives, ...routeLinks].some((link) => Boolean(link.url));
        const hasMissingCoordinateRoute = selectedProvider === 'amap' && !routeLinks.some(({ url }) => Boolean(url)) && via.length <= 1;
        const hasUnsupportedWaypoints = via.length > 0 && !routeLinks.some(({ url }) => Boolean(url)) && !hasMissingCoordinateRoute;
        const mapsLink = getMapSearchLink(stop.location, mapPreferences);
        const mapLabel = mapsLink.provider === 'amap' ? t('openInAmap')
          : mapsLink.provider === 'baidu' ? t('openInBaidu') : t('openInMaps');
        const showRouteProviders = routeAlternatives.length > 0;
        const copyValue = getLocationCopyText(stop.location);
        const transferText = formatStopTransfer(stop.transferFromPrevious);
        const transferDepartureText = formatStopTransferDeparture(stop.transferFromPrevious, stop.time, language);
        const metaSeparator = language === 'en' ? ': ' : '：';
        const previousStopName = previousStop?.title || previousStop?.location?.label || '';
        const currentStopName = stop.title || stop.location?.label || '';
        const showTransfer = Boolean(previousStop && (transferText || transferDepartureText));
        const blacklisted = isPlaceBlacklisted(stop.location, placeFeedback);
        const abandoned = Boolean(dateId && isStopAbandoned(dateId, plan.id, stop.id, stopOutcomes));

        return (
          <Fragment key={stop.id}>
            {showTransfer && (
              <li className="stop-item stop-transfer-item">
                <span className="stop-time stop-transfer-time">
                  {transferDepartureText}
                </span>
                <span className="stop-detail stop-transfer-detail">
                  <span className="stop-commute" aria-label={`${previousStopName} ${t('transferLabel')} ${currentStopName}`}>
                    <Icon name="route" />
                    <span className="stop-commute-route">
                      <span>{previousStopName}</span>
                      <span aria-hidden="true">-&gt;</span>
                      <span>{currentStopName}</span>
                    </span>
                    {transferText && <strong>{transferText}</strong>}
                  </span>
                </span>
              </li>
            )}
            <li className={`stop-item ${abandoned ? 'is-abandoned-stop' : ''} ${blacklisted ? 'is-blacklisted' : ''}`}>
              <span className="stop-time">{stop.time || t('flexible')}</span>
              <span className="stop-detail">
                <span className="stop-title-row">
                  <strong>{stop.title}</strong>
                  {abandoned && <span className="stop-outcome-badge">{t('stopAbandoned')}</span>}
                  {blacklisted && <span className="place-feedback-badge">{t('placeBlacklisted')}</span>}
                </span>
                <span className="stop-location">
                  <span className="stop-location-text">
                    <span className="stop-location-line">
                      <span className="stop-location-label">{stop.location.label}</span>
                      {stop.openingHours && (
                        <span className="stop-hours-inline">
                          <Icon name="clock" />
                          <span>{t('openingHours')}{metaSeparator}{stop.openingHours}</span>
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="stop-location-actions">
                    {previousStop && (
                      <span className="stop-route-menu">
                        {directRoute ? (
                          <a
                            className="stop-location-action"
                            href={directRoute.url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={directRouteLabel}
                            title={directRouteLabel}
                          >
                            <Icon name="route" />
                          </a>
                        ) : (
                          <button
                            className="stop-location-action"
                            type="button"
                            aria-label={t('openRouteInMaps')}
                            title={t('openRouteInMaps')}
                            aria-expanded={openRouteStopId === stop.id}
                            onClick={() => setOpenRouteStopId(openRouteStopId === stop.id ? null : stop.id)}
                          >
                            <Icon name="route" />
                          </button>
                        )}
                        {directRoute && <button
                          className="stop-location-action stop-route-options-trigger"
                          type="button"
                          aria-label={t('chooseOtherRoute')}
                          title={t('chooseOtherRoute')}
                          aria-expanded={openRouteStopId === stop.id}
                          onClick={() => setOpenRouteStopId(openRouteStopId === stop.id ? null : stop.id)}
                        >
                          <Icon name="chevronDown" />
                        </button>}
                        {openRouteStopId === stop.id && <span className="stop-route-options">
                          {hasRoute ? <>
                            {routeLinks.filter(({ url }) => Boolean(url)).map(({ mode, provider, url }) => (
                              <a key={`${provider}-${mode}`} href={url} target="_blank" rel="noreferrer" onClick={() => setOpenRouteStopId(null)}>
                                {t(`routeMode${mode.charAt(0).toUpperCase()}${mode.slice(1)}`)}{showRouteProviders && ` · ${t(getMapProviderNameKey(provider))}`}
                              </a>
                            ))}
                            {routeAlternatives.map(({ mode, provider, url }) => (
                              <a key={`${provider}-${mode}`} href={url} target="_blank" rel="noreferrer" onClick={() => setOpenRouteStopId(null)}>
                                {t(`routeMode${mode.charAt(0).toUpperCase()}${mode.slice(1)}`)} · {t(getMapProviderNameKey(provider))}
                              </a>
                            ))}
                            {hasMissingCoordinateRoute && <span>{t('mapRouteNeedsCoordinates')}</span>}
                            {hasUnsupportedWaypoints && <span>{t('mapRouteWaypointsUnsupported')}</span>}
                          </> : (
                            <span>{t(hasUnsupportedWaypoints ? 'mapRouteWaypointsUnsupported' : 'mapRouteNeedsCoordinates')}</span>
                          )}
                        </span>}
                      </span>
                    )}
                    {mapsLink.url && (
                      <a
                        className="stop-location-action"
                        href={mapsLink.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={mapLabel}
                        title={mapLabel}
                      >
                        <Icon name="mapPin" />
                      </a>
                    )}
                    {copyValue && (
                      <button
                        className="stop-location-action"
                        type="button"
                        onClick={() => onCopyPlace(copyValue)}
                        aria-label={t('copyPlace')}
                        title={t('copyPlace')}
                      >
                        <Icon name="copy" />
                      </button>
                    )}
                    {!readOnly && dateId && onToggleStopAbandoned && (
                      <button
                        className={`stop-location-action stop-abandon-action ${abandoned ? 'is-active' : ''}`}
                        type="button"
                        onClick={() => onToggleStopAbandoned(dateId, plan.id, stop.id, stop.title)}
                        aria-label={abandoned ? t('restoreAbandonedStop') : t('abandonStop')}
                        title={abandoned ? t('restoreAbandonedStop') : t('abandonStop')}
                      >
                          <Icon name="mapPinX" />
                      </button>
                    )}
                    {!readOnly && onTogglePlaceBlacklist && (
                      <button
                        className={`stop-location-action place-blacklist-action ${blacklisted ? 'is-active' : ''}`}
                        type="button"
                        onClick={() => onTogglePlaceBlacklist(stop.location)}
                        aria-label={blacklisted ? t('removePlaceBlacklist') : t('blacklistPlace')}
                        title={blacklisted ? t('removePlaceBlacklist') : t('blacklistPlace')}
                      >
                        <Icon name="ban" />
                      </button>
                    )}
                  </span>
                </span>
                {stop.note && <em>{stop.note}</em>}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

export function PlanBookings({
  plan,
  t,
  language,
  getBookingTypeMeta,
  onUpdateBookingStatus,
  readOnly = false,
}: PlanBookingsProps) {
  if (!plan?.bookings.length) return null;

  return (
    <div className="booking-list" aria-label={t('bookingAria', { name: plan.name })}>
      {plan.bookings.map((booking) => {
        const meta = getBookingTypeMeta(booking.type, language);
        const isDone = booking.status === BookingStatus.Done;
        const isNone = booking.status === BookingStatus.None;
        const statusText = isNone ? t('noActionNeeded') : isDone ? meta.done : meta.pending;
        const nextStatus = isDone ? BookingStatus.Pending : BookingStatus.Done;
        const linkUrl = isDone ? booking.cancelUrl || booking.url : booking.url;
        const linkLabel = isDone && booking.cancelUrl ? t('manage') : meta.link;

        return (
          <div className={`booking-item status-${booking.status}`} key={booking.id}>
            <div className="booking-main">
              <div className="booking-title-row">
                <strong>{booking.title}</strong>
                <span className={`booking-status status-${booking.status}`}>{statusText}</span>
              </div>
              {booking.address && <span className="booking-address">{booking.address}</span>}
              {booking.note && <em>{booking.note}</em>}
            </div>
            <div className="booking-actions">
              {linkUrl && (
                <a className="booking-link" href={linkUrl} target="_blank" rel="noreferrer">
                  {linkLabel}
                </a>
              )}
              {!readOnly && !isNone && (
                <button
                  className="booking-toggle"
                  type="button"
                  onClick={() => onUpdateBookingStatus?.(plan.id, booking.id, nextStatus)}
                >
                  {isDone ? t('undo') : meta.doneAction}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PlanNotes({ plan, t }: PlanNotesProps) {
  if (!plan || (!plan.reminders.length && !plan.tips.length)) return null;

  return (
    <div className="plan-notes">
      {plan.reminders.length > 0 && (
        <div className="plan-note plan-reminders" aria-label={t('reminders')}>
          <strong>{t('reminders')}</strong>
          <ul>
            {plan.reminders.map((item) => (
              <li key={item.id}>
                {item.time && <span className="plan-note-time">{item.time}</span>}
                <span className="plan-note-content">
                  {item.text && <em>{item.text}</em>}
                  {item.links?.length > 0 && (
                    <span className="plan-note-links">
                      {item.links.map((link) => (
                        <a key={link.url} className="plan-note-link" href={link.url} target="_blank" rel="noreferrer">
                          {link.label}
                        </a>
                      ))}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {plan.tips.length > 0 && (
        <div className="plan-note plan-tips" aria-label="Tips">
          <strong>Tips</strong>
          <ul>
            {plan.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

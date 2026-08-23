import type { NormalizedTripSnapshot } from '../domain/trip';
import type { TranslateFn } from '../types/ui';

interface ArchivedTripRowsProps {
  archivedTrips: NormalizedTripSnapshot[];
  formatTripRange: (startDateStr: string, tripDays: number, language: string) => string;
  language: string;
  onRestore: (tripId: string) => void;
  onView: (tripId: string) => void;
  showHeading?: boolean;
  t: TranslateFn;
}

export function ArchivedTripRows({
  archivedTrips,
  formatTripRange,
  language,
  onRestore,
  onView,
  showHeading = true,
  t,
}: ArchivedTripRowsProps) {
  if (!archivedTrips.length) return null;

  return (
    <div className="archived-trip-list">
      {showHeading && <strong>{t('archived')}</strong>}
      {archivedTrips.map((trip) => (
        <div className="archived-trip-row" key={trip.id}>
          <div className="archived-trip-copy">
            <strong>{trip.name}</strong>
            <span>{formatTripRange(trip.startDateStr, trip.tripDays, language)}</span>
          </div>
          <div className="archived-trip-actions">
            <button className="btn btn-small btn-outline" type="button" onClick={() => onView(trip.id)}>
              {t('view')}
            </button>
            <button className="btn btn-small btn-outline" type="button" onClick={() => onRestore(trip.id)}>
              {t('restore')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

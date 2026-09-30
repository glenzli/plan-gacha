import { useModalDialog } from '../hooks/useModalDialog';
import type { NormalizedTripSnapshot } from '../domain/trip';
import type { TranslateFn } from '../types/ui';
import { ArchivedTripRows } from './ArchivedTripRows';
import { Icon } from './Icon';

interface ArchiveLibraryModalProps {
  archivedTrips: NormalizedTripSnapshot[];
  formatTripRange: (startDateStr: string, tripDays: number, language: string) => string;
  language: string;
  onClose: () => void;
  onRestore: (tripId: string) => void;
  onView: (tripId: string) => void;
  t: TranslateFn;
}

export function ArchiveLibraryModal({
  archivedTrips,
  formatTripRange,
  language,
  onClose,
  onRestore,
  onView,
  t,
}: ArchiveLibraryModalProps) {
  const dialogRef = useModalDialog(onClose);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        aria-labelledby="archive-library-title"
        aria-modal="true"
        className="modal archive-library-modal"
        role="dialog"
        ref={dialogRef} onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-header">
          <div>
            <p className="eyebrow">{t('archive')}</p>
            <h2 id="archive-library-title">{t('archiveLibraryTitle')}</h2>
            <span className="archive-library-description">{t('archiveLibraryDescription')}</span>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={t('close')} title={t('close')}>
            <Icon name="x" />
          </button>
        </div>

        <ArchivedTripRows
          archivedTrips={archivedTrips}
          formatTripRange={formatTripRange}
          language={language}
          onRestore={onRestore}
          onView={onView}
          showHeading={false}
          t={t}
        />
      </div>
    </div>
  );
}

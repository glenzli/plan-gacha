import { useModalDialog } from '../hooks/useModalDialog';
import type { TripImportPreview } from '../domain/tripImport';
import type { TranslateFn } from '../types/ui';
import { LodgingImpactList } from './LodgingPanel';

export function ImportPreviewModal({ preview, warnings, t, onConfirm, onClose }: {
  preview: TripImportPreview; warnings: string[]; t: TranslateFn; onConfirm: () => void; onClose: () => void;
}) {
  const dialog = useModalDialog(onClose);
  return <div className="modal-overlay import-preview-overlay" onClick={onClose}>
    <div ref={dialog} tabIndex={-1} className="modal import-preview-modal" role="dialog" aria-modal="true" aria-labelledby="import-preview-title" onClick={(event) => event.stopPropagation()} >
      <h2 id="import-preview-title">{t('importPreviewTitle')}</h2>
      <p>{t('importPreviewSummary', { plans: preview.planChanges.length, hotels: preview.lodgingChanges.length, dates: preview.scheduleChanges.length })}</p>
      <div className="import-preview-body">
        {preview.planChanges.map((plan) => <p key={plan.id}>{t('itineraryName')} · {plan.name}</p>)}
        {preview.lodgingChanges.map((hotel) => <p key={hotel.id}>{t('lodgingProposedHotels')} · {hotel.name} · {hotel.location.address}</p>)}
        {preview.scheduleChanges.map(([date, entry]) => <p key={date}>{date} · {preview.plans.find((plan) => plan.id === entry.planId)?.name || t('unplannedToday')}</p>)}
        <LodgingImpactList impacts={preview.lodgingImpacts} t={t} />
        {warnings.length > 0 && <ul>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
      </div>
      <div className="modal-actions"><button className="btn btn-outline" type="button" onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" type="button" onClick={onConfirm}>{t('confirmImportChanges')}</button></div>
    </div>
  </div>;
}

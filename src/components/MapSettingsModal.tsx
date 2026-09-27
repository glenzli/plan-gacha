import { type MapPreferences, type MapProvider, type MapRegion } from '../domain/mapPreferences';
import type { TranslateFn } from '../types/ui';
import { Icon } from './Icon';

const REGIONS: { key: MapRegion; label: string }[] = [
  { key: 'mainlandChina', label: 'mapRegionMainlandChina' },
  { key: 'otherRegions', label: 'mapRegionOther' },
  { key: 'unknown', label: 'mapRegionUnknown' },
];

interface MapSettingsModalProps {
  preferences: MapPreferences;
  onChange: (region: MapRegion, provider: MapProvider) => void;
  onClose: () => void;
  t: TranslateFn;
}

export function MapSettingsModal({ preferences, onChange, onClose, t }: MapSettingsModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        aria-labelledby="map-settings-title"
        aria-modal="true"
        className="modal map-settings-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-header">
          <div>
            <p className="eyebrow">{t('settings')}</p>
            <h2 id="map-settings-title">{t('mapSettingsTitle')}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={t('close')}>
            <Icon name="x" />
          </button>
        </div>
        <p className="map-settings-help">{t('mapSettingsHelp')}</p>
        <div className="map-settings-fields">
          {REGIONS.map(({ key, label }) => (
            <label key={key}>
              <span>{t(label)}</span>
              <select
                className="input"
                value={preferences[key]}
                onChange={(event) => onChange(key, event.target.value as MapProvider)}
              >
                <option value="google">Google Maps</option>
                <option value="amap">{t('amapName')}</option>
                {key === 'mainlandChina' && <option value="recommended">{t('recommendedMapsName')}</option>}
              </select>
            </label>
          ))}
        </div>
        <p className="map-settings-note">{t('mapSettingsNote')}</p>
      </div>
    </div>
  );
}

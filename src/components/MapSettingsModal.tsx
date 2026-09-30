import { useModalDialog } from '../hooks/useModalDialog';
import { type MapPreferences } from '../domain/mapPreferences';
import type { TranslateFn } from '../types/ui';
import { Icon } from './Icon';

interface MapSettingsModalProps {
  preferences: MapPreferences;
  onChange: (provider: MapPreferences['mainlandChina']) => void;
  onClose: () => void;
  t: TranslateFn;
}

export function MapSettingsModal({ preferences, onChange, onClose, t }: MapSettingsModalProps) {
  const dialogRef = useModalDialog(onClose);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        aria-labelledby="map-settings-title"
        aria-modal="true"
        className="modal map-settings-modal"
        role="dialog"
        ref={dialogRef} onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-header">
          <div>
            <p className="eyebrow">{t('settings')}</p>
            <h2 id="map-settings-title">{t('mapSettingsTitle')}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={t('close')} title={t('close')}>
            <Icon name="x" />
          </button>
        </div>
        <p className="map-settings-help">{t('mapSettingsHelp')}</p>
        <div className="map-settings-fields">
          <label>
            <span>{t('mapRegionMainlandChina')}</span>
            <select
              className="input"
              value={preferences.mainlandChina}
              onChange={(event) => onChange(event.target.value as MapPreferences['mainlandChina'])}
            >
              <option value="amap">{t('amapName')}</option>
              <option value="baidu">{t('baiduMapsName')}</option>
            </select>
          </label>
        </div>
        <p className="map-settings-note">{t('mapSettingsNote')}</p>
      </div>
    </div>
  );
}

import { BufferedTripNameField } from './BufferedTripNameField';
import { addDays } from '../domain/date';
import type { EditorTab, TranslateFn } from '../types/ui';

interface TripSettingsPanelProps {
  activeTripId: string;
  editorTab: EditorTab;
  endDateStr: string;
  onChangeEndDate: (dateId: string) => void;
  onChangeStartDate: (dateId: string) => void;
  onCommitTripName: (name: string) => void;
  onSelectTab: (tab: EditorTab) => void;
  startDateStr: string;
  t: TranslateFn;
  tripDays: number;
  tripName: string;
}

export function TripSettingsPanel({
  activeTripId,
  editorTab,
  endDateStr,
  onChangeEndDate,
  onChangeStartDate,
  onCommitTripName,
  onSelectTab,
  startDateStr,
  t,
  tripDays,
  tripName,
}: TripSettingsPanelProps) {
  return (
    <div className="trip-editor-top">
      <div className="trip-editor-grid">
        <BufferedTripNameField key={`${activeTripId}-${tripName}`} value={tripName} t={t} onCommit={onCommitTripName} />
        <div className="date-range-field">
          <span>{t('dateRange')}</span>
          <div className="date-range-inputs">
            <label>
              <em>{t('start')}</em>
              <input
                className="input"
                type="date"
                value={startDateStr}
                onChange={(event) => onChangeStartDate(event.target.value)}
              />
            </label>
            <label>
              <em>{t('end')}</em>
              <input
                className="input"
                type="date"
                min={startDateStr}
                max={addDays(startDateStr, 29)}
                value={endDateStr}
                onChange={(event) => onChangeEndDate(event.target.value)}
              />
            </label>
            <strong>{t('daysCount', { count: tripDays })}</strong>
          </div>
        </div>
      </div>

      <div className="editor-tabs" role="tablist" aria-label={t('editPlan')} onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
        const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[next]?.focus(); tabs[next]?.click();
      }}>
        <button
          className={editorTab === 'itinerary' ? 'is-active' : ''}
          type="button"
          role="tab"
          aria-selected={editorTab === 'itinerary'}
          tabIndex={editorTab === 'itinerary' ? 0 : -1}
          id="trip-editor-tab-itinerary"
          aria-controls="trip-editor-itinerary"
          onClick={() => onSelectTab('itinerary')}
        >
          {t('itinerary')}
        </button>
        <button
          className={editorTab === 'lodging' ? 'is-active' : ''}
          type="button"
          role="tab"
          aria-selected={editorTab === 'lodging'}
          tabIndex={editorTab === 'lodging' ? 0 : -1}
          id="trip-editor-tab-lodging"
          aria-controls="trip-editor-lodging"
          onClick={() => onSelectTab('lodging')}
        >
          {t('lodgingSection')}
        </button>
      </div>
    </div>
  );
}

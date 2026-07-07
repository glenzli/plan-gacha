import { Icon } from './Icon';
import { RiskGroup } from './RiskPanels';
import type { RiskGroup as RiskGroupData } from '../domain/risk';
import type { TranslateFn, VoidFn } from '../types/ui';
import type { WeatherDataMap } from '../types/weatherData';

interface WeatherOverview {
  summary: string;
}

interface StatusPanelProps {
  riskGroups: RiskGroupData[];
  t: TranslateFn;
  language: string;
  translateRiskTitle: (title: string, language: string) => string;
  onEditLodging: VoidFn;
  refreshWeather: VoidFn;
  weatherLoading: boolean;
  weatherOverview: WeatherOverview;
  weatherError: string;
  weatherData: WeatherDataMap;
}

export function StatusPanel({
  riskGroups,
  t,
  language,
  translateRiskTitle,
  onEditLodging,
  refreshWeather,
  weatherLoading,
  weatherOverview,
  weatherError,
  weatherData,
}: StatusPanelProps) {
  const weatherEntries = Object.entries(weatherData);

  return (
    <aside className="side-panel status-panel">
      <div className="panel-header">
        <h2>{t('warnings')}</h2>
      </div>

      <div className="risk-list">
        {riskGroups.length === 0 && <div className="empty-state">{t('noBlockingRisks')}</div>}
        {riskGroups.slice(0, 8).map((group) => (
          <RiskGroup
            key={group.title}
            group={group}
            t={t}
            language={language}
            translateRiskTitle={translateRiskTitle}
            onEditLodging={onEditLodging}
          />
        ))}
      </div>

      <div className="workflow-panel">
        <div className="panel-header compact">
          <h2>{t('weather')}</h2>
          <button
            className="icon-btn weather-refresh-btn"
            type="button"
            onClick={refreshWeather}
            disabled={weatherLoading}
            aria-label={weatherLoading ? t('updating') : t('updateWeather')}
            title={weatherLoading ? t('updating') : t('updateWeather')}
          >
            <Icon name="refresh" className={weatherLoading ? 'is-spinning' : ''} />
          </button>
        </div>
        <div className="weather-overview">
          <p>{weatherOverview.summary}</p>
        </div>
        {weatherError && <div className="risk-item warning"><p>{weatherError}</p></div>}
        {weatherEntries.length === 0 ? (
          <p className="weather-source-empty">{t('noWeather')}</p>
        ) : (
          <details className="weather-source-panel">
            <summary>
              <span>{t('weatherSourcesCount', { count: weatherEntries.length })}</span>
              <span className="weather-source-toggle">
                <span className="details-closed">{t('viewWeatherSources')}</span>
                <span className="details-open">{t('hideWeatherSources')}</span>
                <span className="details-chevron" aria-hidden="true" />
              </span>
            </summary>
            <div className="weather-source-list">
              {weatherEntries.map(([key, value]) => (
                <span key={key}>{String(value.label || key)}</span>
              ))}
            </div>
          </details>
        )}
      </div>
    </aside>
  );
}

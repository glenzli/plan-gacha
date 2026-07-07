import type { RiskGroup as RiskGroupData } from '../domain/risk';
import type { TranslateFn, VoidFn } from '../types/ui';

interface RiskGroupProps {
  group: RiskGroupData;
  t: TranslateFn;
  language: string;
  translateRiskTitle: (title: string, language: string) => string;
  onEditLodging: VoidFn;
}

export function RiskGroup({
  group,
  t,
  language,
  translateRiskTitle,
  onEditLodging,
}: RiskGroupProps) {
  const isLodgingRisk = group.title === '住宿信息未填写';

  return (
    <div className={`risk-item risk-group ${group.level}`} key={group.title}>
      <div className="risk-group-head">
        <strong>{translateRiskTitle(group.title, language)}</strong>
        {isLodgingRisk && (
          <button className="btn btn-small btn-outline" type="button" onClick={onEditLodging}>
            {t('editLodging')}
          </button>
        )}
      </div>
      <ul>
        {group.items.slice(0, 6).map((item) => (
          <li key={item}>{item}</li>
        ))}
        {group.items.length > 6 && <li>{t('moreItems', { count: group.items.length - 6 })}</li>}
      </ul>
    </div>
  );
}

export function MobileRiskPanel({
  riskGroups,
  mobileRisksOpen,
  onToggle,
  t,
  language,
  translateRiskTitle,
  onEditLodging,
}: {
  riskGroups: RiskGroupData[];
  mobileRisksOpen: boolean;
  onToggle: VoidFn;
  t: TranslateFn;
  language: string;
  translateRiskTitle: (title: string, language: string) => string;
  onEditLodging: VoidFn;
}) {
  const primaryRisk = riskGroups[0];
  const summaryTitle = mobileRisksOpen
    ? t('riskDetail')
    : riskGroups.length
      ? `${t('warnings')} (${riskGroups.length})`
      : t('noWarnings');

  return (
    <div className={`mobile-risk-panel ${primaryRisk ? `level-${primaryRisk.level}` : 'is-clear'}`}>
      <button
        className={`mobile-risk-summary ${mobileRisksOpen ? 'is-open' : ''}`}
        type="button"
        aria-expanded={mobileRisksOpen}
        onClick={onToggle}
      >
        <strong>{summaryTitle}</strong>
        <em>{mobileRisksOpen ? t('collapse') : t('expand')}</em>
      </button>

      {mobileRisksOpen && (
        <div className="risk-list mobile-risk-list">
          {riskGroups.length === 0 && <div className="empty-state">{t('noBlockingRisks')}</div>}
          {riskGroups.slice(0, 6).map((group) => (
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
      )}
    </div>
  );
}

import type { RiskActionTarget, RiskGroup as RiskGroupData } from '../domain/risk';
import type { TranslateFn, VoidFn } from '../types/ui';

interface RiskGroupProps {
  group: RiskGroupData;
  t: TranslateFn;
  language: string;
  translateRiskTitle: (title: string, language: string) => string;
  onEditLodging: VoidFn;
  onOpenRisk: (target: RiskActionTarget) => void;
  onOpenChecklist: VoidFn;
}

const PREPARATION_RISK_TITLES = new Set([
  '旅行清单未完成',
  '住宿信息未填写',
  '住宿待处理',
]);

function getRiskTone(group?: RiskGroupData) {
  if (!group) return 'clear';
  return PREPARATION_RISK_TITLES.has(group.title) ? 'preparation' : group.level;
}

function RiskItemLabel({ item }: { item: string }) {
  const parts = item.split(' · ');
  const hasDatePrefix = /^D\d+$/.test(parts[0] || '') && parts.length >= 3;

  if (!hasDatePrefix) return <span className="risk-item-label">{item}</span>;

  return (
    <>
      <span className="risk-item-date">{parts.slice(0, 2).join(' · ')}</span>
      <span className="risk-item-label">{parts.slice(2).join(' · ')}</span>
    </>
  );
}

export function RiskGroup({
  group,
  t,
  language,
  translateRiskTitle,
  onEditLodging,
  onOpenRisk,
  onOpenChecklist,
}: RiskGroupProps) {
  const isLodgingRisk = group.title === '住宿信息未填写' || group.title === '住宿待处理';
  const isChecklistRisk = group.title === '旅行清单未完成';
  const tone = getRiskTone(group);

  return (
    <div className={`risk-item risk-group ${group.level} tone-${tone}`} key={group.title}>
      <div className="risk-group-head">
        <strong>{translateRiskTitle(group.title, language)}</strong>
        {isLodgingRisk && (
          <button className="btn btn-small btn-outline" type="button" onClick={onEditLodging}>
            {t(group.title === '住宿待处理' ? 'lodgingManage' : 'editLodging')}
          </button>
        )}
        {isChecklistRisk && <button className="btn btn-small btn-outline" type="button" onClick={onOpenChecklist}>{t('viewChecklist')}</button>}
      </div>
      <ul>
        {group.items.map((item, index) => {
          const target = group.entries?.[index]?.target;
          const action = target?.section === 'bookings' ? t('viewBooking') : target?.section === 'alternatives' ? t('changeArrangement') : t('reviewConstraints');
          return <li key={`${target?.planId || item}-${index}`}>
            {target ? <button className="risk-action" type="button" onClick={() => onOpenRisk(target)} aria-label={`${item} · ${action}`}>
              <span><RiskItemLabel item={item} /></span><span className="risk-action-label">{action} ›</span>
            </button> : <RiskItemLabel item={item} />}
          </li>;
        })}
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
  onOpenRisk,
  onOpenChecklist,
}: {
  riskGroups: RiskGroupData[];
  mobileRisksOpen: boolean;
  onToggle: VoidFn;
  t: TranslateFn;
  language: string;
  translateRiskTitle: (title: string, language: string) => string;
  onEditLodging: VoidFn;
  onOpenRisk: (target: RiskActionTarget) => void;
  onOpenChecklist: VoidFn;
}) {
  const primaryRisk = riskGroups[0];
  const primaryTone = getRiskTone(primaryRisk);
  const summaryTitle = mobileRisksOpen
    ? t('riskDetail')
    : riskGroups.length
      ? `${t('warnings')} (${riskGroups.length})`
      : t('noWarnings');

  return (
    <div className={`mobile-risk-panel ${primaryRisk ? `level-${primaryTone}` : 'is-clear'}`}>
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
              onOpenRisk={onOpenRisk}
              onOpenChecklist={onOpenChecklist}
            />
          ))}
        </div>
      )}
    </div>
  );
}

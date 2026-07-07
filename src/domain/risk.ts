export interface TripDateLike {
  id: string;
  display?: string;
  dayNumber: number;
}

export interface RiskPlanLike {
  id: string;
  name: string;
}

export interface RiskItem<TPlan extends RiskPlanLike = RiskPlanLike> {
  plan: TPlan;
  dateId?: string;
  level: 'critical' | 'warning' | 'info' | string;
  title: string;
  reasons?: string[];
}

export interface RiskGroup {
  title: string;
  level: string;
  items: string[];
  unit: string;
}

interface RiskGroupItem {
  label: string;
  dateId: string;
  sortIndex: number;
  inputOrder: number;
}

interface RiskGroupDraft {
  title: string;
  level: string;
  items: RiskGroupItem[];
  unit: string;
}

const LEVEL_RANK: Record<string, number> = { critical: 3, warning: 2, info: 1 };

function getLevelRank(level: string) {
  return LEVEL_RANK[level] || 0;
}

export function formatAssignedDate(dateId: string, tripDates: TripDateLike[]) {
  const matchedDate = tripDates.find((date) => date.id === dateId);
  return matchedDate ? `D${matchedDate.dayNumber} · ${matchedDate.display}` : dateId;
}

export function getRiskGroupTitle(title: string) {
  if (title === '必去计划没有可安排日期') return '必去未排';
  return title;
}

export function getRiskGroupLabel(risk: RiskItem, tripDates: TripDateLike[]) {
  if (!risk.dateId) return risk.plan.name;
  return `${formatAssignedDate(risk.dateId, tripDates)} · ${risk.plan.name}`;
}

export function buildRiskGroups(riskItems: RiskItem[], tripDates: TripDateLike[]): RiskGroup[] {
  const dateOrder = new Map(tripDates.map((date, index) => [date.id, index]));
  const groupsByTitle = new Map<string, RiskGroupDraft>();

  riskItems.forEach((risk, inputOrder) => {
    const title = getRiskGroupTitle(risk.title);
    const existing = groupsByTitle.get(title) || {
      title,
      level: risk.level,
      items: [],
      unit: risk.dateId ? '天' : '项',
    };

    if (getLevelRank(risk.level) > getLevelRank(existing.level)) existing.level = risk.level;
    if (risk.dateId) existing.unit = '天';
    existing.items.push({
      label: getRiskGroupLabel(risk, tripDates),
      dateId: risk.dateId || '',
      sortIndex: risk.dateId ? dateOrder.get(risk.dateId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER,
      inputOrder,
    });
    groupsByTitle.set(title, existing);
  });

  return Array.from(groupsByTitle.values())
    .map((group) => ({
      ...group,
      items: Array.from(
        group.items.reduce((itemsByLabel, item) => {
          if (!itemsByLabel.has(item.label)) itemsByLabel.set(item.label, item);
          return itemsByLabel;
        }, new Map<string, RiskGroupItem>()).values(),
      )
        .sort((a, b) => {
          const dateDiff = a.sortIndex - b.sortIndex;
          if (dateDiff) return dateDiff;
          return a.inputOrder - b.inputOrder;
        })
        .map((item) => item.label),
    }))
    .sort((a, b) => {
      const levelDiff = getLevelRank(b.level) - getLevelRank(a.level);
      if (levelDiff) return levelDiff;
      return b.items.length - a.items.length;
    });
}

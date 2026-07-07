import { describe, expect, it } from 'vitest';
import { buildRiskGroups, type RiskItem } from './risk';

const tripDates = [
  { id: '2026-07-10', dayNumber: 1, display: '7月10日周五' },
  { id: '2026-07-11', dayNumber: 2, display: '7月11日周六' },
  { id: '2026-07-12', dayNumber: 3, display: '7月12日周日' },
  { id: '2026-07-13', dayNumber: 4, display: '7月13日周一' },
];

function plan(id: string, name: string) {
  return { id, name };
}

describe('buildRiskGroups', () => {
  it('sorts dated warning items by trip date inside a group', () => {
    const risks: RiskItem[] = [
      { plan: plan('p4', 'D4 plan'), dateId: '2026-07-13', level: 'warning', title: '预约/订票未完成' },
      { plan: plan('p2', 'D2 plan'), dateId: '2026-07-11', level: 'warning', title: '预约/订票未完成' },
      { plan: plan('p1', 'D1 plan'), dateId: '2026-07-10', level: 'warning', title: '预约/订票未完成' },
    ];

    const [group] = buildRiskGroups(risks, tripDates);

    expect(group.items).toEqual([
      'D1 · 7月10日周五 · D1 plan',
      'D2 · 7月11日周六 · D2 plan',
      'D4 · 7月13日周一 · D4 plan',
    ]);
  });

  it('keeps critical groups before warning groups', () => {
    const groups = buildRiskGroups([
      { plan: plan('p2', 'Ticket'), dateId: '2026-07-11', level: 'warning', title: '预约/订票未完成' },
      { plan: plan('p3', 'Weather'), dateId: '2026-07-12', level: 'critical', title: '天气不合适' },
    ], tripDates);

    expect(groups.map((group) => group.title)).toEqual(['天气不合适', '预约/订票未完成']);
  });

  it('deduplicates repeated labels while preserving date order', () => {
    const risks: RiskItem[] = [
      { plan: plan('p1', 'Same'), dateId: '2026-07-10', level: 'warning', title: '预约/订票未完成' },
      { plan: plan('p1', 'Same'), dateId: '2026-07-10', level: 'warning', title: '预约/订票未完成' },
    ];

    expect(buildRiskGroups(risks, tripDates)[0].items).toEqual(['D1 · 7月10日周五 · Same']);
  });
});

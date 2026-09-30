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

  it('deduplicates repeated plan and date targets while preserving date order', () => {
    const risks: RiskItem[] = [
      { plan: plan('p1', 'Same'), dateId: '2026-07-10', level: 'warning', title: '预约/订票未完成' },
      { plan: plan('p1', 'Same'), dateId: '2026-07-10', level: 'warning', title: '预约/订票未完成' },
    ];

    expect(buildRiskGroups(risks, tripDates)[0].items).toEqual(['D1 · 7月10日周五 · Same']);
  });

  it('keeps action targets aligned with labels after sorting', () => {
    const [group] = buildRiskGroups([
      { plan: plan('p3', 'Later'), dateId: '2026-07-12', level: 'warning', title: '预约/订票未完成' },
      { plan: plan('p1', 'Earlier'), dateId: '2026-07-10', level: 'warning', title: '预约/订票未完成' },
    ], tripDates);
    expect(group.entries).toEqual([
      { label: group.items[0], target: { planId: 'p1', dateId: '2026-07-10', section: 'bookings' } },
      { label: group.items[1], target: { planId: 'p3', dateId: '2026-07-12', section: 'bookings' } },
    ]);
  });

  it('preserves distinct plans even when their display labels match', () => {
    const [group] = buildRiskGroups([
      { plan: plan('p1', 'Same'), level: 'critical', title: '必去计划没有可安排日期' },
      { plan: plan('p2', 'Same'), level: 'critical', title: '必去计划没有可安排日期' },
    ], tripDates);
    expect(group.entries?.map((item) => item.target.planId)).toEqual(['p1', 'p2']);
    expect(group.entries?.every((item) => item.target.section === 'constraints')).toBe(true);
  });

  it('routes weather warnings to alternatives and scheduling conflicts to constraints', () => {
    const groups = buildRiskGroups([
      { plan: plan('p1', 'Outdoor'), dateId: '2026-07-10', level: 'critical', title: '天气不合适' },
      { plan: plan('p2', 'Conflict'), dateId: '2026-07-11', level: 'critical', title: '和其他安排冲突' },
    ], tripDates);
    expect(groups.map((group) => group.entries?.[0].target.section)).toEqual(['alternatives', 'constraints']);
  });
});

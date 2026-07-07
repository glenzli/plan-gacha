import { describe, expect, it } from 'vitest';
import {
  CHECKLIST_STATUS,
  getChecklistStats,
  isUntouchedExampleChecklist,
  mergeChecklistPayload,
  normalizeChecklistState,
  parseChecklistImportPayload,
  parseChecklistText,
  reconcileChecklistStateForGroups,
} from './checklist';

describe('checklist parsing', () => {
  it('parses headings, bullet syntax, checkbox syntax, and duplicate item ids', () => {
    const groups = parseChecklistText(`
# 证件
- [x] 护照
- 护照
* 现金
`);

    expect(groups).toEqual([
      {
        id: '证件',
        title: '证件',
        items: [
          { id: '证件::护照', text: '护照' },
          { id: '证件::护照::2', text: '护照' },
          { id: '证件::现金', text: '现金' },
        ],
      },
    ]);
  });

  it('keeps only valid checklist state entries and reconciles removed items', () => {
    const groups = parseChecklistText('# 证件\n护照');
    const state = normalizeChecklistState({
      '证件::护照': CHECKLIST_STATUS.done,
      '证件::现金': CHECKLIST_STATUS.skipped,
      other: 'invalid',
    });

    expect(state).toEqual({
      '证件::护照': CHECKLIST_STATUS.done,
      '证件::现金': CHECKLIST_STATUS.skipped,
    });
    expect(reconcileChecklistStateForGroups(state, groups)).toEqual({
      '证件::护照': CHECKLIST_STATUS.done,
    });
  });

  it('computes progress excluding skipped items', () => {
    const groups = parseChecklistText('# 证件\n护照\n现金');
    expect(getChecklistStats(groups, {
      '证件::护照': CHECKLIST_STATUS.done,
      '证件::现金': CHECKLIST_STATUS.skipped,
    })).toEqual({
      total: 1,
      done: 1,
      skipped: 1,
      all: 2,
    });
  });

  it('detects untouched built-in example checklist', () => {
    expect(isUntouchedExampleChecklist(`# 证件
身份证/护照
驾照/学生证
银行卡和少量现金

# 电子设备
手机充电器
充电宝
相机/耳机

# 衣物
换洗衣物
舒适鞋
雨具/防晒

# 出发前
确认交通票
确认酒店入住信息
检查预约和门票`, {})).toBe(true);
  });
});

describe('checklist import', () => {
  it('imports plain text as checklist content', () => {
    const payload = parseChecklistImportPayload('# 证件\n护照');

    expect(payload.checklistText).toBe('# 证件\n护照');
    expect(payload.groups[0].items[0]).toEqual({ id: '证件::护照', text: '护照' });
  });

  it('imports json with state and drops state for missing items', () => {
    const payload = parseChecklistImportPayload(JSON.stringify({
      checklistText: '# 证件\n护照',
      checklistState: {
        '证件::护照': 'done',
        '证件::现金': 'done',
      },
    }));

    expect(payload.checklistState).toEqual({
      '证件::护照': CHECKLIST_STATUS.done,
    });
  });
});

describe('checklist merge', () => {
  it('adds new groups and preserves incoming status', () => {
    const merged = mergeChecklistPayload(
      '# 证件\n护照',
      { '证件::护照': CHECKLIST_STATUS.done },
      '# 电子设备\n充电宝',
      { '电子设备::充电宝': CHECKLIST_STATUS.skipped },
    );

    expect(merged.conflicts).toEqual([]);
    expect(merged.checklistText).toBe('# 证件\n护照\n\n# 电子设备\n充电宝');
    expect(merged.checklistState).toEqual({
      '证件::护照': CHECKLIST_STATUS.done,
      '电子设备::充电宝': CHECKLIST_STATUS.skipped,
    });
  });

  it('reports category conflicts for same text moved to another group', () => {
    const merged = mergeChecklistPayload(
      '# 证件\n护照',
      {},
      '# 必备物品\n护照',
      {},
    );

    expect(merged.conflicts).toEqual([
      {
        type: 'category',
        text: '护照',
        currentGroup: '证件',
        incomingGroup: '必备物品',
      },
    ]);
  });

  it('reports status conflicts without overwriting current status', () => {
    const merged = mergeChecklistPayload(
      '# 证件\n护照',
      { '证件::护照': CHECKLIST_STATUS.done },
      '# 证件\n护照',
      { '证件::护照': CHECKLIST_STATUS.skipped },
    );

    expect(merged.conflicts).toEqual([
      {
        type: 'status',
        text: '护照',
        currentGroup: '证件',
        incomingGroup: '证件',
        currentStatus: CHECKLIST_STATUS.done,
        incomingStatus: CHECKLIST_STATUS.skipped,
      },
    ]);
    expect(merged.checklistState).toEqual({
      '证件::护照': CHECKLIST_STATUS.done,
    });
  });
});

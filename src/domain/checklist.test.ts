import { describe, expect, it } from 'vitest';
import {
  CHECKLIST_STATUS,
  filterChecklistGroups,
  getChecklistStats,
  isUntouchedExampleChecklist,
  mergeChecklistPayload,
  normalizeChecklistState,
  parseChecklistImportPayload,
  parseChecklistText,
  reconcileChecklistStateForGroups,
  serializeChecklistDraft,
} from './checklist';

describe('checklist visibility', () => {
  it('shows only explicit or implicit todo items without changing groups, progress, or statuses', () => {
    const groups = parseChecklistText('# Documents\nPassport\nCash\n# Bags\nCharger\nCamera');
    const state = { 'Documents::Passport': CHECKLIST_STATUS.done, 'Bags::Charger': CHECKLIST_STATUS.todo, 'Bags::Camera': CHECKLIST_STATUS.skipped };
    const before = JSON.stringify({ groups, state });
    const stats = getChecklistStats(groups, state);
    expect(filterChecklistGroups(groups, state, true)).toEqual([
      { ...groups[0], items: [groups[0].items[1]] },
      { ...groups[1], items: [groups[1].items[0]] },
    ]);
    expect(JSON.stringify({ groups, state })).toBe(before);
    expect(getChecklistStats(groups, state)).toEqual(stats);
    expect(filterChecklistGroups(groups, state, false)).toBe(groups);
  });

  it('hides groups containing only done or skipped items while all view keeps them intact', () => {
    const groups = parseChecklistText('# Documents\nPassport\n# Bags\nCamera');
    const state = { 'Documents::Passport': CHECKLIST_STATUS.done, 'Bags::Camera': CHECKLIST_STATUS.skipped };
    const before = JSON.stringify({ groups, state });
    expect(filterChecklistGroups(groups, state, true)).toEqual([]);
    expect(filterChecklistGroups(groups, state, false)).toBe(groups);
    expect(JSON.stringify({ groups, state })).toBe(before);
    expect(getChecklistStats(groups, state)).toEqual({ total: 1, done: 1, skipped: 1, all: 2 });
  });

  it('removes the final todo item when marked not needed and shows it again after restoring its need', () => {
    const groups = parseChecklistText('# Bags\nCamera');
    expect(filterChecklistGroups(groups, {}, true)).toEqual(groups);
    const skipped = { 'Bags::Camera': CHECKLIST_STATUS.skipped };
    expect(filterChecklistGroups(groups, skipped, true)).toEqual([]);
    expect(filterChecklistGroups(groups, skipped, false)).toBe(groups);
    expect(filterChecklistGroups(groups, { 'Bags::Camera': CHECKLIST_STATUS.todo }, true)).toEqual(groups);
    expect(skipped).toEqual({ 'Bags::Camera': CHECKLIST_STATUS.skipped });
  });

  it('removes finished groups and returns an empty view when every item is checked', () => {
    const groups = parseChecklistText('# Documents\nPassport\n# Bags\nCharger');
    const state = { 'Documents::Passport': CHECKLIST_STATUS.done };
    expect(filterChecklistGroups(groups, state, true)).toEqual([groups[1]]);
    expect(filterChecklistGroups(groups, { ...state, 'Bags::Charger': CHECKLIST_STATUS.done }, true)).toEqual([]);
    expect(filterChecklistGroups(groups, state, false)).toHaveLength(2);
    expect(filterChecklistGroups([], {}, true)).toEqual([]);
  });

  it('reflects new, deleted, renamed and duplicate items after saving the full editor draft', () => {
    const groups = parseChecklistText('# Bags\nCharger\nCharger\nCamera');
    const state = { 'Bags::Charger': CHECKLIST_STATUS.done, 'Bags::Camera': CHECKLIST_STATUS.skipped };
    groups[0].title = 'Carry-on';
    groups[0].items.splice(2, 1);
    groups[0].items.push({ id: 'new-item', text: 'Adapter' });
    groups.push({ id: 'new-group', title: 'Documents', items: [{ id: 'passport', text: 'Passport' }] });
    const saved = serializeChecklistDraft(groups, state);
    const visible = filterChecklistGroups(saved.groups, saved.checklistState, true);
    expect(visible.map((group) => [group.title, group.items.map((item) => item.text)])).toEqual([
      ['Carry-on', ['Charger', 'Adapter']], ['Documents', ['Passport']],
    ]);
    expect(saved.checklistState).toEqual({ 'Carry-on::Charger': CHECKLIST_STATUS.done });
    expect(getChecklistStats(saved.groups, saved.checklistState)).toMatchObject({ total: 4, done: 1 });
  });
});

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

describe('checklist category editing', () => {
  it('retains done and skipped statuses when categories and items are renamed', () => {
    const groups = parseChecklistText('# 证件\n护照\n驾照');
    groups[0].title = '随身证件';
    groups[0].items[0].text = '身份证 / 护照';
    const saved = serializeChecklistDraft(groups, {
      '证件::护照': CHECKLIST_STATUS.done,
      '证件::驾照': CHECKLIST_STATUS.skipped,
    });
    expect(saved.checklistState).toEqual({
      '随身证件::身份证 / 护照': CHECKLIST_STATUS.done,
      '随身证件::驾照': CHECKLIST_STATUS.skipped,
    });
    const reopened = parseChecklistText(saved.checklistText);
    expect(reopened).toEqual(saved.groups);
    expect(serializeChecklistDraft(reopened, saved.checklistState)).toEqual(saved);
  });

  it('re-keys remaining duplicates without borrowing the removed item status', () => {
    const groups = parseChecklistText('# 行李\n充电器\n充电器\n充电器');
    groups[0].items.splice(0, 1);
    groups[0].items.push({ id: 'new-item', text: '充电器' });
    const saved = serializeChecklistDraft(groups, {
      '行李::充电器': CHECKLIST_STATUS.done,
      '行李::充电器::2': CHECKLIST_STATUS.skipped,
      '行李::充电器::3': CHECKLIST_STATUS.done,
    });
    expect(saved.checklistState).toEqual({
      '行李::充电器': CHECKLIST_STATUS.skipped,
      '行李::充电器::2': CHECKLIST_STATUS.done,
    });
  });

  it('keeps uncategorized items and literal heading/bullet text through raw round trips', () => {
    const groups = parseChecklistText('证件\n# 其他\n雨伞');
    groups[1].items.push({ id: 'new-hash', text: '# 标签' }, { id: 'new-bullet', text: '- [x] 样例' });
    const saved = serializeChecklistDraft(groups, { '__uncategorized__::证件': CHECKLIST_STATUS.done });
    expect(saved.groups.map((group) => group.id)).toEqual(['__uncategorized__', '其他']);
    expect(saved.groups[1].items.map((item) => item.text)).toEqual(['雨伞', '# 标签', '- [x] 样例']);
    expect(saved.checklistState).toEqual({ '__uncategorized__::证件': CHECKLIST_STATUS.done });
  });

  it('keeps empty categories available in the editor without counting empty draft rows', () => {
    const groups = parseChecklistText('# 出发前\n# 衣物\n外套', 'zh', { keepEmptyGroups: true });
    expect(groups).toHaveLength(2);
    groups[0].items.push({ id: 'blank', text: '  ' });
    const saved = serializeChecklistDraft(groups, {});
    expect(parseChecklistText(saved.checklistText, 'zh', { keepEmptyGroups: true })).toHaveLength(2);
    expect(getChecklistStats(saved.groups, saved.checklistState).total).toBe(1);
    expect(serializeChecklistDraft([], {}).checklistText).toBe('');
  });

  it('combines same-name categories consistently and rejects a blank category name', () => {
    const groups = parseChecklistText('# A\n雨伞\n# B\n雨伞');
    groups[1].title = 'A';
    const saved = serializeChecklistDraft(groups, { 'B::雨伞': CHECKLIST_STATUS.done });
    expect(saved.groups).toHaveLength(1);
    expect(saved.checklistState).toEqual({ 'A::雨伞::2': CHECKLIST_STATUS.done });
    groups[0].title = ' ';
    expect(() => serializeChecklistDraft(groups, {})).toThrow('checklistCategoryRequired');
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

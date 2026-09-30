export type Language = 'zh' | 'en' | string;

export enum ChecklistStatus {
  Todo = 'todo',
  Done = 'done',
  Skipped = 'skipped',
}

export const CHECKLIST_STATUS = {
  todo: ChecklistStatus.Todo,
  done: ChecklistStatus.Done,
  skipped: ChecklistStatus.Skipped,
} as const;

export enum ChecklistMergeConflictType {
  Status = 'status',
  Category = 'category',
  Duplicate = 'duplicate',
}

export const DEFAULT_CHECKLIST_TEXT = '';

export const EXAMPLE_CHECKLIST_TEXT = `# 证件
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
检查预约和门票`;

export interface ChecklistItem {
  id: string;
  text: string;
}

export interface ChecklistGroup {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export type ChecklistState = Record<string, ChecklistStatus>;

export interface ChecklistImportPayload {
  checklistText: string;
  checklistState: ChecklistState;
  groups: ChecklistGroup[];
}

export interface ChecklistMergeConflict {
  type: ChecklistMergeConflictType;
  text: string;
  currentGroup: string;
  incomingGroup: string;
  currentStatus?: ChecklistStatus;
  incomingStatus?: ChecklistStatus;
}

export interface ChecklistMergeResult {
  checklistText: string;
  checklistState: ChecklistState;
  conflicts: ChecklistMergeConflict[];
}

const CHECKLIST_LABELS = {
  zh: {
    uncategorized: '未分类',
    importEmpty: '清单内容为空',
  },
  en: {
    uncategorized: 'Uncategorized',
    importEmpty: 'Checklist is empty',
  },
} as const;

function normalizeLanguage(language: Language = 'zh'): 'zh' | 'en' {
  return language === 'en' ? 'en' : 'zh';
}

function getChecklistLabel(key: keyof typeof CHECKLIST_LABELS.zh, language: Language = 'zh') {
  return CHECKLIST_LABELS[normalizeLanguage(language)][key];
}

export function normalizeChecklistText(text: unknown, fallback = DEFAULT_CHECKLIST_TEXT) {
  if (typeof text === 'string') return text.trim();
  return fallback;
}

export function normalizeChecklistState(state: unknown): ChecklistState {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return {};

  return Object.fromEntries(
    Object.entries(state)
      .filter(([, value]) => Object.values(CHECKLIST_STATUS).includes(value as ChecklistStatus)),
  ) as ChecklistState;
}

export function isUntouchedExampleChecklist(text: unknown, state: unknown) {
  const normalizedText = normalizeChecklistText(text, '');
  const normalizedExample = normalizeChecklistText(EXAMPLE_CHECKLIST_TEXT, '');
  return normalizedText === normalizedExample && Object.keys(normalizeChecklistState(state)).length === 0;
}

function cleanupChecklistLine(line: string) {
  return line
    .replace(/^\s*[-*]\s*\[[ xX]\]\s*/, '')
    .replace(/^\s*[-*]\s*/, '')
    .trim();
}

function getChecklistId(groupTitle: string, itemText: string, occurrence: number) {
  const suffix = occurrence > 0 ? `::${occurrence + 1}` : '';
  return `${groupTitle.trim()}::${itemText.trim()}${suffix}`;
}

export function parseChecklistText(
  text: unknown,
  language: Language = 'zh',
  options: { keepEmptyGroups?: boolean } = {},
): ChecklistGroup[] {
  const groups: ChecklistGroup[] = [];
  const seenItems = new Map<string, number>();
  let currentGroup: ChecklistGroup | null = null;

  const ensureGroup = (title?: string) => {
    const normalizedTitle = title?.trim() || '';
    const isFallbackGroup = !normalizedTitle;
    const groupTitle = isFallbackGroup ? getChecklistLabel('uncategorized', language) : normalizedTitle;
    const groupId = isFallbackGroup ? '__uncategorized__' : groupTitle;
    const existingGroup = groups.find((group) => group.id === groupId);
    if (existingGroup) return existingGroup;

    const nextGroup = { id: groupId, title: groupTitle, items: [] };
    groups.push(nextGroup);
    return nextGroup;
  };

  normalizeChecklistText(text, '').split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    const heading = line.match(/^#+\s*(.+)$/);
    if (heading) {
      currentGroup = ensureGroup(heading[1]);
      return;
    }

    const itemText = cleanupChecklistLine(line);
    if (!itemText) return;
    if (!currentGroup) currentGroup = ensureGroup();

    const baseKey = `${currentGroup.id}::${itemText}`;
    const occurrence = seenItems.get(baseKey) || 0;
    seenItems.set(baseKey, occurrence + 1);
    currentGroup.items.push({
      id: getChecklistId(currentGroup.id, itemText, occurrence),
      text: itemText,
    });
  });

  return options.keepEmptyGroups ? groups : groups.filter((group) => group.items.length > 0);
}

export function getChecklistStats(groups: ChecklistGroup[], state: ChecklistState) {
  const items = groups.flatMap((group) => group.items);
  const skipped = items.filter((item) => state[item.id] === CHECKLIST_STATUS.skipped).length;
  const actionable = items.filter((item) => state[item.id] !== CHECKLIST_STATUS.skipped);
  const done = actionable.filter((item) => state[item.id] === CHECKLIST_STATUS.done).length;

  return {
    total: actionable.length,
    done,
    skipped,
    all: items.length,
  };
}

export function reconcileChecklistStateForGroups(state: unknown, groups: ChecklistGroup[]) {
  const validItemIds = new Set(groups.flatMap((group) => group.items.map((item) => item.id)));
  return Object.fromEntries(
    Object.entries(normalizeChecklistState(state))
      .filter(([itemId]) => validItemIds.has(itemId)),
  ) as ChecklistState;
}

export function serializeChecklistGroups(groups: ChecklistGroup[]) {
  return groups
    .map((group) => [
      `# ${group.title}`,
      ...group.items.map((item) => item.text),
    ].join('\n'))
    .join('\n\n')
    .trim();
}

// Editor ids stay stable while typing. Re-key statuses only when producing the
// persisted text, so renaming categories/items and removing duplicates are safe.
export function serializeChecklistDraft(
  groups: ChecklistGroup[],
  state: ChecklistState,
  language: Language = 'zh',
): ChecklistImportPayload {
  const nextState: ChecklistState = {};
  const seenItems = new Map<string, number>();
  const checklistText = groups.map((group) => {
    const title = group.title.trim();
    if (!title) throw new Error('checklistCategoryRequired');
    const unheaded = group.id === '__uncategorized__' && title === getChecklistLabel('uncategorized', language);
    const groupId = unheaded ? '__uncategorized__' : title;
    const lines = unheaded ? [] : [`# ${title}`];
    group.items.forEach((item) => {
      const text = item.text.trim();
      if (!text) return;
      const baseKey = `${groupId}::${text}`;
      const occurrence = seenItems.get(baseKey) || 0;
      seenItems.set(baseKey, occurrence + 1);
      const nextId = getChecklistId(groupId, text, occurrence);
      if (state[item.id]) nextState[nextId] = state[item.id];
      // A list prefix keeps an item beginning with # from becoming a category.
      lines.push(`- ${text}`);
    });
    return lines.join('\n');
  }).filter(Boolean).join('\n\n').trim();
  const nextGroups = parseChecklistText(checklistText, language);
  return {
    checklistText,
    checklistState: reconcileChecklistStateForGroups(nextState, nextGroups),
    groups: nextGroups,
  };
}

function countChecklistTexts(groups: ChecklistGroup[]) {
  const counts = new Map<string, number>();
  groups.forEach((group) => {
    group.items.forEach((item) => {
      counts.set(item.text, (counts.get(item.text) || 0) + 1);
    });
  });
  return counts;
}

function parseJsonLike(input: string) {
  const trimmed = input.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1].trim() : trimmed);
}

export function parseChecklistImportPayload(input: string, language: Language = 'zh'): ChecklistImportPayload {
  let parsed: unknown;

  try {
    parsed = parseJsonLike(input);
  } catch {
    parsed = { checklistText: input };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    parsed = { checklistText: String(parsed || '') };
  }

  const payload = parsed as Record<string, unknown>;
  const checklistSource = Object.hasOwn(payload, 'checklistText')
    ? payload.checklistText
    : payload.checklist || payload.packingList || payload.text || '';
  const checklistText = normalizeChecklistText(checklistSource, '');
  if (!checklistText) throw new Error(getChecklistLabel('importEmpty', language));

  const groups = parseChecklistText(checklistText, language);
  return {
    checklistText,
    checklistState: reconcileChecklistStateForGroups(payload.checklistState || payload.checklistStatus || {}, groups),
    groups,
  };
}

export function mergeChecklistPayload(
  currentText: unknown,
  currentState: unknown,
  incomingText: unknown,
  incomingState: unknown,
  language: Language = 'zh',
): ChecklistMergeResult {
  const currentGroups = parseChecklistText(currentText, language);
  const incomingGroups = parseChecklistText(incomingText, language);
  const incomingCounts = countChecklistTexts(incomingGroups);
  const resultGroups = currentGroups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item })),
  }));
  const resultState = reconcileChecklistStateForGroups(currentState, resultGroups);
  const normalizedIncomingState = normalizeChecklistState(incomingState);
  const conflicts: ChecklistMergeConflict[] = [];

  const groupById = new Map(resultGroups.map((group) => [group.id, group]));
  const itemById = new Map<string, { group: ChecklistGroup; item: ChecklistItem }>();
  const itemsByText = new Map<string, Array<{ group: ChecklistGroup; item: ChecklistItem }>>();

  const indexResultItem = (group: ChecklistGroup, item: ChecklistItem) => {
    itemById.set(item.id, { group, item });
    const items = itemsByText.get(item.text) || [];
    items.push({ group, item });
    itemsByText.set(item.text, items);
  };

  resultGroups.forEach((group) => {
    group.items.forEach((item) => indexResultItem(group, item));
  });

  const ensureGroup = (incomingGroup: ChecklistGroup) => {
    const existing = groupById.get(incomingGroup.id);
    if (existing) return existing;

    const nextGroup = { id: incomingGroup.id, title: incomingGroup.title, items: [] };
    resultGroups.push(nextGroup);
    groupById.set(nextGroup.id, nextGroup);
    return nextGroup;
  };

  const applyIncomingStatus = (
    target: { group: ChecklistGroup; item: ChecklistItem },
    incomingStatus: ChecklistStatus | undefined,
    incomingGroup: ChecklistGroup,
  ) => {
    if (!incomingStatus) return;

    const currentStatus = resultState[target.item.id];
    if (currentStatus && currentStatus !== incomingStatus) {
      conflicts.push({
        type: ChecklistMergeConflictType.Status,
        text: target.item.text,
        currentGroup: target.group.title,
        incomingGroup: incomingGroup.title,
        currentStatus,
        incomingStatus,
      });
      return;
    }

    resultState[target.item.id] = incomingStatus;
  };

  incomingGroups.forEach((incomingGroup) => {
    incomingGroup.items.forEach((incomingItem) => {
      const incomingStatus = normalizedIncomingState[incomingItem.id];
      const exactTarget = itemById.get(incomingItem.id);
      if (exactTarget) {
        applyIncomingStatus(exactTarget, incomingStatus, incomingGroup);
        return;
      }

      const sameTextTargets = itemsByText.get(incomingItem.text) || [];
      if (sameTextTargets.length === 1 && incomingCounts.get(incomingItem.text) === 1) {
        const target = sameTextTargets[0];
        if (target.group.id !== incomingGroup.id) {
          conflicts.push({
            type: ChecklistMergeConflictType.Category,
            text: incomingItem.text,
            currentGroup: target.group.title,
            incomingGroup: incomingGroup.title,
          });
        }
        applyIncomingStatus(target, incomingStatus, incomingGroup);
        return;
      }

      if (sameTextTargets.length > 1 || (incomingCounts.get(incomingItem.text) || 0) > 1) {
        conflicts.push({
          type: ChecklistMergeConflictType.Duplicate,
          text: incomingItem.text,
          currentGroup: sameTextTargets.map((target) => target.group.title).join(' / '),
          incomingGroup: incomingGroup.title,
        });
        return;
      }

      const targetGroup = ensureGroup(incomingGroup);
      const occurrence = targetGroup.items.filter((item) => item.text === incomingItem.text).length;
      const nextItem = {
        id: getChecklistId(targetGroup.id, incomingItem.text, occurrence),
        text: incomingItem.text,
      };
      targetGroup.items.push(nextItem);
      indexResultItem(targetGroup, nextItem);
      if (incomingStatus) resultState[nextItem.id] = incomingStatus;
    });
  });

  return {
    checklistText: serializeChecklistGroups(resultGroups),
    checklistState: reconcileChecklistStateForGroups(resultState, resultGroups),
    conflicts,
  };
}

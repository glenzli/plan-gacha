import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const APP_SCHEMA_VERSION = '13';
const DEFAULT_TRIP_DAYS = 5;
const WEATHER_FETCH_TIMEOUT_MS = 20000;
const WEATHER_BATCH_TIMEOUT_MS = 60000;
const WEATHER_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const WEATHER_FETCH_CONCURRENCY = 4;
const WEATHER_ERRORS_KEY = Symbol('weatherErrors');
const WEATHER_CACHE_HIT_KEY = Symbol('weatherCacheHit');
const NEW_PLAN_EDITOR_ID = '__new_plan__';
const DEFAULT_LANGUAGE = 'zh';
const SUPPORTED_LANGUAGES = ['zh', 'en'];
const CHECKLIST_STATUS = {
  todo: 'todo',
  done: 'done',
  skipped: 'skipped',
};
const DEFAULT_CHECKLIST_TEXT = `# 证件
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

const UI_TEXT = {
  zh: {
    appName: '行程扭蛋',
    langSwitch: 'EN',
    langSwitchTitle: 'Switch to English',
    emptyTripName: '未创建行程',
    unnamedTrip: '未命名旅行',
    emptyPlanNotice: '当前已经是空计划',
    newTripCreated: '新计划已创建',
    overwriteExampleConfirm: '用完整示例覆盖当前计划？',
    exampleTripName: '青岛 5 日示例',
    exampleLoaded: '示例已加入',
    deletePlanConfirm: ({ name }) => `删除「${name}」？已安排到日期上的引用也会移除。`,
    planDeleted: '计划已删除',
    bookingDone: '已标记完成',
    bookingPending: '已改回待处理',
    archiveTripConfirm: ({ name }) => `归档「${name}」？归档后会从顶部切换列表隐藏，可在编辑计划里恢复。`,
    tripArchived: '当前旅行已归档',
    deleteTripConfirm: ({ name }) => `永久删除「${name}」？这个操作不会进入归档。`,
    tripDeleted: '当前旅行已删除',
    archivedRestored: '已恢复归档旅行',
    scheduleUpdated: '安排已更新',
    dayPlanUpdated: '当天方案已更新',
    impactedDatesCleared: '已更新，并清空受影响日期',
    dayCleared: '当天安排已清空',
    copyFailed: '复制失败，请手动选中文本',
    weatherTimeout: '天气更新超时，可稍后重试或检查网络。',
    autoWeatherTimeout: '自动天气更新超时，可稍后重试或检查网络。',
    weatherCacheValid: '天气缓存仍有效',
    weatherUpdatedPartial: '天气已更新，部分地点失败',
    weatherUpdated: '天气已更新',
    autoWeatherFailed: ({ message }) => `自动天气更新失败：${message}`,
    jsonApplied: 'JSON 已应用',
    aiPlanApplied: 'AI 规划结果已应用',
    applyFailed: ({ message }) => `应用失败：${message}`,
    noApplicableJson: '没有找到可应用的 plans 或 schedule',
    planCreated: '计划已新增',
    planUpdated: '计划已更新',
    importDone: 'JSON 已导入',
    importFailed: ({ message }) => `导入失败：${message}`,
    jsonCopied: 'JSON 已复制',
    aiPromptCopied: ({ label }) => `${label} Prompt 已复制`,
    addPlanPromptCopied: '新增计划 Prompt 已复制',
    editPlanPromptCopied: '编辑计划 Prompt 已复制',
    planSetup: 'Plan Setup',
    emptyTitle: '还没有计划',
    emptyDescription: '先建立计划池，再按每天的天气、日期限制、预约订票和冲突关系动态切换。',
    aiGenerate: 'AI 生成',
    aiGenerateShort: 'AI',
    viewExample: '看示例',
    import: '导入',
    export: '导出',
    editPlan: '编辑计划',
    noEditablePlan: '暂无可编辑计划',
    createOrImportFirst: '先新建或导入计划',
    createTrip: '新建旅行计划',
    tripSwitcher: '切换旅行计划',
    tripList: '旅行计划',
    itinerary: '行程',
    dailyOverview: '每日状态速览',
    aiReplan: 'AI 重排',
    open: '打开',
    dateList: '日期列表',
    unassigned: '未安排',
    previousDay: '上一天',
    nextDay: '下一天',
    chooseDate: '选择日期',
    switchablePlans: '可切换计划',
    available: ({ count }) => `${count} 可用`,
    warnings: '预警',
    warningClasses: ({ count }) => `${count} 类`,
    noBlockingRisks: '当前安排没有把未排计划卡死。',
    aiReplanHelper: '用于大改剩余行程：整理未完成计划、当前安排、天气和预警，再复制给你常用的 AI。',
    aiGenerateHelperWhenEmpty: '当前还是空计划，会直接进入 AI 生成，用来创建计划池、备选方案和初始日程。',
    weather: '天气',
    updating: '更新中',
    updateWeather: '更新天气',
    weatherHelper: '使用 Open-Meteo 按计划地点查询；同地点和同日期范围 2 小时内复用缓存，跨城和多地点计划会合并评估对应地点天气。',
    noWeather: '尚未获取天气',
    aiPlanning: 'AI Planning',
    closeAiPlanning: '关闭 AI 规划',
    aiPlanningSummary: '我们会整理当前行程、天气、限制和预警；你补充临时需求后，复制 Prompt 给常用 AI。',
    extraQuestion: '你的补充问题',
    aiResult: 'AI 返回结果',
    aiResultPlaceholder: '粘贴 AI 输出的 JSON，例如 {"plans": [...]} 或 {"schedule": [...]}',
    close: '关闭',
    copyToAi: '复制给 AI',
    applyResult: '应用结果',
    closeEditor: '关闭编辑计划',
    addPlan: '新增计划',
    editSinglePlan: '编辑单个计划',
    backToList: '返回列表',
    newPlan: 'New Plan',
    currentPlan: 'Current Plan',
    planMissing: '计划不存在',
    newPlanHelp: '写下你想新增的内容，复制给 AI 后，把返回的 JSON 粘贴回来应用。',
    yourRequest: '你的需求',
    newPlanPlaceholder: '例如：新增一个雨天室内备用计划，下午半天，适合体力低的时候。',
    editPlanPlaceholder: '例如：把这个计划改成雨天可执行，减少户外路段，保留必去点。',
    planAiResultPlaceholder: '粘贴 AI 输出的 JSON，例如 {"plans": [{"id": "..."}]}',
    planName: '计划名称',
    dateRange: '日期范围',
    start: '开始',
    end: '结束',
    daysCount: ({ count }) => `${count} 天`,
    planData: '计划数据',
    plansCount: ({ count }) => `${count} 个计划`,
    loadFullExample: '载入完整示例',
    importJsonTitle: '导入 JSON',
    copyCurrentJson: '复制当前 JSON',
    aiPlanPoolTitle: 'AI 生成计划池',
    aiPlanPoolHelp: '适合初始规划、批量补 backup、增加天数或补充候选计划。',
    planList: '计划清单',
    itemsCount: ({ count }) => `${count} 项`,
    scheduledOn: ({ date }) => `已排 ${date}`,
    scheduledSuffix: ({ date }) => ` · 已排 ${date}`,
    unscheduledSuffix: ' · 未排',
    addPlanHelp: '用 AI 生成后粘贴 JSON 应用',
    archive: '归档',
    delete: '删除',
    archived: '已归档',
    view: '查看',
    archivedView: '归档行程',
    readOnly: '只读',
    noPlanForDay: '当天没有安排',
    checklist: '清单',
    checklistTitle: '旅行清单',
    checklistProgress: ({ done, total }) => `${done}/${total} 完成`,
    checklistSkipped: ({ count }) => `${count} 本次不需要`,
    checklistEmpty: '还没有清单项',
    checklistUncategorized: '其他',
    checklistEdit: '编辑清单',
    checklistFormatHint: '用 # 分类，一行一个事项。保存后会自动按分类展示。',
    checklistTextLabel: '清单原文',
    checklistSave: '保存清单',
    checklistSaved: '清单已更新',
    checklistNotNeeded: '不需要',
    checklistUndoSkip: '需要',
    checklistDone: '完成',
    checklistTodo: '未完成',
    restore: '恢复',
    cancel: '取消',
    impactPreview: '调整影响预览',
    assignToDate: ({ date }) => `安排到 ${date}`,
    datesToClear: '会清空这些日期',
    nextRisks: '继续后产生的风险',
    continueAdjust: '继续调整',
    currentPlanLabel: '当前方案',
    unplannedToday: '当天未安排',
    currentPlanHelp: '从下面的候选里换一个，系统会先评估是否影响后续计划。',
    clear: '清空',
    moreItems: ({ count }) => `还有 ${count} 项`,
    riskDetail: '预警详情',
    noClearRisk: '当前安排没有明显冲突',
    noWarnings: '暂无预警',
    collapse: '收起',
    expand: '展开',
    switchableCount: ({ count }) => `${count} 个可切换`,
    candidates: '候选',
    select: '选择',
    noWeatherForPlace: '尚未获取地点天气，先更新天气',
    reminders: '特别提醒',
    bookingAndTickets: '预约和订票',
    stopsAria: ({ name }) => `${name} 行程节点`,
    bookingAria: ({ name }) => `${name} 预约和订票`,
    flexible: '弹性',
    noActionNeeded: '无需处理',
    undo: '撤销',
    manage: '退改',
    dayCurrent: ({ day }) => `D${day} 当天`,
    assignedAriaEmpty: '未安排',
    assignedAriaAdjust: '需要调整',
    assignedAriaNotice: '天气或条件待确认',
    assignedAriaPlanned: '已安排',
    adjust: '调整',
    adjustRecommended: '建议调整',
    weatherNotIdeal: '天气不是最理想',
    confirmWeather: '先确认天气',
    weatherUnknown: '天气未知',
    temporarySlot: '留给临时调整',
    normal: '普通',
    partialWeatherFailed: ({ errors }) => `部分天气未更新：${errors}`,
    dateNotSuitable: '日期不适合',
    closedOrUnavailable: '当天不可用/闭馆',
    dateNotAllowed: '不在可去日期',
    dayOccupied: '当天已有安排',
    alreadyScheduledOn: ({ date }) => `已安排在 ${date}`,
    conflictsWith: ({ name }) => `与 ${name} 互斥`,
    samePlanMoved: '同一计划被移动',
    planConflict: '计划互斥',
    weatherNotSuitable: '天气不合适',
    dayUnavailable: '当天不可用',
    incompatibleDate: '日期不合适',
    arrangementConflict: '和其他安排冲突',
    scheduledElsewhere: '已经排在别的日期',
    needsAdjustment: '需要调整',
    mustUnscheduled: '必去未排',
    mustNoAvailableDate: '必去计划没有可安排日期',
    bookingIncomplete: '预约/订票未完成',
    dayUnit: '天',
    itemUnit: '项',
  },
  en: {
    appName: 'Plan Gacha',
    langSwitch: '中',
    langSwitchTitle: '切换到中文',
    emptyTripName: 'No trip yet',
    unnamedTrip: 'Untitled trip',
    emptyPlanNotice: 'This trip is already empty',
    newTripCreated: 'New trip created',
    overwriteExampleConfirm: 'Replace the current trip with the full example?',
    exampleTripName: 'Qingdao 5-day example',
    exampleLoaded: 'Example loaded',
    deletePlanConfirm: ({ name }) => `Delete "${name}"? References on scheduled days will also be removed.`,
    planDeleted: 'Plan deleted',
    bookingDone: 'Marked as done',
    bookingPending: 'Moved back to pending',
    archiveTripConfirm: ({ name }) => `Archive "${name}"? It will be hidden from the top switcher and can be restored in the editor.`,
    tripArchived: 'Trip archived',
    deleteTripConfirm: ({ name }) => `Permanently delete "${name}"? This will not be archived.`,
    tripDeleted: 'Trip deleted',
    archivedRestored: 'Archived trip restored',
    scheduleUpdated: 'Schedule updated',
    dayPlanUpdated: 'Day plan updated',
    impactedDatesCleared: 'Updated and cleared impacted dates',
    dayCleared: 'Day cleared',
    copyFailed: 'Copy failed. Select the text manually.',
    weatherTimeout: 'Weather update timed out. Try again later or check the network.',
    autoWeatherTimeout: 'Automatic weather update timed out. Try again later or check the network.',
    weatherCacheValid: 'Weather cache is still valid',
    weatherUpdatedPartial: 'Weather updated, with some locations failed',
    weatherUpdated: 'Weather updated',
    autoWeatherFailed: ({ message }) => `Automatic weather update failed: ${message}`,
    jsonApplied: 'JSON applied',
    aiPlanApplied: 'AI planning result applied',
    applyFailed: ({ message }) => `Apply failed: ${message}`,
    noApplicableJson: 'No applicable plans or schedule found',
    planCreated: 'Plan added',
    planUpdated: 'Plan updated',
    importDone: 'JSON imported',
    importFailed: ({ message }) => `Import failed: ${message}`,
    jsonCopied: 'JSON copied',
    aiPromptCopied: ({ label }) => `${label} prompt copied`,
    addPlanPromptCopied: 'New plan prompt copied',
    editPlanPromptCopied: 'Edit plan prompt copied',
    planSetup: 'Plan Setup',
    emptyTitle: 'No plans yet',
    emptyDescription: 'Create a plan pool first, then switch day by day based on weather, date limits, bookings and conflicts.',
    aiGenerate: 'AI Generate',
    aiGenerateShort: 'AI',
    viewExample: 'Example',
    import: 'Import',
    export: 'Export',
    editPlan: 'Edit trip',
    noEditablePlan: 'No trip to edit',
    createOrImportFirst: 'Create or import a trip first',
    createTrip: 'Create trip',
    tripSwitcher: 'Switch trip',
    tripList: 'Trips',
    itinerary: 'Itinerary',
    dailyOverview: 'Daily status overview',
    aiReplan: 'AI Replan',
    open: 'Open',
    dateList: 'Date list',
    unassigned: 'Unassigned',
    previousDay: 'Previous day',
    nextDay: 'Next day',
    chooseDate: 'Choose date',
    switchablePlans: 'Switchable plans',
    available: ({ count }) => `${count} available`,
    warnings: 'Warnings',
    warningClasses: ({ count }) => `${count} types`,
    noBlockingRisks: 'No current arrangement blocks the remaining plans.',
    aiReplanHelper: 'For larger changes: collect remaining plans, current schedule, weather and warnings, then copy them to your usual AI.',
    aiGenerateHelperWhenEmpty: 'This is still empty, so it opens AI Generate to create a plan pool, backups and initial schedule.',
    weather: 'Weather',
    updating: 'Updating',
    updateWeather: 'Update',
    weatherHelper: 'Uses Open-Meteo by plan location. The same location and date range reuse cache for 2 hours; multi-city plans are evaluated across their locations.',
    noWeather: 'No weather yet',
    aiPlanning: 'AI Planning',
    closeAiPlanning: 'Close AI planning',
    aiPlanningSummary: 'We collect the current itinerary, weather, limits and warnings. Add your temporary request, then copy the prompt to your usual AI.',
    extraQuestion: 'Your extra request',
    aiResult: 'AI result',
    aiResultPlaceholder: 'Paste AI JSON, for example {"plans": [...]} or {"schedule": [...]}',
    close: 'Close',
    copyToAi: 'Copy to AI',
    applyResult: 'Apply',
    closeEditor: 'Close trip editor',
    addPlan: 'Add plan',
    editSinglePlan: 'Edit one plan',
    backToList: 'Back to list',
    newPlan: 'New Plan',
    currentPlan: 'Current Plan',
    planMissing: 'Plan not found',
    newPlanHelp: 'Describe what you want to add, copy it to AI, then paste the returned JSON here.',
    yourRequest: 'Your request',
    newPlanPlaceholder: 'Example: add a rainy-day indoor backup for a low-energy afternoon.',
    editPlanPlaceholder: 'Example: make this plan workable in rain, reduce outdoor segments, keep the must-go stop.',
    planAiResultPlaceholder: 'Paste AI JSON, for example {"plans": [{"id": "..."}]}',
    planName: 'Trip name',
    dateRange: 'Date range',
    start: 'Start',
    end: 'End',
    daysCount: ({ count }) => `${count} days`,
    planData: 'Plan data',
    plansCount: ({ count }) => `${count} plans`,
    loadFullExample: 'Load full example',
    importJsonTitle: 'Import JSON',
    copyCurrentJson: 'Copy current JSON',
    aiPlanPoolTitle: 'AI plan pool',
    aiPlanPoolHelp: 'For initial planning, batch backups, added days or more candidate plans.',
    planList: 'Plan list',
    itemsCount: ({ count }) => `${count} items`,
    scheduledOn: ({ date }) => `Scheduled ${date}`,
    scheduledSuffix: ({ date }) => ` · Scheduled ${date}`,
    unscheduledSuffix: ' · Unscheduled',
    addPlanHelp: 'Generate with AI, then paste JSON to apply',
    archive: 'Archive',
    delete: 'Delete',
    archived: 'Archived',
    view: 'View',
    archivedView: 'Archived trip',
    readOnly: 'Read-only',
    noPlanForDay: 'No plan for this day',
    checklist: 'Checklist',
    checklistTitle: 'Trip checklist',
    checklistProgress: ({ done, total }) => `${done}/${total} done`,
    checklistSkipped: ({ count }) => `${count} skipped`,
    checklistEmpty: 'No checklist items yet',
    checklistUncategorized: 'Other',
    checklistEdit: 'Edit checklist',
    checklistFormatHint: 'Use # Category, then one item per line. It will be grouped automatically after saving.',
    checklistTextLabel: 'Checklist source',
    checklistSave: 'Save checklist',
    checklistSaved: 'Checklist updated',
    checklistNotNeeded: 'Skip',
    checklistUndoSkip: 'Need',
    checklistDone: 'Done',
    checklistTodo: 'Todo',
    restore: 'Restore',
    cancel: 'Cancel',
    impactPreview: 'Impact preview',
    assignToDate: ({ date }) => `Assign to ${date}`,
    datesToClear: 'Dates to clear',
    nextRisks: 'Risks after continuing',
    continueAdjust: 'Continue',
    currentPlanLabel: 'Current plan',
    unplannedToday: 'No plan today',
    currentPlanHelp: 'Pick one from the candidates below. The system checks whether it impacts later plans first.',
    clear: 'Clear',
    moreItems: ({ count }) => `${count} more`,
    riskDetail: 'Warning details',
    noClearRisk: 'No obvious conflicts in the current schedule.',
    noWarnings: 'No warnings',
    collapse: 'Collapse',
    expand: 'Expand',
    switchableCount: ({ count }) => `${count} switchable`,
    candidates: 'Candidates',
    select: 'Select',
    noWeatherForPlace: 'No location weather yet. Update weather first.',
    reminders: 'Reminders',
    bookingAndTickets: 'Bookings and tickets',
    stopsAria: ({ name }) => `${name} itinerary stops`,
    bookingAria: ({ name }) => `${name} bookings and tickets`,
    flexible: 'Flexible',
    noActionNeeded: 'No action',
    undo: 'Undo',
    manage: 'Manage',
    dayCurrent: ({ day }) => `D${day} Today`,
    assignedAriaEmpty: 'Unassigned',
    assignedAriaAdjust: 'Needs adjustment',
    assignedAriaNotice: 'Weather or conditions need review',
    assignedAriaPlanned: 'Scheduled',
    adjust: 'Adjust',
    adjustRecommended: 'Adjust',
    weatherNotIdeal: 'Weather is not ideal',
    confirmWeather: 'Check weather first',
    weatherUnknown: 'Weather unknown',
    temporarySlot: 'Leave for ad-hoc changes',
    normal: 'Normal',
    partialWeatherFailed: ({ errors }) => `Some weather failed: ${errors}`,
    dateNotSuitable: 'Date not suitable',
    closedOrUnavailable: 'Unavailable or closed that day',
    dateNotAllowed: 'Outside allowed dates',
    dayOccupied: 'Day already has a plan',
    alreadyScheduledOn: ({ date }) => `Already scheduled on ${date}`,
    conflictsWith: ({ name }) => `Conflicts with ${name}`,
    samePlanMoved: 'Same plan moved',
    planConflict: 'Plan conflict',
    weatherNotSuitable: 'Weather unsuitable',
    dayUnavailable: 'Unavailable that day',
    incompatibleDate: 'Date unsuitable',
    arrangementConflict: 'Conflicts with another plan',
    scheduledElsewhere: 'Already scheduled elsewhere',
    needsAdjustment: 'Needs adjustment',
    mustUnscheduled: 'Must-go unplanned',
    mustNoAvailableDate: 'Must-go plan has no feasible date',
    bookingIncomplete: 'Booking/ticket incomplete',
    dayUnit: 'days',
    itemUnit: 'items',
  },
};

const PRIORITY_LABELS = {
  zh: { must: '必去', preferred: '想去', backup: '备用', optional: '可放弃' },
  en: { must: 'Must', preferred: 'Want', backup: 'Backup', optional: 'Optional' },
};

const BOOKING_TYPE_LABELS = {
  zh: {
    reservation: { pending: '未预约', done: '已预约', link: '预约', doneAction: '标记已预约' },
    ticket: { pending: '未订票', done: '已订票', link: '订票', doneAction: '标记已订票' },
    confirmation: { pending: '待确认', done: '已确认', link: '查看', doneAction: '标记已确认' },
  },
  en: {
    reservation: { pending: 'Not reserved', done: 'Reserved', link: 'Reserve', doneAction: 'Mark reserved' },
    ticket: { pending: 'No ticket', done: 'Ticketed', link: 'Book', doneAction: 'Mark ticketed' },
    confirmation: { pending: 'To confirm', done: 'Confirmed', link: 'View', doneAction: 'Mark confirmed' },
  },
};

const WEATHER_LABELS = {
  zh: {
    unknown: '未知',
    sunny: '晴',
    partly_cloudy: '少云',
    cloudy: '阴',
    drizzle: '小雨',
    rain: '雨',
    heavy_rain: '大雨',
    storm: '雷雨',
    fog: '雾',
    hot: '热',
    cold: '冷',
    windy: '大风',
  },
  en: {
    unknown: 'Unknown',
    sunny: 'Sunny',
    partly_cloudy: 'Partly cloudy',
    cloudy: 'Cloudy',
    drizzle: 'Drizzle',
    rain: 'Rain',
    heavy_rain: 'Heavy rain',
    storm: 'Storm',
    fog: 'Fog',
    hot: 'Hot',
    cold: 'Cold',
    windy: 'Windy',
  },
};

const WEATHER_STATUS_LABELS = {
  zh: {
    unknown: '天气待确认',
    blocked: '天气不合适',
    best: '天气很适合',
    ok: '天气可以',
    mismatch: '天气一般',
  },
  en: {
    unknown: 'Weather pending',
    blocked: 'Weather unsuitable',
    best: 'Great weather',
    ok: 'Weather works',
    mismatch: 'Weather is okay',
  },
};

const AI_PLANNER_MODE_TEXT = {
  zh: {
    replan: {
      label: 'AI 重排',
      helper: '适合天气、体力或必去计划冲突后，重排后面的日期。',
      placeholder: '例如：明天大雨，我想减少户外，但海边日出和博物馆必须保留，帮我重排剩下几天。',
    },
    generate: {
      label: 'AI 生成',
      helper: '适合生成计划池、补充 backup、新增天数或扩展候选计划。',
      placeholder: '例如：新增一个轻松雨天备用方案；如果现在还是空计划，请生成完整计划池和初始日程。',
    },
  },
  en: {
    replan: {
      label: 'AI Replan',
      helper: 'Useful after weather, energy or must-go conflicts require rearranging the remaining days.',
      placeholder: 'Example: tomorrow has heavy rain. Reduce outdoor time, but keep the sunrise and museum, then replan the remaining days.',
    },
    generate: {
      label: 'AI Generate',
      helper: 'Useful for creating the plan pool, adding backups, adding days or expanding candidates.',
      placeholder: 'Example: add an easy rainy-day indoor backup. If this trip is still empty, generate a full plan pool and initial schedule.',
    },
  },
};

const STORAGE_KEYS = {
  schemaVersion: 'pg_schemaVersion',
  trips: 'pg_trips',
  currentTrip: 'pg_currentTripId',
};

const INTENSITY_META = {
  easy: { label: '轻松', rank: 1 },
  normal: { label: '正常', rank: 2 },
  hard: { label: '费体力', rank: 3 },
};

const PRIORITY_META = {
  must: { label: '必去', rank: 4 },
  preferred: { label: '想去', rank: 3 },
  backup: { label: '备用', rank: 2 },
  optional: { label: '可放弃', rank: 1 },
};

const LEGACY_INTENSITY_MAP = {
  relaxed: 'easy',
  normal: 'normal',
  full: 'hard',
};

function normalizeLanguage(value) {
  return SUPPORTED_LANGUAGES.includes(value) ? value : DEFAULT_LANGUAGE;
}

function getInitialLanguage() {
  try {
    const params = new URLSearchParams(window.location.search);
    return normalizeLanguage(params.get('lang') || DEFAULT_LANGUAGE);
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function getLocale(language) {
  return language === 'en' ? 'en-US' : 'zh-CN';
}

function translate(key, language = DEFAULT_LANGUAGE, vars = {}) {
  const messages = UI_TEXT[normalizeLanguage(language)] || UI_TEXT[DEFAULT_LANGUAGE];
  const fallback = UI_TEXT[DEFAULT_LANGUAGE][key] ?? key;
  const value = messages[key] ?? fallback;

  if (typeof value === 'function') return value(vars);
  return String(value).replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
}

function getPriorityLabel(priority, language = DEFAULT_LANGUAGE) {
  return PRIORITY_LABELS[normalizeLanguage(language)]?.[priority] || PRIORITY_META[priority]?.label || priority;
}

function getBookingTypeMeta(type, language = DEFAULT_LANGUAGE) {
  return BOOKING_TYPE_LABELS[normalizeLanguage(language)]?.[type] || BOOKING_TYPE_LABELS[DEFAULT_LANGUAGE].reservation;
}

function getWeatherLabel(condition, language = DEFAULT_LANGUAGE) {
  return WEATHER_LABELS[normalizeLanguage(language)]?.[condition] || condition || translate('weatherUnknown', language);
}

function getWeatherStatusLabel(level, language = DEFAULT_LANGUAGE) {
  return WEATHER_STATUS_LABELS[normalizeLanguage(language)]?.[level] || level;
}

function getAiModeText(mode, language = DEFAULT_LANGUAGE) {
  return AI_PLANNER_MODE_TEXT[normalizeLanguage(language)]?.[mode] || AI_PLANNER_MODE_TEXT[DEFAULT_LANGUAGE][mode];
}

function formatCount(count, unit, language = DEFAULT_LANGUAGE) {
  if (language === 'en') {
    const isDay = unit === '天' || unit === 'day' || unit === 'days';
    const noun = isDay ? (count === 1 ? 'day' : 'days') : (count === 1 ? 'item' : 'items');
    return `${count} ${noun}`;
  }

  return `${count} ${unit}`;
}

function translateIssue(issue, language = DEFAULT_LANGUAGE) {
  const exactMap = {
    不在可去日期: 'dateNotAllowed',
    '当天不可用/闭馆': 'closedOrUnavailable',
    当天已有安排: 'dayOccupied',
    日期不适合: 'dateNotSuitable',
    天气未知: 'weatherUnknown',
    天气不合适: 'weatherNotSuitable',
    同一计划被移动: 'samePlanMoved',
    计划互斥: 'planConflict',
    天气不是最理想: 'weatherNotIdeal',
    先确认天气: 'confirmWeather',
  };
  if (exactMap[issue]) return translate(exactMap[issue], language);

  const scheduledMatch = issue.match(/^已安排在 (.+)$/);
  if (scheduledMatch) return translate('alreadyScheduledOn', language, { date: scheduledMatch[1] });

  const conflictMatch = issue.match(/^与 (.+) 互斥$/);
  if (conflictMatch) return translate('conflictsWith', language, { name: conflictMatch[1] });

  return issue;
}

function translateRiskTitle(title, language = DEFAULT_LANGUAGE) {
  const titleMap = {
    必去计划没有可安排日期: 'mustNoAvailableDate',
    必去未排: 'mustUnscheduled',
    '预约/订票未完成': 'bookingIncomplete',
    天气不合适: 'weatherNotSuitable',
    当天不可用: 'dayUnavailable',
    日期不合适: 'incompatibleDate',
    和其他安排冲突: 'arrangementConflict',
    已经排在别的日期: 'scheduledElsewhere',
    需要调整: 'needsAdjustment',
  };

  return titleMap[title] ? translate(titleMap[title], language) : title;
}

function formatDateId(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateId(dateId) {
  const [year, month, day] = dateId.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(dateId, offset) {
  const date = parseDateId(dateId);
  date.setDate(date.getDate() + offset);
  return formatDateId(date);
}

function getInclusiveDateSpan(startDateId, endDateId) {
  const start = parseDateId(startDateId);
  const end = parseDateId(endDateId);
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  return clampTripDays(diff);
}

function getTodayId() {
  return formatDateId(new Date());
}

function formatTripRange(startDateStr, tripDays, language = DEFAULT_LANGUAGE) {
  const start = parseDateId(startDateStr);
  const endId = addDays(startDateStr, Math.max(tripDays - 1, 0));
  const end = parseDateId(endId);
  const locale = getLocale(language);
  const startText = start.toLocaleDateString(locale, { month: 'numeric', day: 'numeric' });
  const endText = end.toLocaleDateString(locale, { month: 'numeric', day: 'numeric' });
  return `${startText} - ${endText}`;
}

function safeJsonRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function clampTripDays(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TRIP_DAYS;
  return Math.min(Math.max(parsed, 1), 30);
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value) return [value];
  return [];
}

function uniq(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function createTripDates(startDateStr, tripDays, language = DEFAULT_LANGUAGE) {
  if (!startDateStr || tripDays < 1) return [];

  return Array.from({ length: tripDays }, (_, index) => {
    const id = addDays(startDateStr, index);
    const date = parseDateId(id);
    const display = date.toLocaleDateString(getLocale(language), {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
    });
    return { id, display, dayNumber: index + 1 };
  });
}

function formatAssignedDate(dateId, tripDates) {
  const matchedDate = tripDates.find((date) => date.id === dateId);
  return matchedDate ? `D${matchedDate.dayNumber} · ${matchedDate.display}` : dateId;
}

function formatMiniDate(dateId) {
  const date = parseDateId(dateId);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function isMonday(dateId) {
  return parseDateId(dateId).getDay() === 1;
}

const QINGDAO_LOCATION = {
  label: '青岛市',
  query: 'Qingdao',
  weatherLabel: '青岛市',
  latitude: 36.0671,
  longitude: 120.3826,
};

const WEIHAI_LOCATION = {
  label: '威海市',
  query: 'Weihai',
  weatherLabel: '威海市',
  latitude: 37.5135,
  longitude: 122.1217,
};

const YANTAI_LOCATION = {
  label: '烟台市',
  query: 'Yantai',
  weatherLabel: '烟台市',
  latitude: 37.4638,
  longitude: 121.4479,
};

function place(baseLocation, label, address = '') {
  return { ...baseLocation, label, address };
}

function createExamplePlans(startDate) {
  const dates = Array.from({ length: DEFAULT_TRIP_DAYS }, (_, index) => addDays(startDate, index));
  const museumClosed = dates.filter(isMonday);

  return [
    {
      id: 'sunrise-sea',
      name: '海边日出和早市',
      description: '早起看日出，顺路去早市吃早餐，上午留给海边散步。',
      priority: 'must',
      location: { ...QINGDAO_LOCATION, label: '青岛海边' },
      stops: [
        { time: '05:00', title: '栈桥看日出', location: place(QINGDAO_LOCATION, '栈桥海边', '青岛市市南区太平路12号附近'), note: '提前看潮汐和云量，适合天气好时执行' },
        { time: '07:10', title: '团岛早市早餐', location: place(QINGDAO_LOCATION, '团岛农贸市场', '青岛市市南区四川路31号附近'), note: '海鲜馄饨、甜沫或烧饼，作为早起奖励' },
        { time: '09:00', title: '八大峡海岸散步', location: place(QINGDAO_LOCATION, '八大峡广场'), note: '慢慢走回酒店，上午结束前留休息时间' },
      ],
      available_dates: dates.slice(0, 2),
      time_window: '05:00-11:00',
      duration: '半天',
      intensity: 'normal',
      weather_rules: {
        best: ['sunny', 'partly_cloudy'],
        ok: ['cloudy'],
        blocked: ['rain', 'heavy_rain', 'storm', 'fog', 'windy'],
      },
      conflicts: ['lazy-beach'],
      reminders: [{ time: '前一晚', text: '确认日出时间、潮汐和云量，太晚睡就不要硬上' }],
      tips: ['早市现金和纸巾提前备好'],
      tags: ['户外', '清晨'],
    },
    {
      id: 'weihai-coast-day',
      name: '青岛到威海海岸线',
      description: '早上从青岛出发，高铁到威海串联海边公园和观景台，跨城天气要一起看。',
      priority: 'must',
      location: { ...WEIHAI_LOCATION, label: '威海海岸线' },
      stops: [
        { time: '07:20', title: '青岛站出发', location: place(QINGDAO_LOCATION, '青岛站', '青岛市市南区泰安路2号'), note: '预留早餐和进站时间，车票约束强' },
        { time: '09:10', title: '威海站到达', location: place(WEIHAI_LOCATION, '威海站', '威海市环翠区疏站路'), note: '先确认返程车次，避免晚上太被动' },
        { time: '10:20', title: '火炬八街和海水浴场', location: place(WEIHAI_LOCATION, '火炬八街'), note: '主拍照点，风大或雨大体验会明显下降' },
        { time: '13:00', title: '环海路午餐', location: place(WEIHAI_LOCATION, '环海路'), note: '中午不赶路，给下午海岸线留体力' },
        { time: '15:30', title: '猫头山观景台', location: place(WEIHAI_LOCATION, '猫头山'), note: '看风和能见度，雾天直接降级为市区轻量版' },
        { time: '18:20', title: '威海站返程', location: place(WEIHAI_LOCATION, '威海站'), note: '返程后不再叠加夜市，避免当天过载' },
      ],
      available_dates: dates.slice(1, 4),
      time_window: '07:20-21:00',
      duration: '全天跨城',
      intensity: 'hard',
      weather_rules: {
        best: ['sunny', 'partly_cloudy'],
        ok: ['cloudy'],
        blocked: ['drizzle', 'rain', 'heavy_rain', 'storm', 'windy', 'fog'],
      },
      conflicts: ['night-market', 'old-town-walk'],
      reminders: [
        { time: '前一晚', text: '确认高铁票和返程班次，必要时先买返程票' },
        { time: '18:00', text: '开始往威海站收束，避免错过返程' },
      ],
      bookings: [
        {
          id: 'weihai-train-ticket',
          type: 'ticket',
          title: '青岛往返威海高铁票',
          status: 'pending',
          address: '青岛站 / 威海站',
          url: 'https://www.12306.cn/index/',
          cancel_url: 'https://www.12306.cn/index/',
          note: '跨城当天交通约束强，建议至少前一晚确认车次',
        },
      ],
      tips: ['跨城当天不要再叠加夜市或高体力计划'],
      tags: ['跨城', '高铁', '户外多点'],
    },
    {
      id: 'museum-day',
      name: '市区博物馆和咖啡',
      description: '把雨天或高温天留给室内，逛完博物馆附近找咖啡店休息。',
      priority: 'preferred',
      location: { ...QINGDAO_LOCATION, label: '青岛市博物馆' },
      stops: [
        { time: '10:30', title: '青岛市博物馆', location: place(QINGDAO_LOCATION, '青岛市博物馆', '青岛市崂山区梅岭东路51号'), note: '闭馆日需要避开，适合雨天或高温' },
        { time: '13:00', title: '石老人咖啡午休', location: place(QINGDAO_LOCATION, '石老人咖啡街区'), note: '午餐和休息，不把下午排满' },
        { time: '15:00', title: '雕塑园短逛', location: place(QINGDAO_LOCATION, '青岛雕塑园'), note: '天气可接受时加一段轻量户外' },
      ],
      available_dates: dates,
      closed_dates: museumClosed,
      time_window: '10:00-16:00',
      duration: '半天',
      intensity: 'easy',
      weather_rules: {
        best: ['rain', 'drizzle', 'hot', 'cold'],
        ok: ['cloudy', 'partly_cloudy', 'sunny'],
        blocked: [],
      },
      conflicts: [],
      reminders: [{ time: '出发前', text: '确认预约、开放时间和临时展闭展信息' }],
      bookings: [
        {
          id: 'qingdao-museum-reservation',
          type: 'reservation',
          title: '青岛市博物馆预约',
          status: 'pending',
          address: '青岛市崂山区梅岭东路51号',
          url: 'https://www.qingdaomuseum.com/',
          note: '闭馆日和临时展预约入口可能变化，出发前再确认',
        },
      ],
      tags: ['室内', museumClosed.length ? '周一闭馆' : '闭馆日留意'],
    },
    {
      id: 'old-town-walk',
      name: '老城漫步和小店',
      description: '走老街、拍照、找小店，天气太热或下雨时可以换成室内备用。',
      priority: 'preferred',
      location: { ...QINGDAO_LOCATION, label: '青岛老城' },
      stops: [
        { time: '15:00', title: '大学路和鱼山路', location: place(QINGDAO_LOCATION, '大学路'), note: '拍照和小店，太阳太强会比较累' },
        { time: '16:40', title: '信号山看城市线', location: place(QINGDAO_LOCATION, '信号山公园'), note: '有爬坡，雨天或高温体验会明显下降' },
        { time: '18:30', title: '黄县路晚餐', location: place(QINGDAO_LOCATION, '黄县路'), note: '晚饭后可以顺路散步回酒店' },
      ],
      available_dates: dates.slice(2, 5),
      time_window: '15:00-20:00',
      duration: '半天',
      intensity: 'hard',
      weather_rules: {
        best: ['partly_cloudy', 'cloudy'],
        ok: ['sunny'],
        blocked: ['rain', 'heavy_rain', 'hot', 'storm'],
      },
      conflicts: [],
      tips: ['信号山有坡，鞋子不舒服时直接跳过'],
      tags: ['步行', '街区'],
    },
    {
      id: 'night-market',
      name: '夜市海鲜和烤肉',
      description: '最后一晚安排海鲜和烤肉，适合接在白天较轻松的安排后面。',
      priority: 'preferred',
      location: { ...QINGDAO_LOCATION, label: '青岛夜市' },
      stops: [
        { time: '18:00', title: '台东夜市小吃', location: place(QINGDAO_LOCATION, '台东夜市'), note: '先垫肚子，避开太晚排队' },
        { time: '20:00', title: '啤酒街烤肉', location: place(QINGDAO_LOCATION, '登州路啤酒街'), note: '雨不大也能执行，暴雨就换室内' },
      ],
      available_dates: dates.slice(3, 5),
      time_window: '18:00-22:00',
      duration: '晚上',
      intensity: 'normal',
      weather_rules: {
        best: ['cloudy', 'partly_cloudy', 'sunny'],
        ok: ['hot', 'drizzle'],
        blocked: ['heavy_rain', 'storm'],
      },
      conflicts: [],
      reminders: [{ time: '21:00', text: '控制收尾时间，第二天有早起计划就别拖太晚' }],
      tags: ['美食', '夜间'],
    },
    {
      id: 'lazy-beach',
      name: '慢速海滩躺平',
      description: '睡到自然醒，下午去海滩喝饮料，晚点再看落日。',
      priority: 'backup',
      location: { ...QINGDAO_LOCATION, label: '青岛海边' },
      stops: [
        { time: '14:30', title: '石老人海滩躺平', location: place(QINGDAO_LOCATION, '石老人海水浴场'), note: '低体力备用，不抢早上时间' },
        { time: '17:00', title: '小麦岛看落日', location: place(QINGDAO_LOCATION, '小麦岛公园'), note: '适合晴天或少云，大风就取消' },
      ],
      available_dates: dates.slice(1, 5),
      time_window: '14:00-19:00',
      duration: '半天',
      intensity: 'easy',
      weather_rules: {
        best: ['sunny', 'partly_cloudy'],
        ok: ['cloudy', 'hot'],
        blocked: ['rain', 'heavy_rain', 'storm', 'windy'],
      },
      conflicts: ['sunrise-sea'],
      tags: ['低体力', '户外'],
    },
    {
      id: 'rainy-cafe',
      name: '雨天咖啡和书店',
      description: '下雨或太累时切换到室内，留出空白给临时调整。',
      priority: 'backup',
      location: { ...QINGDAO_LOCATION, label: '青岛市区' },
      stops: [
        { time: '13:30', title: '书店和咖啡', location: place(QINGDAO_LOCATION, '万象城书店'), note: '恢复体力，适合雨天或临时调整' },
        { time: '16:00', title: '商场补给', location: place(QINGDAO_LOCATION, '青岛万象城'), note: '买伞、防晒、药品等旅行补给' },
      ],
      available_dates: dates,
      time_window: '13:00-18:00',
      duration: '半天',
      intensity: 'easy',
      weather_rules: {
        best: ['rain', 'drizzle', 'cold'],
        ok: ['cloudy', 'hot', 'heavy_rain'],
        blocked: [],
      },
      conflicts: [],
      tags: ['室内', '恢复'],
    },
    {
      id: 'yantai-penglai-backup',
      name: '烟台蓬莱跨城备用',
      description: '如果天气特别好且体力在线，可以临时升级成烟台蓬莱一日线，否则不要硬排。',
      priority: 'backup',
      location: { ...YANTAI_LOCATION, label: '烟台蓬莱' },
      stops: [
        { time: '07:00', title: '青岛北站出发', location: place(QINGDAO_LOCATION, '青岛北站'), note: '跨城备用，前一晚再决定是否执行' },
        { time: '09:30', title: '烟台站换乘', location: place(YANTAI_LOCATION, '烟台站'), note: '交通不确定性高，必须留缓冲' },
        { time: '11:00', title: '蓬莱阁海边', location: place(YANTAI_LOCATION, '蓬莱阁'), note: '户外主体验，阴雨和大风直接不选' },
        { time: '14:30', title: '八仙过海景区外圈', location: place(YANTAI_LOCATION, '八仙过海景区'), note: '根据体力选择走完整圈或只看海边' },
        { time: '17:40', title: '返程回青岛', location: place(YANTAI_LOCATION, '烟台南站'), note: '当天结束较晚，后续计划需要降强度' },
      ],
      available_dates: dates.slice(2, 5),
      time_window: '07:00-22:00',
      duration: '全天跨城',
      intensity: 'hard',
      weather_rules: {
        best: ['sunny'],
        ok: ['partly_cloudy'],
        blocked: ['cloudy', 'drizzle', 'rain', 'heavy_rain', 'storm', 'windy', 'fog', 'hot'],
      },
      conflicts: ['weihai-coast-day', 'old-town-walk', 'night-market'],
      bookings: [
        {
          id: 'yantai-train-ticket',
          type: 'ticket',
          title: '青岛到烟台往返车票',
          status: 'pending',
          address: '青岛北站 / 烟台南站',
          url: 'https://www.12306.cn/index/',
          cancel_url: 'https://www.12306.cn/index/',
          note: '备用跨城线，确定执行后再订，避免退改',
        },
      ],
      tags: ['跨城备用', '交通约束', '高体力'],
    },
    {
      id: 'seafood-market',
      name: '海鲜市场临时加餐',
      description: '按当天距离和排队情况决定，适合插在交通顺路的时候。',
      priority: 'backup',
      location: { ...QINGDAO_LOCATION, label: '青岛海鲜市场' },
      stops: [
        { time: '11:00', title: '团岛市场买海鲜', location: place(QINGDAO_LOCATION, '团岛农贸市场'), note: '看当天人流，顺路才安排' },
        { time: '12:30', title: '附近加工店午餐', location: place(QINGDAO_LOCATION, '团岛市场周边'), note: '用餐时间可压缩，作为插入型计划' },
      ],
      available_dates: dates,
      time_window: '11:00-14:00',
      duration: '2小时',
      intensity: 'easy',
      weather_rules: {
        best: ['cloudy', 'rain', 'hot'],
        ok: ['sunny', 'partly_cloudy', 'drizzle'],
        blocked: ['heavy_rain', 'storm'],
      },
      conflicts: [],
      tags: ['美食', '可插入'],
    },
  ];
}

function createExampleSchedule(startDate) {
  return {
    [addDays(startDate, 0)]: { planId: 'sunrise-sea' },
    [addDays(startDate, 1)]: { planId: 'weihai-coast-day' },
    [addDays(startDate, 2)]: { planId: 'museum-day' },
    [addDays(startDate, 3)]: { planId: 'old-town-walk' },
    [addDays(startDate, 4)]: { planId: 'night-market' },
  };
}

function createTripId() {
  return `trip-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function createExampleTripSnapshot(name = '青岛 5 日示例', startDate = getTodayId(), id = createTripId()) {
  return {
    id,
    name,
    startDateStr: startDate,
    tripDays: DEFAULT_TRIP_DAYS,
    plans: createExamplePlans(startDate),
    schedule: createExampleSchedule(startDate),
    weatherData: {},
    checklistText: DEFAULT_CHECKLIST_TEXT,
    checklistState: {},
    archived: false,
  };
}

function createEmptyTripSnapshot(name = '新旅行计划', startDate = getTodayId(), id = createTripId()) {
  return {
    id,
    name,
    startDateStr: startDate,
    tripDays: DEFAULT_TRIP_DAYS,
    plans: [],
    schedule: {},
    weatherData: {},
    checklistText: DEFAULT_CHECKLIST_TEXT,
    checklistState: {},
    archived: false,
  };
}

function normalizeTripSnapshot(trip, index = 0) {
  const startDate = trip.startDateStr || trip.startDate || getTodayId();
  const tripDays = clampTripDays(trip.tripDays || trip.days || DEFAULT_TRIP_DAYS);

  return {
    id: trip.id || `trip-${index + 1}`,
    name: trip.name || trip.title || `旅行计划 ${index + 1}`,
    startDateStr: startDate,
    tripDays,
    plans: Array.isArray(trip.plans) ? trip.plans : [],
    schedule: normalizeSchedule(trip.schedule || {}),
    weatherData: trip.weatherData || {},
    checklistText: normalizeChecklistText(
      Object.hasOwn(trip, 'checklistText') ? trip.checklistText : trip.checklist || trip.packingList,
    ),
    checklistState: normalizeChecklistState(trip.checklistState || trip.checklistStatus),
    archived: Boolean(trip.archived),
  };
}

function inferWeatherLabel(location) {
  if (!location || typeof location !== 'object') return undefined;

  const weatherLocation = location.weatherLocation || location.weather_location || location.weather;
  if (typeof weatherLocation === 'string') return weatherLocation;
  if (weatherLocation && typeof weatherLocation === 'object') {
    return inferWeatherLabel(weatherLocation) || weatherLocation.label || weatherLocation.name || weatherLocation.query;
  }

  if (location.weatherLabel || location.weather_label || location.city || location.district || location.area) {
    return location.weatherLabel || location.weather_label || location.city || location.district || location.area;
  }

  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const isQingdao =
    location.query === QINGDAO_LOCATION.query ||
    (Math.abs(latitude - QINGDAO_LOCATION.latitude) < 0.01 && Math.abs(longitude - QINGDAO_LOCATION.longitude) < 0.01);

  return isQingdao ? QINGDAO_LOCATION.weatherLabel : undefined;
}

function normalizeLocation(location, area) {
  if (typeof location === 'string') {
    return {
      label: location,
      query: area || location,
      weatherLabel: area || location,
      address: '',
    };
  }

  if (location && typeof location === 'object') {
    const weatherLocation = location.weatherLocation || location.weather_location || location.weather;
    const weatherLocationObject = weatherLocation && typeof weatherLocation === 'object' ? weatherLocation : null;
    const weatherLocationText = typeof weatherLocation === 'string' ? weatherLocation : '';
    const weatherLabel = inferWeatherLabel(location);
    const query =
      location.weatherQuery ||
      location.weather_query ||
      weatherLocationText ||
      weatherLocationObject?.query ||
      weatherLocationObject?.label ||
      weatherLocationObject?.name ||
      location.query ||
      weatherLabel ||
      area ||
      location.label ||
      location.name ||
      '';

    return {
      label: location.label || location.name || location.query || area || '待定地点',
      query,
      weatherLabel,
      latitude: weatherLocationObject?.latitude ?? location.latitude,
      longitude: weatherLocationObject?.longitude ?? location.longitude,
      address: location.address || location.addr || location.full_address || '',
    };
  }

  return { label: area || '待定地点', query: area || '', address: '' };
}

function hasCoordinates(location) {
  return location.latitude !== undefined && location.latitude !== null && location.longitude !== undefined && location.longitude !== null;
}

function getWeatherLocationKey(location) {
  if (location.query) return location.query;
  if (hasCoordinates(location)) return `${location.latitude},${location.longitude}`;
  return location.label;
}

function getWeatherLocationLabel(location) {
  return location.weatherLabel || location.weather_label || location.city || location.district || location.area || location.query || location.label;
}

function hasOwnWeatherSource(location) {
  if (!location || typeof location !== 'object') return false;

  return Boolean(
    location.query ||
      hasCoordinates(location) ||
      location.weatherLocation ||
      location.weather_location ||
      location.weather ||
      location.weatherQuery ||
      location.weather_query ||
      location.weatherLabel ||
      location.weather_label ||
      location.city ||
      location.district ||
      location.area,
  );
}

function normalizeStopLocation(rawLocation, fallbackLocation) {
  if (!rawLocation) return fallbackLocation;

  if (typeof rawLocation === 'string') {
    return {
      ...fallbackLocation,
      label: rawLocation,
      weatherLabel: getWeatherLocationLabel(fallbackLocation),
    };
  }

  if (hasOwnWeatherSource(rawLocation)) {
    return normalizeLocation(rawLocation, getWeatherLocationLabel(fallbackLocation));
  }

  const displayLocation = normalizeLocation(rawLocation, fallbackLocation.label);
  return {
    ...fallbackLocation,
    label: displayLocation.label,
    weatherLabel: getWeatherLocationLabel(fallbackLocation),
    address: displayLocation.address || fallbackLocation.address || '',
  };
}

function normalizePlanStops(stops, fallbackLocation) {
  if (!Array.isArray(stops)) return [];

  return stops
    .filter(Boolean)
    .map((stop, index) => {
      if (typeof stop === 'string') {
        return {
          id: `stop-${index + 1}`,
          time: '',
          title: stop,
          location: normalizeStopLocation(stop, fallbackLocation),
          note: '',
          weatherRelevant: true,
        };
      }

      const location = normalizeStopLocation(stop.location || stop.place || fallbackLocation, fallbackLocation);
      const time = stop.time || stop.time_window || stop.window || (stop.start && stop.end ? `${stop.start}-${stop.end}` : stop.start || '');

      return {
        id: stop.id || `stop-${index + 1}`,
        time,
        title: stop.title || stop.name || location.label,
        location,
        note: stop.note || stop.description || '',
        weatherRelevant: stop.weather_relevant !== false && stop.weatherRelevant !== false,
      };
    });
}

function normalizePlanReminders(value) {
  return toArray(value)
    .map((item, index) => {
      if (typeof item === 'string') {
        return { id: `reminder-${index + 1}`, time: '', text: item };
      }

      return {
        id: item.id || `reminder-${index + 1}`,
        time: item.time || item.at || '',
        text: item.text || item.title || item.note || item.description || '',
      };
    })
    .filter((item) => item.text);
}

function normalizePlanTips(value) {
  return toArray(value)
    .map((item) => (typeof item === 'string' ? item : item.text || item.title || item.note || item.description || ''))
    .filter(Boolean);
}

function normalizeBookingType(value) {
  const type = String(value || '').toLowerCase();
  if (['ticket', 'train', 'flight', 'boat', 'ferry', 'pass', '票', '车票', '门票'].includes(type)) return 'ticket';
  if (['confirm', 'confirmation', 'check', 'notice', '确认'].includes(type)) return 'confirmation';
  return 'reservation';
}

function normalizeBookingStatus(value, item = {}) {
  if (item.done || item.booked || item.reserved || item.purchased || item.confirmed) return 'done';

  const status = String(value || '').toLowerCase();
  if (['done', 'booked', 'reserved', 'purchased', 'confirmed', 'complete', 'completed', '已预约', '已订票', '已确认'].includes(status)) {
    return 'done';
  }
  if (['none', 'not_needed', 'optional', '无需', '无需预约'].includes(status)) return 'none';
  return 'pending';
}

function normalizeBookingItem(item, index, fallbackType = 'reservation') {
  if (typeof item === 'string') {
    return {
      id: `booking-${index + 1}`,
      type: normalizeBookingType(fallbackType),
      title: item,
      status: 'pending',
      address: '',
      url: '',
      cancelUrl: '',
      note: '',
    };
  }

  const type = normalizeBookingType(item.type || item.kind || fallbackType);
  const location = item.location && typeof item.location === 'object' ? item.location : null;

  return {
    id: item.id || `booking-${index + 1}`,
    type,
    title: item.title || item.name || item.label || (type === 'ticket' ? '订票' : '预约'),
    status: normalizeBookingStatus(item.status, item),
    address: item.address || item.addr || location?.address || item.place || location?.label || '',
    url: item.url || item.link || item.booking_url || item.bookingUrl || item.reserve_url || item.reserveUrl || '',
    cancelUrl: item.cancel_url || item.cancelUrl || item.refund_url || item.refundUrl || item.manage_url || item.manageUrl || '',
    note: item.note || item.description || item.text || '',
  };
}

function normalizePlanBookings(plan) {
  const bookings = [
    ...toArray(plan.bookings),
    ...toArray(plan.reservations).map((item) => (
      typeof item === 'string' ? item : { ...item, type: item.type || 'reservation' }
    )),
    ...toArray(plan.appointments).map((item) => (
      typeof item === 'string' ? item : { ...item, type: item.type || 'reservation' }
    )),
    ...toArray(plan.tickets).map((item) => (
      typeof item === 'string' ? item : { ...item, type: item.type || 'ticket' }
    )),
  ];

  return bookings
    .map((item, index) => normalizeBookingItem(item, index))
    .filter((item) => item.title);
}

function uniqueLocations(locations) {
  const locationsByKey = new Map();

  locations.filter(Boolean).forEach((location) => {
    if (!location.query && !hasCoordinates(location) && !location.label) return;

    const key = getWeatherLocationKey(location);
    if (!locationsByKey.has(key)) {
      locationsByKey.set(key, {
        ...location,
        weatherLabel: getWeatherLocationLabel(location),
      });
    }
  });

  return Array.from(locationsByKey.values());
}

function getPlanWeatherLocations(plan) {
  const stopLocations = toArray(plan.stops)
    .filter((stop) => stop.weatherRelevant)
    .map((stop) => stop.location);

  return uniqueLocations([...stopLocations, plan.location]);
}

function normalizeWeatherRules(plan) {
  if (plan.weather_rules) {
    return {
      best: toArray(plan.weather_rules.best),
      ok: toArray(plan.weather_rules.ok),
      blocked: toArray(plan.weather_rules.blocked),
    };
  }

  const legacyWeather = toArray(plan.weather);
  const best = legacyWeather.filter((item) => item !== 'any');
  return {
    best: best.length ? best : ['sunny', 'partly_cloudy'],
    ok: legacyWeather.includes('any') ? ['sunny', 'partly_cloudy', 'cloudy', 'drizzle'] : ['cloudy'],
    blocked: ['heavy_rain', 'storm'],
  };
}

function normalizePlan(plan, index = 0, tripDates = []) {
  const tripDateIds = tripDates.map((date) => date.id);
  const availableDates = toArray(plan.available_dates || plan.suitable_days);
  const priority = plan.must_go || plan.must ? 'must' : plan.priority || 'preferred';
  const rawIntensity = plan.intensity || LEGACY_INTENSITY_MAP[plan.pace] || plan.pace;
  const intensity = INTENSITY_META[rawIntensity] ? rawIntensity : 'normal';
  const rawStops = Array.isArray(plan.stops) ? plan.stops : plan.itinerary;
  const firstStopWithLocation = Array.isArray(rawStops)
    ? rawStops.find((stop) => stop?.location || stop?.place)
    : null;
  const fallbackLocation = normalizeLocation(plan.location || firstStopWithLocation?.location || firstStopWithLocation?.place, plan.area);
  const stops = normalizePlanStops(rawStops, fallbackLocation);
  const primaryStop = stops.find((stop) => stop.weatherRelevant) || stops[0];
  const location = normalizeLocation(plan.location || primaryStop?.location || fallbackLocation, plan.area);

  return {
    id: plan.id || `plan-${Date.now()}-${index}`,
    name: plan.name || '未命名计划',
    description: plan.description || '暂无说明。',
    priority: PRIORITY_META[priority] ? priority : 'preferred',
    location,
    stops,
    available_dates: availableDates.length ? availableDates : tripDateIds,
    closed_dates: toArray(plan.closed_dates || plan.unavailable_days),
    time_window: plan.time_window || plan.window || '弹性',
    duration: plan.duration || '半天',
    intensity,
    weather_rules: normalizeWeatherRules(plan),
    conflicts: toArray(plan.conflicts || plan.mutually_exclusive_with),
    reminders: normalizePlanReminders(plan.reminders || plan.special_reminders || plan.alerts),
    tips: normalizePlanTips(plan.tips || plan.hints),
    bookings: normalizePlanBookings(plan),
    tags: toArray(plan.tags),
  };
}

function normalizeSchedule(schedule) {
  return Object.fromEntries(
    Object.entries(schedule || {})
      .filter(([, value]) => Boolean(value))
      .map(([dateId, value]) => {
        if (typeof value === 'string') {
          return [dateId, { planId: value }];
        }
        return [
          dateId,
          {
            planId: value.planId || value.id,
          },
        ];
      })
      .filter(([, value]) => Boolean(value.planId)),
  );
}

function normalizeChecklistText(text, fallback = DEFAULT_CHECKLIST_TEXT) {
  if (typeof text === 'string') return text.trim();
  return fallback;
}

function normalizeChecklistState(state) {
  return Object.fromEntries(
    Object.entries(state || {})
      .filter(([, value]) => Object.values(CHECKLIST_STATUS).includes(value)),
  );
}

function cleanupChecklistLine(line) {
  return line
    .replace(/^\s*[-*]\s*\[[ xX]\]\s*/, '')
    .replace(/^\s*[-*]\s*/, '')
    .trim();
}

function getChecklistId(groupTitle, itemText, occurrence) {
  const suffix = occurrence > 0 ? `::${occurrence + 1}` : '';
  return `${groupTitle.trim()}::${itemText.trim()}${suffix}`;
}

function parseChecklistText(text, language = DEFAULT_LANGUAGE) {
  const groups = [];
  const seenItems = new Map();
  let currentGroup = null;

  const ensureGroup = (title) => {
    const isFallbackGroup = !title?.trim();
    const groupTitle = isFallbackGroup ? translate('checklistUncategorized', language) : title.trim();
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

  return groups.filter((group) => group.items.length > 0);
}

function getChecklistStats(groups, state) {
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

function isEmptyTripDraft(trip) {
  return !Array.isArray(trip?.plans) || trip.plans.length === 0;
}

function pruneEmptyTripDrafts(tripList, activeTripId) {
  return tripList.filter((trip) => !isEmptyTripDraft(trip) || trip.id === activeTripId);
}

function getPendingBookings(plan) {
  return toArray(plan?.bookings).filter((booking) => booking.status === 'pending');
}

function getSmartSelectedDate(startDate, tripDays) {
  const tripDateIds = createTripDates(startDate, tripDays).map((date) => date.id);
  const today = getTodayId();

  if (tripDateIds.includes(today)) return today;
  return tripDateIds[0] || startDate;
}

function loadInitialState() {
  const currentVersion = localStorage.getItem(STORAGE_KEYS.schemaVersion);
  const storedTrips = safeJsonRead(STORAGE_KEYS.trips, null);
  const loadedTrips = currentVersion === APP_SCHEMA_VERSION && Array.isArray(storedTrips) && storedTrips.length > 0
    ? storedTrips.map(normalizeTripSnapshot)
    : [createEmptyTripSnapshot('新旅行计划', getTodayId(), 'trip-default')];

  const requestedActiveTripId = localStorage.getItem(STORAGE_KEYS.currentTrip) || loadedTrips[0].id;
  const visibleLoadedTrips = loadedTrips.filter((trip) => !trip.archived);
  const loadedActiveTrip = visibleLoadedTrips.find((trip) => trip.id === requestedActiveTripId) || visibleLoadedTrips[0] || loadedTrips[0];
  const trips = pruneEmptyTripDrafts(loadedTrips, loadedActiveTrip.id);
  const visibleTrips = trips.filter((trip) => !trip.archived);
  const activeTrip = visibleTrips.find((trip) => trip.id === loadedActiveTrip.id) || visibleTrips[0] || trips[0];

  return {
    trips,
    activeTripId: activeTrip.id,
    tripName: activeTrip.name,
    startDate: activeTrip.startDateStr,
    tripDays: activeTrip.tripDays,
    plans: activeTrip.plans,
    schedule: activeTrip.schedule,
    selectedDate: getSmartSelectedDate(activeTrip.startDateStr, activeTrip.tripDays),
    weatherData: activeTrip.weatherData,
    checklistText: activeTrip.checklistText,
    checklistState: activeTrip.checklistState,
  };
}

function parseImportJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1].trim() : trimmed);
}

function formatWeatherMetrics(primary, tempMin, tempMax, precipitationProbability, windMax, language = DEFAULT_LANGUAGE) {
  const precipLabel = language === 'en' ? 'Rain ' : '降水';
  const windLabel = language === 'en' ? 'Wind ' : '风';
  return `${getWeatherLabel(primary, language)} ${Math.round(tempMin)}-${Math.round(tempMax)}°C / ${precipLabel}${Math.round(precipitationProbability || 0)}% / ${windLabel}${Math.round(windMax || 0)}km/h`;
}

function formatWeatherSummary(snapshot, language = DEFAULT_LANGUAGE) {
  if (!snapshot) return '';
  if (Array.isArray(snapshot.entries) && snapshot.entries.length) {
    return snapshot.entries
      .map((entry) => `${getWeatherLocationLabel(entry.location)} ${formatWeatherSummary(entry.snapshot, language)}`)
      .join(language === 'en' ? '; ' : '；');
  }

  if (Number.isFinite(snapshot.tempMin) && Number.isFinite(snapshot.tempMax)) {
    return formatWeatherMetrics(snapshot.primary, snapshot.tempMin, snapshot.tempMax, snapshot.precipitationProbability, snapshot.windMax, language);
  }

  return snapshot.summary || '';
}

function planConflicts(a, b) {
  return a.conflicts.includes(b.id) || b.conflicts.includes(a.id);
}

function classifyWeatherCode(code) {
  if (code === 0) return 'sunny';
  if (code === 1 || code === 2) return 'partly_cloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ([61, 63, 66, 67, 80, 81].includes(code)) return 'rain';
  if (code === 65 || code === 82) return 'heavy_rain';
  if (code >= 71 && code <= 86) return 'cold';
  if (code >= 95) return 'storm';
  return 'unknown';
}

function buildWeatherSnapshot(day) {
  if (!day) return null;

  const categories = new Set([classifyWeatherCode(day.weatherCode)]);
  if (day.tempMax >= 32 || day.apparentMax >= 34) categories.add('hot');
  if (day.tempMin <= 5 || day.apparentMin <= 3) categories.add('cold');
  if (day.windMax >= 35) categories.add('windy');
  if (day.precipitationSum >= 12 || day.precipitationProbability >= 80) categories.add('heavy_rain');
  if (day.precipitationSum > 0 && day.precipitationSum < 4 && day.precipitationProbability >= 35) categories.add('drizzle');
  if (day.precipitationSum >= 4 && day.precipitationSum < 12) categories.add('rain');

  const primary = categories.has('storm')
    ? 'storm'
    : categories.has('heavy_rain')
      ? 'heavy_rain'
      : categories.has('rain')
        ? 'rain'
        : categories.has('drizzle')
          ? 'drizzle'
          : classifyWeatherCode(day.weatherCode);

  return {
    primary,
    categories: Array.from(categories),
    tempMin: Math.round(day.tempMin),
    tempMax: Math.round(day.tempMax),
    precipitationProbability: Math.round(day.precipitationProbability || 0),
    windMax: Math.round(day.windMax || 0),
    summary: formatWeatherMetrics(primary, day.tempMin, day.tempMax, day.precipitationProbability, day.windMax),
    source: 'auto',
  };
}

function pickPrimaryWeatherCategory(categories) {
  if (categories.includes('storm')) return 'storm';
  if (categories.includes('heavy_rain')) return 'heavy_rain';
  if (categories.includes('rain')) return 'rain';
  if (categories.includes('drizzle')) return 'drizzle';
  if (categories.includes('windy')) return 'windy';
  if (categories.includes('fog')) return 'fog';
  if (categories.includes('hot')) return 'hot';
  if (categories.includes('cold')) return 'cold';
  if (categories.includes('sunny')) return 'sunny';
  if (categories.includes('partly_cloudy')) return 'partly_cloudy';
  if (categories.includes('cloudy')) return 'cloudy';
  return categories[0] || 'unknown';
}

function buildAggregatedWeatherSnapshot(entries) {
  if (entries.length === 1) return entries[0].snapshot;

  const categories = uniq(entries.flatMap((entry) => entry.snapshot.categories));
  const summary = entries
    .map(({ location, snapshot }) => `${getWeatherLocationLabel(location)} ${snapshot.summary}`)
    .join('；');

  return {
    primary: pickPrimaryWeatherCategory(categories),
    categories,
    summary,
    entries,
    source: 'auto',
  };
}

function getPlanWeatherSnapshot(plan, dateId, weatherData) {
  const snapshots = getPlanWeatherLocations(plan)
    .map((location) => {
      const key = getWeatherLocationKey(location);
      const autoDay = weatherData[key]?.dailyByDate?.[dateId];
      const snapshot = buildWeatherSnapshot(autoDay);
      return snapshot ? { location, snapshot } : null;
    })
    .filter(Boolean);

  if (!snapshots.length) return null;
  return buildAggregatedWeatherSnapshot(snapshots);
}

function evaluateWeather(plan, dateId, weatherData, language = DEFAULT_LANGUAGE) {
  const snapshot = getPlanWeatherSnapshot(plan, dateId, weatherData);
  if (!snapshot) return { level: 'unknown', label: getWeatherStatusLabel('unknown', language), snapshot: null };

  const categories = snapshot.categories;
  const { best, ok, blocked } = plan.weather_rules;

  if (categories.some((category) => blocked.includes(category))) {
    return { level: 'blocked', label: getWeatherStatusLabel('blocked', language), snapshot };
  }

  if (categories.some((category) => best.includes(category))) {
    return { level: 'best', label: getWeatherStatusLabel('best', language), snapshot };
  }

  if (ok.includes('any') || categories.some((category) => ok.includes(category))) {
    return { level: 'ok', label: getWeatherStatusLabel('ok', language), snapshot };
  }

  return { level: 'mismatch', label: getWeatherStatusLabel('mismatch', language), snapshot };
}

function getDayInsight(plan, dateId, schedule, plansById, weatherData, language = DEFAULT_LANGUAGE) {
  if (!plan) {
    return {
      level: 'empty',
      label: '',
      weatherText: translate('temporarySlot', language),
      riskText: '',
      issueCount: 0,
    };
  }

  const weather = evaluateWeather(plan, dateId, weatherData, language);
  const issues = getDateHardIssues(plan, dateId, schedule, plansById, weatherData, {
    ignoreOccupancy: true,
  });
  const hasHardIssue = issues.length > 0;
  const isCritical = hasHardIssue && plan.priority === 'must';
  const weatherText = weather.snapshot ? formatWeatherSummary(weather.snapshot, language) : translate('noWeather', language);

  return {
    level: isCritical ? 'critical' : hasHardIssue ? 'danger' : weather.level,
    label: hasHardIssue ? translate('adjustRecommended', language) : '',
    weatherText,
    riskText: issues[0] ? translateIssue(issues[0], language) : (weather.level === 'mismatch' ? translate('weatherNotIdeal', language) : weather.level === 'unknown' ? translate('confirmWeather', language) : ''),
    riskTone: issues.length ? 'danger' : weather.level === 'mismatch' || weather.level === 'unknown' ? 'notice' : '',
    issueCount: issues.length,
  };
}

function getCalendarDayState(plan, insight, language = DEFAULT_LANGUAGE) {
  if (!plan) return { key: 'empty', label: '', ariaLabel: translate('assignedAriaEmpty', language) };

  if (insight.issueCount > 0 || ['blocked', 'danger', 'critical'].includes(insight.level)) {
    return { key: 'adjust', label: translate('adjust', language), ariaLabel: translate('assignedAriaAdjust', language) };
  }

  if (['unknown', 'mismatch'].includes(insight.level)) {
    return { key: 'notice', label: '', ariaLabel: translate('assignedAriaNotice', language) };
  }

  return { key: 'planned', label: '', ariaLabel: translate('assignedAriaPlanned', language) };
}

function getDateHardIssues(plan, dateId, schedule, plansById, weatherData, options = {}) {
  const issues = [];
  const entry = schedule[dateId];
  const currentPlanId = entry?.planId;

  if (!plan.available_dates.includes(dateId)) issues.push('不在可去日期');
  if (plan.closed_dates.includes(dateId)) issues.push('当天不可用/闭馆');

  if (!options.ignoreOccupancy && currentPlanId && currentPlanId !== plan.id) {
    issues.push('当天已有安排');
  }

  Object.entries(schedule).forEach(([otherDateId, otherEntry]) => {
    if (!otherEntry?.planId || otherDateId === dateId) return;
    const otherPlan = plansById.get(otherEntry.planId);
    if (!otherPlan) return;
    if (otherPlan.id === plan.id) issues.push(`已安排在 ${otherDateId}`);
    if (planConflicts(plan, otherPlan)) issues.push(`与 ${otherPlan.name} 互斥`);
  });

  const weather = evaluateWeather(plan, dateId, weatherData);
  if (weather.level === 'blocked') issues.push(weather.label);

  return uniq(issues);
}

function getFeasibleDates(plan, tripDates, schedule, plansById, weatherData) {
  return tripDates
    .filter((date) => getDateHardIssues(plan, date.id, schedule, plansById, weatherData).length === 0)
    .map((date) => date.id);
}

function getScheduledRiskTitle(issues) {
  if (issues.some((issue) => issue.includes('天气'))) return '天气不合适';
  if (issues.some((issue) => issue.includes('闭馆') || issue.includes('不可用'))) return '当天不可用';
  if (issues.some((issue) => issue.includes('可去日期') || issue.includes('日期'))) return '日期不合适';
  if (issues.some((issue) => issue.includes('互斥'))) return '和其他安排冲突';
  if (issues.some((issue) => issue.includes('已安排'))) return '已经排在别的日期';
  return '需要调整';
}

function buildRiskItems(plans, tripDates, schedule, plansById, weatherData) {
  const scheduledPlanIds = new Set(Object.values(schedule).map((entry) => entry.planId));

  const scheduledRisks = Object.entries(schedule)
    .map(([dateId, entry]) => {
      const plan = plansById.get(entry.planId);
      if (!plan) return null;

      const issues = getDateHardIssues(plan, dateId, schedule, plansById, weatherData, {
        ignoreOccupancy: true,
      });

      if (!issues.length) return null;

      return {
        plan,
        dateId,
        level: plan.priority === 'must' ? 'critical' : 'warning',
        title: getScheduledRiskTitle(issues),
        reasons: issues,
      };
    })
    .filter(Boolean);

  const unscheduledRisks = plans
    .filter((plan) => plan.priority === 'must' && !scheduledPlanIds.has(plan.id))
    .map((plan) => {
      const feasibleDates = getFeasibleDates(plan, tripDates, schedule, plansById, weatherData);
      if (feasibleDates.length > 0) return null;

      const reasons = uniq(
        tripDates.flatMap((date) =>
          getDateHardIssues(plan, date.id, schedule, plansById, weatherData).slice(0, 2),
        ),
      ).slice(0, 4);

      return {
        plan,
        level: 'critical',
        title: '必去计划没有可安排日期',
        reasons,
      };
    })
    .filter(Boolean)
    .sort((a, b) => PRIORITY_META[b.plan.priority].rank - PRIORITY_META[a.plan.priority].rank);

  const bookingRisks = Object.entries(schedule)
    .map(([dateId, entry]) => {
      const plan = plansById.get(entry.planId);
      const pendingBookings = getPendingBookings(plan);
      if (!plan || pendingBookings.length === 0) return null;

      return {
        plan,
        dateId,
        level: 'warning',
        title: '预约/订票未完成',
        reasons: pendingBookings.map((booking) => booking.title),
      };
    })
    .filter(Boolean);

  return [...scheduledRisks, ...unscheduledRisks, ...bookingRisks].sort((a, b) => {
    const levelRank = { critical: 3, warning: 2, info: 1 };
    const levelDiff = levelRank[b.level] - levelRank[a.level];
    if (levelDiff) return levelDiff;
    return PRIORITY_META[b.plan.priority].rank - PRIORITY_META[a.plan.priority].rank;
  });
}

function buildAssignmentPreview(schedule, dateId, targetPlan, plansById) {
  const nextSchedule = { ...schedule };
  const clearsByDate = new Map();

  Object.entries(schedule).forEach(([otherDateId, entry]) => {
    if (!entry?.planId || otherDateId === dateId) return;
    const otherPlan = plansById.get(entry.planId);
    if (!otherPlan) return;

    const isSamePlan = otherPlan.id === targetPlan.id;
    const isConflict = planConflicts(targetPlan, otherPlan);
    if (!isSamePlan && !isConflict) return;

    clearsByDate.set(otherDateId, {
      dateId: otherDateId,
      plan: otherPlan,
      reason: isSamePlan ? '同一计划被移动' : '计划互斥',
    });
    delete nextSchedule[otherDateId];
  });

  nextSchedule[dateId] = { planId: targetPlan.id };

  return {
    clears: Array.from(clearsByDate.values()),
    nextSchedule,
  };
}

function getRiskIdentity(risk) {
  return `${risk.dateId || 'unscheduled'}:${risk.plan.id}:${risk.title}`;
}

function getPlanPriorityWeight(plan) {
  return PRIORITY_META[plan.priority]?.rank || 1;
}

function getWeatherScore(level) {
  if (level === 'best') return 5;
  if (level === 'ok') return 3;
  if (level === 'mismatch') return 1;
  return 0;
}

function getClearPenalty(clears) {
  return clears.reduce((total, item) => total + getPlanPriorityWeight(item.plan) * 3, 0);
}

function getRiskPenalty(risks) {
  return risks.reduce((total, risk) => {
    const levelPenalty = risk.level === 'critical' ? 16 : 6;
    return total + levelPenalty + getPlanPriorityWeight(risk.plan) * 2;
  }, 0);
}

function getRiskGroupTitle(title) {
  if (title === '必去计划没有可安排日期') return '必去未排';
  return title;
}

function getRiskGroupLabel(risk, tripDates) {
  if (!risk.dateId) return risk.plan.name;
  return `${formatAssignedDate(risk.dateId, tripDates)} · ${risk.plan.name}`;
}

function buildRiskGroups(riskItems, tripDates) {
  const levelRank = { critical: 3, warning: 2, info: 1 };
  const groupsByTitle = new Map();

  riskItems.forEach((risk) => {
    const title = getRiskGroupTitle(risk.title);
    const existing = groupsByTitle.get(title) || {
      title,
      level: risk.level,
      items: [],
      unit: risk.dateId ? '天' : '项',
    };

    if (levelRank[risk.level] > levelRank[existing.level]) existing.level = risk.level;
    if (risk.dateId) existing.unit = '天';
    existing.items.push(getRiskGroupLabel(risk, tripDates));
    groupsByTitle.set(title, existing);
  });

  return Array.from(groupsByTitle.values())
    .map((group) => ({
      ...group,
      items: uniq(group.items),
    }))
    .sort((a, b) => {
      const levelDiff = levelRank[b.level] - levelRank[a.level];
      if (levelDiff) return levelDiff;
      return b.items.length - a.items.length;
    });
}

function parseForecastDaily(data) {
  const daily = data.daily || {};
  const times = daily.time || [];

  return Object.fromEntries(
    times.map((dateId, index) => [
      dateId,
      {
        dateId,
        weatherCode: daily.weather_code?.[index],
        tempMax: daily.temperature_2m_max?.[index],
        tempMin: daily.temperature_2m_min?.[index],
        apparentMax: daily.apparent_temperature_max?.[index],
        apparentMin: daily.apparent_temperature_min?.[index],
        precipitationSum: daily.precipitation_sum?.[index],
        precipitationProbability: daily.precipitation_probability_max?.[index],
        windMax: daily.wind_speed_10m_max?.[index],
        cloudCover: daily.cloud_cover_mean?.[index],
      },
    ]),
  );
}

function isWeatherCacheFresh(entry, tripDates) {
  if (!entry?.dailyByDate || !entry.fetchedAt) return false;

  const fetchedAt = new Date(entry.fetchedAt).getTime();
  if (!Number.isFinite(fetchedAt)) return false;
  if (Date.now() - fetchedAt > WEATHER_CACHE_TTL_MS) return false;

  return tripDates.every((date) => Boolean(entry.dailyByDate[date.id]));
}

async function fetchJson(url, errorPrefix) {
  const controller = new AbortController();
  const requestUrl = url.toString();
  const timeoutId = window.setTimeout(() => controller.abort(), WEATHER_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(requestUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`${errorPrefix}失败`);
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`${errorPrefix}超时`, { cause: error });
    }
    if (error instanceof TypeError) {
      const host = new URL(requestUrl).host;
      throw new Error(`${errorPrefix}失败：无法连接 ${host}，可能是当前网络、DNS 或浏览器拦截导致。`, { cause: error });
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchWeatherForLocation(location, startDateStr, endDate) {
  let resolved = location;
  if (!hasCoordinates(resolved)) {
    const resolvedLabel = getWeatherLocationLabel(resolved);
    const searchTerms = uniq([resolved.query, resolvedLabel, resolved.query?.split(',')[0]]).filter(Boolean);
    let first = null;

    for (const term of searchTerms) {
      const geoUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
      geoUrl.searchParams.set('name', term);
      geoUrl.searchParams.set('count', '1');
      geoUrl.searchParams.set('language', 'zh');
      geoUrl.searchParams.set('format', 'json');
      const geoData = await fetchJson(geoUrl, `地点查询：${resolvedLabel}`);
      first = geoData.results?.[0] || null;
      if (first) break;
    }

    if (!first) throw new Error(`找不到地点：${resolvedLabel}`);
    resolved = {
      ...resolved,
      weatherLabel: resolved.weatherLabel || `${first.name}${first.admin1 ? `, ${first.admin1}` : ''}`,
      latitude: first.latitude,
      longitude: first.longitude,
      timezone: first.timezone,
    };
  }

  const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
  forecastUrl.searchParams.set('latitude', String(resolved.latitude));
  forecastUrl.searchParams.set('longitude', String(resolved.longitude));
  forecastUrl.searchParams.set(
    'daily',
    [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'apparent_temperature_max',
      'apparent_temperature_min',
      'precipitation_sum',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'cloud_cover_mean',
    ].join(','),
  );
  forecastUrl.searchParams.set('timezone', 'auto');
  forecastUrl.searchParams.set('start_date', startDateStr);
  forecastUrl.searchParams.set('end_date', endDate);

  const forecastData = await fetchJson(forecastUrl, `天气查询：${getWeatherLocationLabel(resolved)}`);

  return {
    ...resolved,
    label: getWeatherLocationLabel(resolved),
    dailyByDate: parseForecastDaily(forecastData),
    fetchedAt: new Date().toISOString(),
  };
}

async function mapSettledWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      try {
        results[currentIndex] = {
          status: 'fulfilled',
          value: await mapper(items[currentIndex], currentIndex),
        };
      } catch (error) {
        results[currentIndex] = {
          status: 'rejected',
          reason: error,
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

async function fetchWeatherForPlans(normalizedPlans, tripDates, startDateStr, cachedWeatherData = {}) {
  if (!tripDates.length) return {};

  const endDate = tripDates[tripDates.length - 1].id;
  const locationsByKey = new Map();

  normalizedPlans.forEach((plan) => {
    getPlanWeatherLocations(plan).forEach((location) => {
      if (!location.query && !hasCoordinates(location)) return;

      const key = getWeatherLocationKey(location);
      if (!locationsByKey.has(key)) {
        locationsByKey.set(key, {
          ...location,
          weatherLabel: getWeatherLocationLabel(location),
        });
      }
    });
  });

  const uniqueLocations = Array.from(locationsByKey.values());
  const nextWeatherData = {};
  const locationsToFetch = [];

  uniqueLocations.forEach((location) => {
    const key = getWeatherLocationKey(location);
    const cachedEntry = cachedWeatherData[key];

    if (isWeatherCacheFresh(cachedEntry, tripDates)) {
      nextWeatherData[key] = cachedEntry;
      return;
    }

    locationsToFetch.push(location);
  });

  const results = await mapSettledWithConcurrency(
    locationsToFetch,
    WEATHER_FETCH_CONCURRENCY,
    async (location) => ({
      key: getWeatherLocationKey(location),
      label: getWeatherLocationLabel(location),
      data: await fetchWeatherForLocation(location, startDateStr, endDate),
    }),
  );

  const errors = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      nextWeatherData[result.value.key] = result.value.data;
      return;
    }

    errors.push(`${getWeatherLocationLabel(locationsToFetch[index])}：${result.reason.message}`);
  });

  if (!Object.keys(nextWeatherData).length && errors.length) {
    throw new Error(errors.join('；'));
  }

  Object.defineProperty(nextWeatherData, WEATHER_ERRORS_KEY, {
    value: errors,
    enumerable: false,
  });
  Object.defineProperty(nextWeatherData, WEATHER_CACHE_HIT_KEY, {
    value: locationsToFetch.length === 0 && uniqueLocations.length > 0,
    enumerable: false,
  });

  return nextWeatherData;
}

function formatWeatherUpdateWarning(errors, language = DEFAULT_LANGUAGE) {
  return errors.length ? translate('partialWeatherFailed', language, { errors: errors.join(language === 'en' ? '; ' : '；') }) : '';
}

function getPlanJsonSchema(language = DEFAULT_LANGUAGE) {
  if (language === 'en') {
    return `{
  "plans": [
    {
      "id": "unique_plan_id",
      "name": "Short title",
      "description": "What to do and when this plan is suitable",
      "priority": "must | preferred | backup | optional",
      "location": { "label": "Display location", "address": "Detailed address, optional", "weather_location": "City/district/coordinates for weather API, not necessarily displayed" },
      "stops": [
        {
          "time": "09:30",
          "title": "Stop title",
          "location": { "label": "Specific place", "address": "Detailed address, optional", "weather_location": "Fill when crossing city/district, otherwise inherit plan location" },
          "note": "What happens at this stop",
          "weather_relevant": true
        }
      ],
      "available_dates": ["YYYY-MM-DD"],
      "closed_dates": ["YYYY-MM-DD"],
      "time_window": "10:00-16:00",
      "duration": "half day",
      "intensity": "easy | normal | hard",
      "weather_rules": {
        "best": ["sunny", "partly_cloudy", "cloudy", "drizzle", "rain", "heavy_rain", "hot", "cold", "windy"],
        "ok": ["..."],
        "blocked": ["..."]
      },
      "conflicts": ["other_plan_id"],
      "bookings": [
        {
          "id": "booking_id",
          "type": "reservation | ticket | confirmation",
          "title": "Reservation/ticket item",
          "status": "pending | done | none",
          "address": "Service or arrival address",
          "url": "Reservation or booking link, optional",
          "cancel_url": "Cancellation/change/manage link, optional",
          "note": "Lead time, ID requirements, cancellation rules, etc."
        }
      ],
      "reminders": [{"time": "HH:mm or text time", "text": "Important reminder"}],
      "tips": ["General tip"],
      "tags": ["tag"],
      "assigned_day": "YYYY-MM-DD"
    }
  ]
}`;
  }

  return `{
  "plans": [
    {
      "id": "unique_plan_id",
      "name": "短标题",
      "description": "当天做什么，适合什么情况",
      "priority": "must | preferred | backup | optional",
      "location": { "label": "地点展示名", "address": "详细地址，可空", "weather_location": "用于天气 API 的城市/区县/坐标，不一定展示" },
      "stops": [
        {
          "time": "09:30",
          "title": "节点标题",
          "location": { "label": "具体地点", "address": "详细地址，可空", "weather_location": "跨城或不同区县时填写，否则继承计划地点" },
          "note": "这个节点做什么",
          "weather_relevant": true
        }
      ],
      "available_dates": ["YYYY-MM-DD"],
      "closed_dates": ["YYYY-MM-DD"],
      "time_window": "10:00-16:00",
      "duration": "半天",
      "intensity": "easy | normal | hard",
      "weather_rules": {
        "best": ["sunny", "partly_cloudy", "cloudy", "drizzle", "rain", "heavy_rain", "hot", "cold", "windy"],
        "ok": ["..."],
        "blocked": ["..."]
      },
      "conflicts": ["other_plan_id"],
      "bookings": [
        {
          "id": "booking_id",
          "type": "reservation | ticket | confirmation",
          "title": "需要预约/订票的项目",
          "status": "pending | done | none",
          "address": "办理或到达地址",
          "url": "预约或订票链接，可空",
          "cancel_url": "退订/改签/管理链接，可空",
          "note": "提前多久、证件要求、退改规则等"
        }
      ],
      "reminders": [{"time": "HH:mm 或文字时间", "text": "必须注意的事项"}],
      "tips": ["普通提示"],
      "tags": ["标签"],
      "assigned_day": "YYYY-MM-DD"
    }
  ]
}`;
}

function App() {
  const { i18n } = useTranslation();
  const [language, setLanguage] = useState(() => normalizeLanguage(i18n.language || getInitialLanguage()));
  const [initial] = useState(loadInitialState);
  const [trips, setTrips] = useState(initial.trips);
  const [activeTripId, setActiveTripId] = useState(initial.activeTripId);
  const [tripName, setTripName] = useState(initial.tripName);
  const [startDateStr, setStartDateStr] = useState(initial.startDate);
  const [tripDays, setTripDays] = useState(initial.tripDays);
  const [plans, setPlans] = useState(initial.plans);
  const [schedule, setSchedule] = useState(initial.schedule);
  const [selectedDateId, setSelectedDateId] = useState(initial.selectedDate);
  const [weatherData, setWeatherData] = useState(initial.weatherData);
  const [checklistText, setChecklistText] = useState(initial.checklistText);
  const [checklistState, setChecklistState] = useState(initial.checklistState);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistEditing, setChecklistEditing] = useState(false);
  const [checklistDraft, setChecklistDraft] = useState(initial.checklistText);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPlanId, setEditorPlanId] = useState(null);
  const [batchAiOpen, setBatchAiOpen] = useState(false);
  const [aiPlannerOpen, setAiPlannerOpen] = useState(false);
  const [aiPlannerMode, setAiPlannerMode] = useState('replan');
  const [aiPlannerQuestion, setAiPlannerQuestion] = useState('');
  const [aiPlannerResult, setAiPlannerResult] = useState('');
  const [planAiQuestion, setPlanAiQuestion] = useState('');
  const [planAiResult, setPlanAiResult] = useState('');
  const [tripMenuOpen, setTripMenuOpen] = useState(false);
  const [mobileRisksOpen, setMobileRisksOpen] = useState(false);
  const [archivedViewTripId, setArchivedViewTripId] = useState(null);
  const [pendingAssignment, setPendingAssignment] = useState(null);
  const [toast, setToast] = useState('');

  const toastTimerRef = useRef(null);
  const autoWeatherKeyRef = useRef('');
  const dayTileRefs = useRef(new Map());
  const t = useMemo(() => (key, vars) => translate(key, language, vars), [language]);
  const aiReplanText = getAiModeText('replan', language);
  const aiGenerateText = getAiModeText('generate', language);

  const tripDates = useMemo(
    () => createTripDates(startDateStr, tripDays, language),
    [language, startDateStr, tripDays],
  );
  const endDateStr = useMemo(
    () => addDays(startDateStr, Math.max(tripDays - 1, 0)),
    [startDateStr, tripDays],
  );
  const checklistGroups = useMemo(
    () => parseChecklistText(checklistText, language),
    [checklistText, language],
  );
  const checklistStats = useMemo(
    () => getChecklistStats(checklistGroups, checklistState),
    [checklistGroups, checklistState],
  );

  const normalizedPlans = useMemo(
    () => plans.map((plan, index) => normalizePlan(plan, index, tripDates)),
    [plans, tripDates],
  );
  const hasInitializedPlans = normalizedPlans.length > 0;

  const plansById = useMemo(() => {
    return new Map(normalizedPlans.map((plan) => [plan.id, plan]));
  }, [normalizedPlans]);

  const smartSelectedDateId = useMemo(
    () => getSmartSelectedDate(startDateStr, tripDays),
    [startDateStr, tripDays],
  );

  const selectedDate = useMemo(
    () => tripDates.find((date) => date.id === selectedDateId) || tripDates.find((date) => date.id === smartSelectedDateId) || tripDates[0],
    [smartSelectedDateId, tripDates, selectedDateId],
  );

  const selectedDateEntry = selectedDate ? schedule[selectedDate.id] : null;
  const selectedPlan = selectedDateEntry ? plansById.get(selectedDateEntry.planId) : null;
  const selectedIndex = selectedDate
    ? tripDates.findIndex((date) => date.id === selectedDate.id)
    : -1;

  const riskItems = useMemo(
    () => buildRiskItems(normalizedPlans, tripDates, schedule, plansById, weatherData),
    [normalizedPlans, plansById, schedule, tripDates, weatherData],
  );
  const riskGroups = useMemo(
    () => buildRiskGroups(riskItems, tripDates),
    [riskItems, tripDates],
  );

  const visibleTrips = useMemo(
    () => pruneEmptyTripDrafts(trips, activeTripId).filter((trip) => !trip.archived),
    [activeTripId, trips],
  );
  const archivedTrips = useMemo(() => trips.filter((trip) => trip.archived), [trips]);
  const archivedViewTrip = useMemo(
    () => archivedTrips.find((trip) => trip.id === archivedViewTripId) || null,
    [archivedTrips, archivedViewTripId],
  );
  const activeTripOption = trips.find((trip) => trip.id === activeTripId);
  const activeTripArchived = activeTripOption?.archived || false;
  const planAssignments = useMemo(() => {
    return new Map(
      Object.entries(schedule)
        .filter(([, entry]) => entry?.planId)
        .map(([dateId, entry]) => [entry.planId, dateId]),
    );
  }, [schedule]);

  const candidates = useMemo(() => {
    if (!selectedDate) return [];
    const currentRiskKeys = new Set(riskItems.map(getRiskIdentity));

    return normalizedPlans
      .map((plan) => {
        const hardReasons = [];
        const notes = [];
        const isCurrent = selectedPlan?.id === plan.id;
        const assignedDateId = planAssignments.get(plan.id) || '';
        const weather = evaluateWeather(plan, selectedDate.id, weatherData, language);
        const { clears, nextSchedule } = buildAssignmentPreview(schedule, selectedDate.id, plan, plansById);
        const nextRisks = buildRiskItems(normalizedPlans, tripDates, nextSchedule, plansById, weatherData)
          .filter((risk) => risk.level !== 'info');
        const newRisks = nextRisks.filter((risk) => !currentRiskKeys.has(getRiskIdentity(risk)));

        if (!plan.available_dates.includes(selectedDate.id)) hardReasons.push(t('dateNotSuitable'));
        if (plan.closed_dates.includes(selectedDate.id)) hardReasons.push(t('closedOrUnavailable'));
        if (weather.level === 'blocked') hardReasons.push(weather.label);
        if (weather.level === 'unknown') notes.push(t('weatherUnknown'));

        const priorityScore = getPlanPriorityWeight(plan) * 3;
        const score = priorityScore + getWeatherScore(weather.level) - getClearPenalty(clears) - getRiskPenalty(newRisks);

        return {
          plan,
          canAssign: hardReasons.length === 0,
          hardReasons: uniq(hardReasons),
          notes: uniq(notes),
          clears,
          newRisks,
          score,
          isCurrent,
          assignedDateId,
          weather,
        };
      })
      .sort((a, b) => {
        if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
        if (a.canAssign !== b.canAssign) return a.canAssign ? -1 : 1;
        return b.score - a.score;
      });
  }, [
    normalizedPlans,
    planAssignments,
    plansById,
    riskItems,
    schedule,
    selectedDate,
    selectedPlan,
    language,
    t,
    tripDates,
    weatherData,
  ]);

  const currentCandidate = candidates.find((candidate) => candidate.isCurrent);
  const switchCandidates = candidates.filter((candidate) => !candidate.isCurrent);
  const availableCandidateCount = switchCandidates.filter((candidate) => candidate.canAssign).length;
  const isCreatingPlan = editorPlanId === NEW_PLAN_EDITOR_ID;
  const editorPlan = editorPlanId && !isCreatingPlan ? plansById.get(editorPlanId) : null;

  const changeLanguage = (nextLanguage) => {
    const normalizedLanguage = normalizeLanguage(nextLanguage);
    setLanguage(normalizedLanguage);
    i18n.changeLanguage(normalizedLanguage);
    document.documentElement.lang = normalizedLanguage;

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('lang', normalizedLanguage);
    window.history.replaceState(null, '', nextUrl);
  };

  const toggleLanguage = () => {
    changeLanguage(language === 'zh' ? 'en' : 'zh');
  };

  useEffect(() => {
    document.documentElement.lang = language;
    if (i18n.language !== language) i18n.changeLanguage(language);
  }, [i18n, language]);

  useEffect(() => {
    const syncLanguageFromUrl = () => {
      const nextLanguage = getInitialLanguage();
      setLanguage(nextLanguage);
      document.documentElement.lang = nextLanguage;
      if (i18n.language !== nextLanguage) i18n.changeLanguage(nextLanguage);
    };

    window.addEventListener('popstate', syncLanguageFromUrl);
    return () => window.removeEventListener('popstate', syncLanguageFromUrl);
  }, [i18n]);

  useEffect(() => {
    const currentTrip = {
      id: activeTripId,
      name: tripName || t('unnamedTrip'),
      startDateStr,
      tripDays,
      plans: normalizedPlans,
      schedule: normalizeSchedule(schedule),
      weatherData,
      checklistText,
      checklistState,
      archived: activeTripArchived,
    };
    const persistedTrips = pruneEmptyTripDrafts(
      trips.map((trip) => (trip.id === activeTripId ? currentTrip : trip)),
      activeTripId,
    );

    localStorage.setItem(STORAGE_KEYS.schemaVersion, APP_SCHEMA_VERSION);
    localStorage.setItem(STORAGE_KEYS.trips, JSON.stringify(persistedTrips));
    localStorage.setItem(STORAGE_KEYS.currentTrip, activeTripId);
  }, [
    activeTripId,
    activeTripArchived,
    checklistState,
    checklistText,
    t,
    normalizedPlans,
    schedule,
    startDateStr,
    tripName,
    tripDays,
    trips,
    weatherData,
  ]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const notify = (message) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 2600);
  };

  const getCurrentTripSnapshot = () => ({
    id: activeTripId,
    name: tripName || t('unnamedTrip'),
    startDateStr,
    tripDays,
    plans: normalizedPlans,
    schedule: normalizeSchedule(schedule),
    weatherData,
    checklistText,
    checklistState,
    archived: activeTripArchived,
  });

  const applyTripSnapshot = (trip) => {
    const normalizedTrip = normalizeTripSnapshot(trip);
    setActiveTripId(normalizedTrip.id);
    setTripName(normalizedTrip.name);
    setStartDateStr(normalizedTrip.startDateStr);
    setTripDays(normalizedTrip.tripDays);
    setPlans(normalizedTrip.plans);
    setSchedule(normalizedTrip.schedule);
    setWeatherData(normalizedTrip.weatherData);
    setChecklistText(normalizedTrip.checklistText);
    setChecklistState(normalizedTrip.checklistState);
    setChecklistDraft(normalizedTrip.checklistText);
    setChecklistEditing(false);
    setSelectedDateId(getSmartSelectedDate(normalizedTrip.startDateStr, normalizedTrip.tripDays));
    setWeatherError('');
  };

  const saveCurrentTripInto = (tripList) => {
    const currentTrip = getCurrentTripSnapshot();
    return tripList.map((trip) => (trip.id === activeTripId ? currentTrip : trip));
  };

  const switchTrip = (nextTripId) => {
    setTripMenuOpen(false);
    if (nextTripId === activeTripId) return;
    const nextTrip = visibleTrips.find((trip) => trip.id === nextTripId);
    if (!nextTrip) return;

    setTrips(pruneEmptyTripDrafts(saveCurrentTripInto(trips), nextTripId));
    applyTripSnapshot(nextTrip);
  };

  const createNewTrip = () => {
    if (!hasInitializedPlans) {
      setTripMenuOpen(false);
      setEditorOpen(true);
      setBatchAiOpen(false);
      notify(t('emptyPlanNotice'));
      return;
    }

    const nextTrip = createEmptyTripSnapshot(language === 'en' ? `Trip ${trips.length + 1}` : `旅行计划 ${trips.length + 1}`, getTodayId());
    setTripMenuOpen(false);
    setTrips([...pruneEmptyTripDrafts(saveCurrentTripInto(trips), activeTripId), nextTrip]);
    applyTripSnapshot(nextTrip);
    setEditorOpen(true);
    setBatchAiOpen(false);
    notify(t('newTripCreated'));
  };

  const loadExampleTrip = () => {
    const hasCurrentContent = normalizedPlans.length > 0 || Object.keys(schedule).length > 0;
    if (hasCurrentContent && !window.confirm(t('overwriteExampleConfirm'))) return;

    const exampleTrip = createExampleTripSnapshot(t('exampleTripName'), startDateStr, activeTripId);
    setTripName(exampleTrip.name);
    setTripDays(exampleTrip.tripDays);
    setPlans(exampleTrip.plans);
    setSchedule(exampleTrip.schedule);
    setWeatherData({});
    setChecklistText(exampleTrip.checklistText);
    setChecklistState(exampleTrip.checklistState);
    setChecklistDraft(exampleTrip.checklistText);
    setChecklistEditing(false);
    setSelectedDateId(exampleTrip.startDateStr);
    closePlanEditor();
    setBatchAiOpen(false);
    notify(t('exampleLoaded'));
  };

  const openBatchAiGenerator = () => {
    setAiPlannerMode('generate');
    setAiPlannerOpen(false);
    setEditorPlanId(null);
    setEditorOpen(true);
    setBatchAiOpen(true);
    setAiPlannerResult('');
  };

  const openAiPlanner = (mode = 'replan') => {
    if (mode === 'generate' || !hasInitializedPlans) {
      openBatchAiGenerator();
      return;
    }

    setAiPlannerMode('replan');
    setEditorOpen(false);
    setAiPlannerResult('');
    setAiPlannerOpen(true);
  };

  const openPlanEditor = (planId = NEW_PLAN_EDITOR_ID) => {
    setEditorPlanId(planId);
    setPlanAiQuestion('');
    setPlanAiResult('');
  };

  const closePlanEditor = () => {
    setEditorPlanId(null);
    setPlanAiQuestion('');
    setPlanAiResult('');
  };

  const removePlan = (planId) => {
    const plan = plansById.get(planId);
    if (!plan || !window.confirm(t('deletePlanConfirm', { name: plan.name }))) return;

    setPlans((current) => current.filter((item, index) => normalizePlan(item, index, tripDates).id !== planId));
    setSchedule((current) => Object.fromEntries(
      Object.entries(current).filter(([, entry]) => entry?.planId !== planId),
    ));
    if (editorPlanId === planId) closePlanEditor();
    notify(t('planDeleted'));
  };

  const updatePlanBookingStatus = (planId, bookingId, nextStatus) => {
    setPlans((current) => current.map((plan, index) => {
      const normalizedPlan = normalizePlan(plan, index, tripDates);
      if (normalizedPlan.id !== planId) return plan;

      return {
        ...plan,
        bookings: normalizedPlan.bookings.map((booking) => (
          booking.id === bookingId ? { ...booking, status: nextStatus } : booking
        )),
      };
    }));
    notify(nextStatus === 'done' ? t('bookingDone') : t('bookingPending'));
  };

  const applyTripListAfterCurrentRemoved = (nextTrips, message) => {
    const tripsWithContent = nextTrips.filter((trip) => !isEmptyTripDraft(trip));
    const nextTrip = tripsWithContent.find((trip) => !trip.archived && trip.id !== activeTripId) || createEmptyTripSnapshot(language === 'en' ? `Trip ${tripsWithContent.length + 1}` : `旅行计划 ${tripsWithContent.length + 1}`, getTodayId());
    const finalTrips = tripsWithContent.some((trip) => trip.id === nextTrip.id) ? tripsWithContent : [...tripsWithContent, nextTrip];

    setTrips(finalTrips);
    applyTripSnapshot(nextTrip);
    setEditorOpen(false);
    notify(message);
  };

  const archiveCurrentTrip = () => {
    if (!window.confirm(t('archiveTripConfirm', { name: tripName || t('unnamedTrip') }))) return;

    const archivedTrip = { ...getCurrentTripSnapshot(), archived: true };
    const updatedTrips = trips.map((trip) => (trip.id === activeTripId ? archivedTrip : trip));
    applyTripListAfterCurrentRemoved(updatedTrips, t('tripArchived'));
  };

  const deleteCurrentTrip = () => {
    const currentTripIsEmpty = !hasInitializedPlans && Object.keys(schedule).length === 0;
    if (!currentTripIsEmpty && !window.confirm(t('deleteTripConfirm', { name: tripName || t('unnamedTrip') }))) return;

    const updatedTrips = trips.filter((trip) => trip.id !== activeTripId);
    applyTripListAfterCurrentRemoved(updatedTrips, t('tripDeleted'));
  };

  const restoreArchivedTrip = (tripId) => {
    const restoredTrips = trips.map((trip) => (trip.id === tripId ? { ...trip, archived: false } : trip));
    const restoredTrip = restoredTrips.find((trip) => trip.id === tripId);
    if (!restoredTrip) return;

    setTrips(saveCurrentTripInto(restoredTrips));
    applyTripSnapshot(restoredTrip);
    setEditorOpen(false);
    setArchivedViewTripId(null);
    notify(t('archivedRestored'));
  };

  const buildAssignmentImpact = (dateId, planId) => {
    const targetPlan = plansById.get(planId);
    if (!targetPlan) return null;

    const { clears, nextSchedule } = buildAssignmentPreview(schedule, dateId, targetPlan, plansById);

    const nextRisks = buildRiskItems(normalizedPlans, tripDates, nextSchedule, plansById, weatherData)
      .filter((risk) => risk.level !== 'info');

    return { clears, nextSchedule, nextRisks, targetPlan, dateId };
  };

  const applySchedule = (nextSchedule, message = t('scheduleUpdated')) => {
    setSchedule(nextSchedule);
    notify(message);
  };

  const requestAssignPlan = (dateId, planId) => {
    const impact = buildAssignmentImpact(dateId, planId);
    if (!impact) return;

    if (impact.clears.length || impact.nextRisks.length) {
      setPendingAssignment(impact);
      return;
    }

    applySchedule(impact.nextSchedule, t('dayPlanUpdated'));
  };

  const confirmPendingAssignment = () => {
    if (!pendingAssignment) return;
    applySchedule(pendingAssignment.nextSchedule, pendingAssignment.clears.length ? t('impactedDatesCleared') : t('dayPlanUpdated'));
    setPendingAssignment(null);
  };

  const clearDay = (dateId) => {
    setSchedule((current) => {
      const next = { ...current };
      delete next[dateId];
      return next;
    });
    notify(t('dayCleared'));
  };

  const openChecklist = () => {
    setChecklistDraft(checklistText);
    setChecklistEditing(false);
    setChecklistOpen(true);
  };

  const updateChecklistItemStatus = (itemId, nextStatus) => {
    setChecklistState((current) => {
      const next = { ...current };
      if (nextStatus === CHECKLIST_STATUS.todo) {
        delete next[itemId];
      } else {
        next[itemId] = nextStatus;
      }
      return next;
    });
  };

  const toggleChecklistDone = (itemId) => {
    const currentStatus = checklistState[itemId] || CHECKLIST_STATUS.todo;
    updateChecklistItemStatus(
      itemId,
      currentStatus === CHECKLIST_STATUS.done ? CHECKLIST_STATUS.todo : CHECKLIST_STATUS.done,
    );
  };

  const toggleChecklistSkipped = (itemId) => {
    const currentStatus = checklistState[itemId] || CHECKLIST_STATUS.todo;
    updateChecklistItemStatus(
      itemId,
      currentStatus === CHECKLIST_STATUS.skipped ? CHECKLIST_STATUS.todo : CHECKLIST_STATUS.skipped,
    );
  };

  const saveChecklistText = () => {
    const nextChecklistText = normalizeChecklistText(checklistDraft);
    const nextGroups = parseChecklistText(nextChecklistText, language);
    const validItemIds = new Set(nextGroups.flatMap((group) => group.items.map((item) => item.id)));

    setChecklistText(nextChecklistText);
    setChecklistState((current) => Object.fromEntries(
      Object.entries(current).filter(([itemId]) => validItemIds.has(itemId)),
    ));
    setChecklistDraft(nextChecklistText);
    setChecklistEditing(false);
    notify(t('checklistSaved'));
  };

  const selectNeighborDate = (step) => {
    if (selectedIndex < 0) return;
    const next = tripDates[selectedIndex + step];
    if (next) setSelectedDateId(next.id);
  };

  const scrollToScheduleDate = (dateId) => {
    if (!window.matchMedia('(max-width: 560px)').matches) return;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        dayTileRefs.current.get(dateId)?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    });
  };

  const selectScheduleDate = (dateId, options = {}) => {
    setSelectedDateId(dateId);
    if (options.scroll) scrollToScheduleDate(dateId);
  };

  const copyText = async (text, message) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(message);
    } catch {
      notify(t('copyFailed'));
    }
  };

  const refreshWeather = async () => {
    if (!tripDates.length) return;
    setWeatherLoading(true);
    setWeatherError('');
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      setWeatherLoading(false);
      setWeatherError(t('weatherTimeout'));
    }, WEATHER_BATCH_TIMEOUT_MS);

    try {
      const nextWeatherData = await fetchWeatherForPlans(normalizedPlans, tripDates, startDateStr, weatherData);
      if (!timedOut) {
        setWeatherData(nextWeatherData);
        const warning = formatWeatherUpdateWarning(nextWeatherData[WEATHER_ERRORS_KEY] || [], language);
        setWeatherError(warning);
        notify(nextWeatherData[WEATHER_CACHE_HIT_KEY] ? t('weatherCacheValid') : warning ? t('weatherUpdatedPartial') : t('weatherUpdated'));
      }
    } catch (error) {
      if (!timedOut) {
        setWeatherError(error.message);
        notify(error.message);
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (!timedOut) setWeatherLoading(false);
    }
  };

  useEffect(() => {
    if (!tripDates.length || !normalizedPlans.length || !window.navigator.onLine) return undefined;

    const lastDateId = tripDates[tripDates.length - 1]?.id;
    const locationKey = normalizedPlans
      .flatMap((plan) => getPlanWeatherLocations(plan))
      .map((location) => `${location.query || location.label}:${location.latitude || ''}:${location.longitude || ''}`)
      .sort()
      .join('|');
    const autoWeatherKey = `${startDateStr}|${lastDateId}|${locationKey}`;

    if (autoWeatherKeyRef.current === autoWeatherKey) return undefined;
    autoWeatherKeyRef.current = autoWeatherKey;

    let cancelled = false;
    let timedOut = false;
    let settled = false;
    setWeatherLoading(true);
    setWeatherError('');
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      if (!cancelled) {
        setWeatherLoading(false);
        setWeatherError(t('autoWeatherTimeout'));
      }
    }, WEATHER_BATCH_TIMEOUT_MS);

    fetchWeatherForPlans(normalizedPlans, tripDates, startDateStr, weatherData)
      .then((nextWeatherData) => {
        if (!cancelled && !timedOut) {
          setWeatherData(nextWeatherData);
          setWeatherError(formatWeatherUpdateWarning(nextWeatherData[WEATHER_ERRORS_KEY] || [], language));
        }
      })
      .catch((error) => {
        if (!cancelled && !timedOut) setWeatherError(t('autoWeatherFailed', { message: error.message }));
      })
      .finally(() => {
        settled = true;
        window.clearTimeout(timeoutId);
        if (!cancelled && !timedOut) setWeatherLoading(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      if (!settled && autoWeatherKeyRef.current === autoWeatherKey) autoWeatherKeyRef.current = '';
      setWeatherLoading(false);
    };
  }, [language, normalizedPlans, startDateStr, t, tripDates, weatherData]);

  const buildAiPlanningPrompt = (mode = aiPlannerMode) => {
    const planningStartDate = selectedDate || tripDates[0];
    const fixedDates = planningStartDate
      ? tripDates.filter((date) => date.id < planningStartDate.id)
      : [];
    const adjustableDates = planningStartDate
      ? tripDates.filter((date) => date.id >= planningStartDate.id)
      : tripDates;
    const completedPlanIds = new Set(
      fixedDates
        .map((date) => schedule[date.id]?.planId)
        .filter(Boolean),
    );
    const remainingPlans = normalizedPlans.filter((plan) => !completedPlanIds.has(plan.id));

    const summarizeScheduleDate = (date) => {
      const plan = schedule[date.id]?.planId ? plansById.get(schedule[date.id].planId) : null;
      const insight = getDayInsight(plan, date.id, schedule, plansById, weatherData, language);
      return {
        date: date.id,
        day: `D${date.dayNumber}`,
        display: date.display,
        plan_id: plan?.id || null,
        plan_name: plan?.name || null,
        status: insight.label || t('normal'),
        weather: insight.weatherText || '',
        note: insight.riskText || '',
      };
    };

    const summarizePlan = (plan) => ({
      plan_id: plan.id,
      name: plan.name,
      priority: getPriorityLabel(plan.priority, language),
      description: plan.description,
      current_assigned_date: planAssignments.get(plan.id) || null,
      available_dates: plan.available_dates,
      closed_dates: plan.closed_dates,
      weather_rules: plan.weather_rules,
      location: {
        label: plan.location.label,
        weather_location: getWeatherLocationLabel(plan.location),
        address: plan.location.address || '',
      },
      time_window: plan.time_window,
      stops: plan.stops.map((stop) => ({
        time: stop.time,
        title: stop.title,
        location: stop.location.label,
        address: stop.location.address || '',
        note: stop.note,
      })),
      bookings: plan.bookings.map((booking) => ({
        title: booking.title,
        type: booking.type,
        status: booking.status,
        address: booking.address,
        url: booking.url,
        cancel_url: booking.cancelUrl,
        note: booking.note,
      })),
      reminders: plan.reminders.map((item) => `${item.time ? `${item.time} ` : ''}${item.text}`),
      tips: plan.tips,
      conflicts: plan.conflicts,
      weather_by_adjustable_date: adjustableDates.map((date) => {
        const weather = evaluateWeather(plan, date.id, weatherData, language);
        return {
          date: date.id,
          status: weather.label,
          summary: weather.snapshot ? formatWeatherSummary(weather.snapshot, language) : t('weatherUnknown'),
        };
      }),
    });

    const tripContext = {
      trip: {
        name: tripName || t('unnamedTrip'),
        range: formatTripRange(startDateStr, tripDays, language),
        days: tripDays,
        planning_from: planningStartDate?.id || null,
      },
      existing_schedule: tripDates.map(summarizeScheduleDate),
      existing_plans: normalizedPlans.map(summarizePlan),
      current_warnings: riskGroups.map((group) => ({
        title: translateRiskTitle(group.title, language),
        level: group.level,
        items: group.items,
      })),
      user_request: aiPlannerQuestion.trim(),
    };

    const planSchema = getPlanJsonSchema(language);

    if (mode === 'generate') {
      const unplannedDates = tripDates.filter((date) => !schedule[date.id]?.planId);
      if (language === 'en') {
        return `You are a travel plan-pool assistant. Generate or extend travel plans based on the current state.

Data:
${JSON.stringify({
  ...tripContext,
  mode: hasInitializedPlans ? 'extend existing plan pool' : 'generate a full plan pool from empty state',
  keep_existing_schedule_by_default: hasInitializedPlans,
  unplanned_dates: unplannedDates.map(summarizeScheduleDate),
  existing_plan_ids_should_not_duplicate: normalizedPlans.map((plan) => plan.id),
  user_request: tripContext.user_request || (hasInitializedPlans
    ? 'Add candidate plans for backups or added days; include assigned_day when useful.'
    : 'Generate an n-day trip plus backup plans, and include an initial schedule.'),
}, null, 2)}

Requirements:
1. A day may contain multiple places. Cross-city plans must state the cities clearly.
2. The number of plans may exceed the number of trip days so they can be used as backups.
3. Fill available_dates, closed_dates, weather_rules and conflicts carefully.
4. Use city/district/coordinates in location.weather_location. Do not use scenic spot names for weather lookup.
5. Fill stops.location.address and bookings.address when possible. Add bookings for reservations, tickets or cancellation/change links.
6. Add reminders and tips when useful; otherwise use empty arrays.
7. When an existing plan pool exists, do not duplicate existing plan_id. Unless explicitly replacing, only add or supplement.

Only output importable JSON. If a plan should be scheduled, write assigned_day on that plan. Format:
${planSchema}`;
      }

      return `你是旅行计划池生成助手。请根据当前状态生成或补充旅行计划。

数据：
${JSON.stringify({
  ...tripContext,
  mode: hasInitializedPlans ? '补充现有计划池' : '从空计划池生成完整规划',
  keep_existing_schedule_by_default: hasInitializedPlans,
  unplanned_dates: unplannedDates.map(summarizeScheduleDate),
  existing_plan_ids_should_not_duplicate: normalizedPlans.map((plan) => plan.id),
  user_request: tripContext.user_request || (hasInitializedPlans
    ? '请补充计划池、backup 或新增天数需要的候选计划；必要时给出 assigned_day。'
    : '请生成一个「n 天 + backup」的旅行计划池，并给出初始日程。'),
}, null, 2)}

要求：
1. 每天可以包含多个地点，跨城计划要明确城市。
2. 计划数量可以多于旅行天数，用于备选。
3. 必须写清 available_dates、closed_dates、weather_rules、conflicts。
4. location.weather_location 用城市/区县/坐标，不要用景点名做天气查询。
5. stops.location.address 和 bookings.address 尽量写清楚；需要预约、订票或退改入口时写 bookings。
6. 有特别提醒和 tips 就写，没有就留空数组。
7. 已有计划池时不要重复已有 plan_id；除非明确要替换，否则只新增或补充。

请只输出可导入 JSON；需要安排日期时在对应 plan 上写 assigned_day。格式如下：
${planSchema}`;
    }

    const context = {
      ...tripContext,
      fixed_dates_do_not_change: fixedDates.map(summarizeScheduleDate),
      adjustable_dates: adjustableDates.map(summarizeScheduleDate),
      remaining_or_adjustable_plans: remainingPlans.map(summarizePlan),
      user_request: tripContext.user_request || (language === 'en' ? 'Replan the remaining dates based on current weather, date limits, must-go priority and itinerary intensity.' : '请根据当前天气、日期限制、必去优先级和行程强度，重排剩余日期。'),
    };

    if (language === 'en') {
      return `You are a travel itinerary replanning assistant. Only adjust the remaining itinerary based on the data below. Do not change dates listed in fixed_dates_do_not_change.

You need to:
1. Rearrange the dates in adjustable_dates.
2. Prioritize must-go plans and reduce weather-unsuitable or date-unsuitable choices.
3. Do not casually move reserved/ticketed plans; call out pending reservations/tickets in the reasons.
4. Explain if a plan must be dropped.
5. Clearly list anything I need to confirm if the adjustment creates risk.
6. End with JSON so I can import or compare changes manually.

Data:
${JSON.stringify(context, null, 2)}

Please answer in this structure:
1. Recommended new schedule
2. Reasons for changes
3. Unassigned plans and reasons
4. Risks to confirm
5. JSON:
{
  "schedule": [
    { "date": "YYYY-MM-DD", "plan_id": "plan_id", "reason": "why this plan fits here" }
  ],
  "unassigned": [
    { "plan_id": "plan_id", "reason": "why it is not scheduled" }
  ],
  "warnings": ["items the user needs to confirm"]
}`;
    }

    return `你是旅行行程重排助手。请只基于下面的数据调整剩余行程，不要改动 fixed_dates_do_not_change 里的日期。

你需要做：
1. 重新安排 adjustable_dates 中的日期。
2. 优先保留必去计划，尽量减少天气不合适和日期不合适。
3. 已预约/已订票的计划不要随意挪动；未预约/未订票的计划需要在原因里提醒。
4. 如果必须放弃计划，请说明原因。
5. 如果某个调整会带来风险，请明确列出需要我确认的事项。
6. 最后输出一个 JSON，方便我手动导入或对照修改。

数据：
${JSON.stringify(context, null, 2)}

请按这个格式回答：
1. 推荐的新日程
2. 调整原因
3. 未安排计划及原因
4. 需要确认的风险
5. JSON：
{
  "schedule": [
    { "date": "YYYY-MM-DD", "plan_id": "plan_id", "reason": "为什么这样排" }
  ],
  "unassigned": [
    { "plan_id": "plan_id", "reason": "为什么没排进去" }
  ],
  "warnings": ["需要用户确认的事项"]
}`;
  };

  const copyAiPlanningPrompt = () => {
    copyText(buildAiPlanningPrompt(), t('aiPromptCopied', { label: getAiModeText(aiPlannerMode, language).label }));
  };

  const copyBatchAiPrompt = () => {
    copyText(buildAiPlanningPrompt('generate'), t('aiPromptCopied', { label: aiGenerateText.label }));
  };

  const applyImportedPayload = (parsed, message = t('jsonApplied')) => {
    let touched = false;

    if (parsed.startDateStr) setStartDateStr(parsed.startDateStr);
    if (parsed.tripDays) setTripDays(clampTripDays(parsed.tripDays));
    if (parsed.weatherData) setWeatherData(parsed.weatherData);
    if (Object.hasOwn(parsed, 'checklistText') || parsed.checklist || parsed.packingList) {
      const nextChecklistText = normalizeChecklistText(
        Object.hasOwn(parsed, 'checklistText') ? parsed.checklistText : parsed.checklist || parsed.packingList,
      );
      setChecklistText(nextChecklistText);
      setChecklistDraft(nextChecklistText);
      touched = true;
    }
    if (parsed.checklistState || parsed.checklistStatus) {
      setChecklistState(normalizeChecklistState(parsed.checklistState || parsed.checklistStatus));
      touched = true;
    }

    if (Array.isArray(parsed.plans)) {
      touched = true;
      setPlans((current) => {
        const next = [...current];
        parsed.plans.forEach((incomingPlan, index) => {
          const normalized = normalizePlan(incomingPlan, index, tripDates);
          const existingIndex = next.findIndex((plan) => plan.id === normalized.id);
          if (existingIndex >= 0) {
            next[existingIndex] = { ...next[existingIndex], ...normalized };
          } else {
            next.push(normalized);
          }
        });
        return next;
      });

      const assigned = parsed.plans.reduce((accumulator, plan) => {
        if (plan.assigned_day && plan.id) {
          accumulator[plan.assigned_day] = { planId: plan.id };
        }
        return accumulator;
      }, {});

      if (Object.keys(assigned).length) {
        touched = true;
        setSchedule((current) => ({ ...current, ...assigned }));
      }
    }

    if (Array.isArray(parsed.schedule)) {
      const importedSchedule = parsed.schedule.reduce((accumulator, item) => {
        const dateId = item.date || item.dateId || item.day;
        const planId = item.plan_id || item.planId || item.id;
        if (dateId && planId) accumulator[dateId] = { planId };
        return accumulator;
      }, {});

      if (Object.keys(importedSchedule).length) {
        touched = true;
        setSchedule((current) => ({ ...current, ...importedSchedule }));
      }
    } else if (parsed.schedule && typeof parsed.schedule === 'object') {
      touched = true;
      setSchedule((current) => ({ ...current, ...normalizeSchedule(parsed.schedule) }));
    }

    if (!touched && !parsed.startDateStr && !parsed.tripDays && !parsed.weatherData) {
      throw new Error(t('noApplicableJson'));
    }

    notify(message);
  };

  const applyAiPlannerResult = () => {
    try {
      applyImportedPayload(parseImportJson(aiPlannerResult), t('aiPlanApplied'));
      setAiPlannerResult('');
      setAiPlannerOpen(false);
      setBatchAiOpen(false);
    } catch (error) {
      notify(t('applyFailed', { message: error.message }));
    }
  };

  const buildPlanAiPrompt = () => {
    const schema = getPlanJsonSchema(language);
    const currentPlan = editorPlan
      ? {
        ...editorPlan,
        assigned_day: planAssignments.get(editorPlan.id) || null,
      }
      : null;

    return `${language === 'en'
    ? `You are a single travel-plan editing assistant. ${isCreatingPlan ? 'Add one plan' : 'Modify the current plan'} based on the user request. Only output importable JSON.`
    : `你是旅行单个计划编辑助手。请根据用户需求${isCreatingPlan ? '新增一个计划' : '修改当前计划'}，只输出可导入 JSON。`}

${language === 'en' ? 'Trip context:' : '旅行上下文：'}
${JSON.stringify({
  trip: {
    name: tripName || t('unnamedTrip'),
    range: formatTripRange(startDateStr, tripDays, language),
    dates: tripDates.map((date) => ({ date: date.id, day: `D${date.dayNumber}`, display: date.display })),
  },
  existing_plan_ids: normalizedPlans.map((plan) => plan.id),
  current_plan: currentPlan,
  user_request: planAiQuestion.trim() || (isCreatingPlan
    ? (language === 'en' ? 'Add a plan that fits the current trip.' : '请新增一个适合当前旅行的计划。')
    : (language === 'en' ? 'Improve the current plan.' : '请优化当前计划。')),
}, null, 2)}

${language === 'en' ? `Requirements:
1. ${isCreatingPlan ? 'The new plan id must not duplicate existing_plan_ids.' : 'Keep the current plan id unless the user explicitly asks to change it.'}
2. Use city/district/coordinates in location.weather_location. Do not use scenic spot names for weather lookup.
3. Fill stops.location.address and bookings.address when possible. Add bookings for reservations, tickets or cancellation/change links.
4. If the plan fits a specific day, include assigned_day.
5. Output JSON only, with no explanation.

JSON format:
${schema}` : `要求：
1. ${isCreatingPlan ? '新增计划 id 不要和 existing_plan_ids 重复。' : '除非用户明确要求，否则保留当前计划 id。'}
2. location.weather_location 用城市/区县/坐标，不要用景点名做天气查询。
3. stops.location.address 和 bookings.address 尽量写清楚；需要预约、订票或退改入口时写 bookings。
4. 如果计划适合安排到某一天，可以写 assigned_day。
5. 只输出 JSON，不要解释。

JSON 格式：
${schema}`}
`;
  };

  const copyPlanAiPrompt = () => {
    copyText(buildPlanAiPrompt(), isCreatingPlan ? t('addPlanPromptCopied') : t('editPlanPromptCopied'));
  };

  const applyPlanAiResult = () => {
    try {
      const parsed = parseImportJson(planAiResult);
      const normalizedPayload = Array.isArray(parsed.plans)
        ? parsed
        : parsed.id || parsed.name
          ? { plans: [parsed] }
          : parsed;

      if (!isCreatingPlan && Array.isArray(normalizedPayload.plans)) {
        normalizedPayload.plans = normalizedPayload.plans.map((plan, index) => (
          index === 0 ? { ...plan, id: plan.id || editorPlanId } : plan
        ));
      }

      applyImportedPayload(normalizedPayload, isCreatingPlan ? t('planCreated') : t('planUpdated'));
      closePlanEditor();
    } catch (error) {
      notify(t('applyFailed', { message: error.message }));
    }
  };

  const handleImport = () => {
    try {
      applyImportedPayload(parseImportJson(importText), t('importDone'));
      setImportModalOpen(false);
      setImportText('');
    } catch (error) {
      notify(t('importFailed', { message: error.message }));
    }
  };

  const handleExportState = () => {
    const data = { schemaVersion: APP_SCHEMA_VERSION, startDateStr, tripDays, plans: normalizedPlans, schedule, weatherData, checklistText, checklistState };
    copyText(JSON.stringify(data, null, 2), t('jsonCopied'));
  };

  const renderPlanStops = (plan) => {
    if (!plan?.stops.length) return null;

    return (
      <ol className="stop-list" aria-label={t('stopsAria', { name: plan.name })}>
        {plan.stops.map((stop) => (
          <li className="stop-item" key={stop.id}>
            <span className="stop-time">{stop.time || t('flexible')}</span>
            <span className="stop-detail">
              <strong>{stop.title}</strong>
              <span>
                {stop.location.label}
                {stop.location.address && <small>{stop.location.address}</small>}
              </span>
              {stop.note && <em>{stop.note}</em>}
            </span>
          </li>
        ))}
      </ol>
    );
  };

  const renderPlanBookings = (plan, options = {}) => {
    if (!plan?.bookings.length) return null;
    const { readOnly = false } = options;

    return (
      <div className="booking-list" aria-label={t('bookingAria', { name: plan.name })}>
        {plan.bookings.map((booking) => {
          const meta = getBookingTypeMeta(booking.type, language);
          const isDone = booking.status === 'done';
          const isNone = booking.status === 'none';
          const statusText = isNone ? t('noActionNeeded') : isDone ? meta.done : meta.pending;
          const nextStatus = isDone ? 'pending' : 'done';
          const linkUrl = isDone ? booking.cancelUrl || booking.url : booking.url;
          const linkLabel = isDone && booking.cancelUrl ? t('manage') : meta.link;

          return (
            <div className={`booking-item status-${booking.status}`} key={booking.id}>
              <div className="booking-main">
                <div className="booking-title-row">
                  <strong>{booking.title}</strong>
                  <span className={`booking-status status-${booking.status}`}>{statusText}</span>
                </div>
                {booking.address && <span className="booking-address">{booking.address}</span>}
                {booking.note && <em>{booking.note}</em>}
              </div>
              <div className="booking-actions">
                {linkUrl && (
                  <a className="booking-link" href={linkUrl} target="_blank" rel="noreferrer">
                    {linkLabel}
                  </a>
                )}
                {!readOnly && !isNone && (
                  <button
                    className="booking-toggle"
                    type="button"
                    onClick={() => updatePlanBookingStatus(plan.id, booking.id, nextStatus)}
                  >
                    {isDone ? t('undo') : meta.doneAction}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPlanNotes = (plan) => {
    if (!plan || (!plan.reminders.length && !plan.tips.length)) return null;

    return (
      <div className="plan-notes">
        {plan.reminders.length > 0 && (
          <div className="plan-note plan-reminders" aria-label={t('reminders')}>
            <strong>{t('reminders')}</strong>
            <ul>
              {plan.reminders.map((item) => (
                <li key={item.id}>
                  {item.time && <span>{item.time}</span>}
                  <em>{item.text}</em>
                </li>
              ))}
            </ul>
          </div>
        )}
        {plan.tips.length > 0 && (
          <div className="plan-note plan-tips" aria-label="Tips">
            <strong>Tips</strong>
            <ul>
              {plan.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderCandidateSignals = (candidate) => {
    if (!candidate) return null;

    const { hardReasons, notes, weather } = candidate;
    const visibleHardReasons = hardReasons.filter(
      (reason) => !(weather.level === 'blocked' && reason === weather.label),
    );

    return (
      <>
        <div className={`weather-line ${weather.level}`}>
          <strong>{weather.label}</strong>
          <span>{weather.snapshot ? formatWeatherSummary(weather.snapshot, language) : t('noWeatherForPlace')}</span>
        </div>

        {(visibleHardReasons.length > 0 || notes.length > 0) && (
          <div className="reason-row">
            {visibleHardReasons.map((reason) => (
              <span className="is-danger" key={reason}>{reason}</span>
            ))}
            {notes.map((reason) => (
              <span key={reason}>{reason}</span>
            ))}
          </div>
        )}
      </>
    );
  };

  const renderCurrentPlanBody = () => (
    <div>
      <p className="eyebrow">{t('currentPlanLabel')}</p>
      <div className="title-row current-title-row">
        <h2>{selectedPlan?.name || t('unplannedToday')}</h2>
        {selectedPlan && (
          <span className={`priority-badge ${selectedPlan.priority}`}>
            {getPriorityLabel(selectedPlan.priority, language)}
          </span>
        )}
      </div>
      <p>{selectedPlan?.description || t('currentPlanHelp')}</p>
      {renderPlanStops(selectedPlan)}
      {renderPlanBookings(selectedPlan)}
      {renderPlanNotes(selectedPlan)}
      {renderCandidateSignals(currentCandidate)}
    </div>
  );

  const renderCurrentPlanActions = () => {
    if (!selectedDate || !selectedPlan) return null;

    return (
      <div className="current-actions">
        <button className="btn btn-ghost" type="button" onClick={() => clearDay(selectedDate.id)}>
          {t('clear')}
        </button>
      </div>
    );
  };

  const renderRiskGroup = (group) => (
    <div className={`risk-item risk-group ${group.level}`} key={group.title}>
      <div className="risk-group-head">
        <strong>{translateRiskTitle(group.title, language)}</strong>
        <span>{formatCount(group.items.length, group.unit, language)}</span>
      </div>
      <ul>
        {group.items.slice(0, 6).map((item) => (
          <li key={item}>{item}</li>
        ))}
        {group.items.length > 6 && <li>{t('moreItems', { count: group.items.length - 6 })}</li>}
      </ul>
    </div>
  );

  const renderMobileRiskPanel = () => {
    const primaryRisk = riskGroups[0];
    const summaryTitle = primaryRisk
      ? mobileRisksOpen
        ? t('riskDetail')
        : `${translateRiskTitle(primaryRisk.title, language)} · ${formatCount(primaryRisk.items.length, primaryRisk.unit, language)}`
      : t('noClearRisk');

    return (
      <div className={`mobile-risk-panel ${primaryRisk ? `level-${primaryRisk.level}` : 'is-clear'}`}>
        <button
          className="mobile-risk-summary"
          type="button"
          aria-expanded={mobileRisksOpen}
          onClick={() => setMobileRisksOpen((current) => !current)}
        >
          <span>{riskGroups.length ? t('warningClasses', { count: riskGroups.length }) : t('noWarnings')}</span>
          <strong>{summaryTitle}</strong>
          <em>{mobileRisksOpen ? t('collapse') : t('expand')}</em>
        </button>

        {mobileRisksOpen && (
          <div className="risk-list mobile-risk-list">
            {riskGroups.length === 0 && <div className="empty-state">{t('noBlockingRisks')}</div>}
            {riskGroups.slice(0, 6).map(renderRiskGroup)}
          </div>
        )}
      </div>
    );
  };

  const renderMobileDayWorkspace = () => (
    <div className="mobile-workspace">
      <div className="mobile-workspace-header">
        <span>{t('dayCurrent', { day: selectedDate?.dayNumber || 1 })}</span>
        <span>{t('switchableCount', { count: availableCandidateCount })}</span>
      </div>

      <div className="section-title compact-section-title">
        <h2>{t('candidates')}</h2>
        <span>{t('available', { count: availableCandidateCount })}</span>
      </div>

      <div className="plan-grid mobile-plan-grid">
        {switchCandidates.map(({ plan, canAssign, assignedDateId, ...candidate }) => (
          <article
            className={`plan-card ${!canAssign ? 'is-disabled is-mobile-collapsed' : ''} priority-${plan.priority}`}
            key={plan.id}
          >
            <div className="plan-card-header">
              <div>
                <div className="title-row">
                  <h3>{plan.name}</h3>
                  <span className={`priority-badge ${plan.priority}`}>{getPriorityLabel(plan.priority, language)}</span>
                  {assignedDateId && (
                    <span className="assigned-badge">
                      {t('scheduledOn', { date: formatAssignedDate(assignedDateId, tripDates) })}
                    </span>
                  )}
                </div>
                <p>{plan.description}</p>
              </div>
            </div>

            {renderPlanStops(plan)}
            {renderPlanBookings(plan)}
            {renderPlanNotes(plan)}
            {renderCandidateSignals({ plan, canAssign, assignedDateId, ...candidate })}

            <button
              className="btn btn-card"
              type="button"
              disabled={!canAssign || !selectedDate}
              onClick={() => selectedDate && requestAssignPlan(selectedDate.id, plan.id)}
            >
              {t('select')}
            </button>
          </article>
        ))}
      </div>
    </div>
  );

  const renderArchivedTripRows = () => {
    if (!archivedTrips.length) return null;

    return (
      <div className="archived-trip-list">
        <strong>{t('archived')}</strong>
        {archivedTrips.map((trip) => (
          <div className="archived-trip-row" key={trip.id}>
            <span>{trip.name} · {formatTripRange(trip.startDateStr, trip.tripDays, language)}</span>
            <div className="archived-trip-actions">
              <button className="btn btn-small btn-outline" type="button" onClick={() => setArchivedViewTripId(trip.id)}>
                {t('view')}
              </button>
              <button className="btn btn-small btn-outline" type="button" onClick={() => restoreArchivedTrip(trip.id)}>
                {t('restore')}
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderArchivedTripView = (trip) => {
    if (!trip) return null;

    const archiveDates = createTripDates(trip.startDateStr, trip.tripDays, language);
    const archivePlans = (trip.plans || []).map((plan, index) => normalizePlan(plan, index, archiveDates));
    const archivePlansById = new Map(archivePlans.map((plan) => [plan.id, plan]));
    const archiveSchedule = normalizeSchedule(trip.schedule);
    const archiveWeatherData = trip.weatherData || {};

    return (
      <div className="archived-view-body">
        {archiveDates.map((date) => {
          const plan = archivePlansById.get(archiveSchedule[date.id]?.planId);
          const weather = plan ? evaluateWeather(plan, date.id, archiveWeatherData, language) : null;

          return (
            <article className={`archived-day-card ${plan ? `priority-${plan.priority}` : 'is-empty'}`} key={date.id}>
              <div className="archived-day-head">
                <div>
                  <p className="eyebrow">D{date.dayNumber}</p>
                  <h3>{date.display}</h3>
                </div>
                {plan && (
                  <span className={`priority-badge ${plan.priority}`}>
                    {getPriorityLabel(plan.priority, language)}
                  </span>
                )}
              </div>

              {plan ? (
                <>
                  <div className="archived-plan-summary">
                    <h2>{plan.name}</h2>
                    <p>{plan.description}</p>
                  </div>
                  {renderPlanStops(plan)}
                  {renderPlanBookings(plan, { readOnly: true })}
                  {renderPlanNotes(plan)}
                  {weather && (
                    <div className={`weather-line ${weather.level}`}>
                      <strong>{weather.label}</strong>
                      <span>{weather.snapshot ? formatWeatherSummary(weather.snapshot, language) : t('noWeatherForPlace')}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-state">{t('noPlanForDay')}</div>
              )}
            </article>
          );
        })}
      </div>
    );
  };

  const renderChecklistItems = () => {
    if (!checklistGroups.length) return <div className="empty-state">{t('checklistEmpty')}</div>;

    return (
      <div className="checklist-groups">
        {checklistGroups.map((group) => {
          const groupStats = getChecklistStats([group], checklistState);

          return (
            <section className="checklist-group" key={group.id}>
              <div className="checklist-group-head">
                <h3>{group.title}</h3>
                <span>{t('checklistProgress', { done: groupStats.done, total: groupStats.total })}</span>
              </div>

              <div className="checklist-items">
                {group.items.map((item) => {
                  const status = checklistState[item.id] || CHECKLIST_STATUS.todo;
                  const isDone = status === CHECKLIST_STATUS.done;
                  const isSkipped = status === CHECKLIST_STATUS.skipped;

                  return (
                    <div className={`checklist-item status-${status}`} key={item.id}>
                      <button
                        className="checklist-check"
                        type="button"
                        onClick={() => toggleChecklistDone(item.id)}
                        aria-label={isDone ? t('checklistTodo') : t('checklistDone')}
                      >
                        {isDone && <span className="check-icon" aria-hidden="true" />}
                      </button>
                      <span>{item.text}</span>
                      <button className="checklist-skip" type="button" onClick={() => toggleChecklistSkipped(item.id)}>
                        {isSkipped ? t('checklistUndoSkip') : t('checklistNotNeeded')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    );
  };

  const renderEmptyPlanState = () => (
    <main className="empty-plan-layout">
      <section className="empty-plan-panel">
        <p className="eyebrow">{t('planSetup')}</p>
        <h2>{t('emptyTitle')}</h2>
        <p>
          {t('emptyDescription')}
        </p>
        <div className="empty-plan-actions">
          <button className="btn btn-primary" type="button" onClick={openBatchAiGenerator}>
            {t('aiGenerateShort')}
          </button>
          <button className="btn btn-outline" type="button" onClick={loadExampleTrip}>
            {t('viewExample')}
          </button>
          <button className="btn btn-outline" type="button" onClick={() => setImportModalOpen(true)}>
            {t('import')}
          </button>
        </div>
        {renderArchivedTripRows()}
      </section>
    </main>
  );

  const getTripDisplay = (trip, isCurrentTrip = false) => {
    const tripHasPlans = isCurrentTrip
      ? hasInitializedPlans
      : Array.isArray(trip.plans) && trip.plans.length > 0;

    return {
      isEmpty: !tripHasPlans,
      name: tripHasPlans ? (isCurrentTrip ? tripName : trip.name) : t('emptyTripName'),
      meta: tripHasPlans
        ? `${formatTripRange(isCurrentTrip ? startDateStr : trip.startDateStr, isCurrentTrip ? tripDays : trip.tripDays, language)} · ${t('daysCount', { count: isCurrentTrip ? tripDays : trip.tripDays })}`
        : '',
    };
  };

  const activeTripDisplay = getTripDisplay(activeTripOption || {}, true);
  const tripMenuDisabled = activeTripDisplay.isEmpty && visibleTrips.length <= 1;

  return (
    <div className="app-shell">
      <header className="trip-header">
        <div className="trip-brand">
          <div className="brand-topline">
            <p className="eyebrow">Travel Gacha</p>
            <button className="language-toggle" type="button" onClick={toggleLanguage} title={t('langSwitchTitle')}>
              {t('langSwitch')}
            </button>
          </div>
          <h1>{t('appName')}</h1>
        </div>
        <div className="trip-switcher" aria-label={t('tripSwitcher')}>
          <div
            className="trip-menu"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setTripMenuOpen(false);
            }}
          >
            <button
              className={`trip-menu-trigger ${tripMenuOpen ? 'is-open' : ''} ${activeTripDisplay.isEmpty ? 'is-empty-plan' : ''}`}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={tripMenuOpen}
              disabled={tripMenuDisabled}
              onClick={() => setTripMenuOpen((current) => !current)}
            >
              <span>{activeTripDisplay.name}</span>
              {activeTripDisplay.meta && <em>{activeTripDisplay.meta}</em>}
            </button>
            {tripMenuOpen && (
              <div className="trip-menu-popover" role="listbox" aria-label={t('tripList')}>
                {visibleTrips.map((trip) => {
                  const isCurrentTrip = trip.id === activeTripId;
                  const tripDisplay = getTripDisplay(trip, isCurrentTrip);

                  return (
                    <button
                      className={`trip-menu-option ${isCurrentTrip ? 'is-selected' : ''} ${tripDisplay.isEmpty ? 'is-empty-plan' : ''}`}
                      key={trip.id}
                      type="button"
                      role="option"
                      aria-selected={isCurrentTrip}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => switchTrip(trip.id)}
                    >
                      <span>{tripDisplay.name}</span>
                      {tripDisplay.meta && <em>{tripDisplay.meta}</em>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button className="icon-btn checklist-btn" type="button" onClick={openChecklist} aria-label={t('checklistTitle')} title={t('checklistTitle')}>
            <span className="check-icon" aria-hidden="true" />
          </button>
          <button
            className="icon-btn trip-edit-btn"
            type="button"
            disabled={activeTripDisplay.isEmpty}
            onClick={() => { setTripMenuOpen(false); setEditorOpen(true); }}
            aria-label={activeTripDisplay.isEmpty ? t('noEditablePlan') : t('editPlan')}
            title={activeTripDisplay.isEmpty ? t('createOrImportFirst') : t('editPlan')}
          >
            <span className="edit-icon" aria-hidden="true" />
          </button>
          <button className="icon-btn" type="button" onClick={createNewTrip} aria-label={t('createTrip')}>
            +
          </button>
          <button className="icon-btn mobile-language-toggle" type="button" onClick={toggleLanguage} title={t('langSwitchTitle')} aria-label={t('langSwitchTitle')}>
            {t('langSwitch')}
          </button>
        </div>
      </header>

      {hasInitializedPlans ? (
      <main className="app-layout">
        <aside className="side-panel schedule-panel">
          <div className="panel-header">
            <h2>{t('itinerary')}</h2>
          </div>

          <div className="mini-calendar" aria-label={t('dailyOverview')}>
            {tripDates.map((date) => {
              const entry = schedule[date.id];
              const plan = entry ? plansById.get(entry.planId) : null;
              const selected = selectedDate?.id === date.id;
              const insight = getDayInsight(plan, date.id, schedule, plansById, weatherData, language);
              const calendarState = getCalendarDayState(plan, insight, language);

              return (
                <button
                  className={`mini-day state-${calendarState.key} ${selected ? 'is-selected' : ''}`}
                  key={date.id}
                  type="button"
                  aria-label={`D${date.dayNumber} ${formatMiniDate(date.id)} ${calendarState.ariaLabel}`}
                  onClick={() => selectScheduleDate(date.id, { scroll: true })}
                >
                  <strong>D{date.dayNumber}</strong>
                  <em>{formatMiniDate(date.id)}</em>
                  {calendarState.label && <span>{calendarState.label}</span>}
                </button>
              );
            })}
          </div>

          {renderMobileRiskPanel()}

          <div className="mobile-ai-entry">
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => openAiPlanner(hasInitializedPlans ? 'replan' : 'generate')}
            >
              {hasInitializedPlans ? t('aiReplan') : t('aiGenerateShort')}
            </button>
          </div>

          <div className="day-list" aria-label={t('dateList')}>
            {tripDates.map((date) => {
              const entry = schedule[date.id];
              const plan = entry ? plansById.get(entry.planId) : null;
              const selected = selectedDate?.id === date.id;
              const insight = getDayInsight(plan, date.id, schedule, plansById, weatherData, language);
              return (
                <Fragment key={date.id}>
                  <button
                    className={`day-tile ${selected ? 'is-selected' : ''} ${plan ? 'has-plan' : ''} status-${insight.level}`}
                    type="button"
                    ref={(node) => {
                      if (node) dayTileRefs.current.set(date.id, node);
                      else dayTileRefs.current.delete(date.id);
                    }}
                    onClick={() => selectScheduleDate(date.id)}
                  >
                    <span className="day-number">D{date.dayNumber}</span>
                    <span className="day-main">
                      <span className="day-date">{date.display}</span>
                      <span className="day-plan">
                        {plan?.name || t('unassigned')}
                        {plan && <span className={`day-priority priority-${plan.priority}`}>{getPriorityLabel(plan.priority, language)}</span>}
                      </span>
                    </span>
                    {insight.label && (
                      <span className={`day-status status-${insight.level}`}>
                        {insight.label}
                      </span>
                    )}
                    <span className="day-weather">{insight.weatherText}</span>
                    {insight.riskText && <span className={`day-risk ${insight.riskTone}`}>{insight.riskText}</span>}
                  </button>
                  {selected && (
                    <div className="current-plan selected-day-plan">
                      {renderCurrentPlanBody()}
                      {renderCurrentPlanActions()}
                    </div>
                  )}
                  {selected && <div className="mobile-day-detail">{renderMobileDayWorkspace()}</div>}
                </Fragment>
              );
            })}
          </div>
        </aside>

        <section className="main-panel">
          <div className="date-toolbar">
            <button
              className="nav-btn"
              type="button"
              onClick={() => selectNeighborDate(-1)}
              disabled={selectedIndex <= 0}
              aria-label={t('previousDay')}
            >
              ‹
            </button>
            <div>
              <p className="eyebrow">D{selectedDate?.dayNumber || 1}</p>
              <h2>{selectedDate?.display || t('chooseDate')}</h2>
            </div>
            <button
              className="nav-btn"
              type="button"
              onClick={() => selectNeighborDate(1)}
              disabled={selectedIndex < 0 || selectedIndex >= tripDates.length - 1}
              aria-label={t('nextDay')}
            >
              ›
            </button>
          </div>

          <div className="current-plan">
            {renderCurrentPlanBody()}
            {renderCurrentPlanActions()}
          </div>

          <div className="section-title">
            <h2>{t('switchablePlans')}</h2>
            <span>{t('available', { count: availableCandidateCount })}</span>
          </div>

          <div className="plan-grid">
            {switchCandidates.map(({ plan, canAssign, assignedDateId, ...candidate }) => (
              <article
                className={`plan-card ${!canAssign ? 'is-disabled is-mobile-collapsed' : ''} priority-${plan.priority}`}
                key={plan.id}
              >
                <div className="plan-card-header">
                  <div>
                    <div className="title-row">
                      <h3>{plan.name}</h3>
                      <span className={`priority-badge ${plan.priority}`}>{getPriorityLabel(plan.priority, language)}</span>
                      {assignedDateId && (
                        <span className="assigned-badge">
                          {t('scheduledOn', { date: formatAssignedDate(assignedDateId, tripDates) })}
                        </span>
                      )}
                    </div>
                    <p>{plan.description}</p>
                  </div>
                </div>

                {renderPlanStops(plan)}
                {renderPlanBookings(plan)}
                {renderPlanNotes(plan)}
                {renderCandidateSignals({ plan, canAssign, assignedDateId, ...candidate })}

                <button
                  className="btn btn-card"
                  type="button"
                  disabled={!canAssign || !selectedDate}
                  onClick={() => selectedDate && requestAssignPlan(selectedDate.id, plan.id)}
                >
                  {t('select')}
                </button>
              </article>
            ))}
          </div>
        </section>

        <aside className="side-panel status-panel">
          <div className="panel-header">
            <h2>{t('warnings')}</h2>
            <span className="small-stat">{t('warningClasses', { count: riskGroups.length })}</span>
          </div>

          <div className="risk-list">
            {riskGroups.length === 0 && <div className="empty-state">{t('noBlockingRisks')}</div>}
            {riskGroups.slice(0, 8).map(renderRiskGroup)}
          </div>

          <div className="workflow-panel ai-workflow-panel">
            <div className="panel-header compact">
              <h2>{t('aiReplan')}</h2>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => openAiPlanner(hasInitializedPlans ? 'replan' : 'generate')}
              >
                {t('open')}
              </button>
            </div>
            <p className="helper-text">
              {hasInitializedPlans
                ? t('aiReplanHelper')
                : t('aiGenerateHelperWhenEmpty')}
            </p>
          </div>

          <div className="workflow-panel">
            <div className="panel-header compact">
              <h2>{t('weather')}</h2>
              <button className="btn btn-primary" type="button" onClick={refreshWeather} disabled={weatherLoading}>
                {weatherLoading ? t('updating') : t('updateWeather')}
              </button>
            </div>
            <p className="helper-text">
              {t('weatherHelper')}
            </p>
            {weatherError && <div className="risk-item warning"><p>{weatherError}</p></div>}
            <div className="weather-source-list">
              {Object.entries(weatherData).length === 0 && <span>{t('noWeather')}</span>}
              {Object.entries(weatherData).map(([key, value]) => (
                <span key={key}>{value.label || key}</span>
              ))}
            </div>
          </div>

        </aside>
      </main>
      ) : renderEmptyPlanState()}

      {aiPlannerOpen && (
        <div className="modal-overlay" onClick={() => setAiPlannerOpen(false)}>
          <div className="modal ai-planner-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">{t('aiPlanning')}</p>
                <h2>{t('aiReplan')}</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => setAiPlannerOpen(false)} aria-label={t('closeAiPlanning')}>
                ×
              </button>
            </div>

            <p className="ai-planner-summary">
              {t('aiPlanningSummary')}
              <span>{aiReplanText.helper}</span>
            </p>

            <label>
              <span>{t('extraQuestion')}</span>
              <textarea
                className="textarea ai-question"
                value={aiPlannerQuestion}
                onChange={(event) => setAiPlannerQuestion(event.target.value)}
                placeholder={aiReplanText.placeholder}
              />
            </label>

            <label>
              <span>{t('aiResult')}</span>
              <textarea
                className="textarea ai-result"
                value={aiPlannerResult}
                onChange={(event) => setAiPlannerResult(event.target.value)}
                placeholder={t('aiResultPlaceholder')}
              />
            </label>

            <div className="modal-actions">
              <button className="btn btn-outline" type="button" onClick={() => setAiPlannerOpen(false)}>
                {t('close')}
              </button>
              <button className="btn btn-primary" type="button" onClick={copyAiPlanningPrompt}>
                {t('copyToAi')}
              </button>
              <button className="btn btn-primary" type="button" onClick={applyAiPlannerResult}>
                {t('applyResult')}
              </button>
            </div>
          </div>
        </div>
      )}

      {editorOpen && (
        <div className="modal-overlay" onClick={() => setEditorOpen(false)}>
          <div className="modal trip-editor-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">{t('planSetup')}</p>
                <h2>{editorPlanId ? (isCreatingPlan ? t('addPlan') : t('editSinglePlan')) : t('editPlan')}</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => setEditorOpen(false)} aria-label={t('closeEditor')}>
                ×
              </button>
            </div>

            {editorPlanId ? (
              <div className="plan-editor-detail">
                <button className="btn btn-small btn-outline plan-back-btn" type="button" onClick={closePlanEditor}>
                  {t('backToList')}
                </button>

                <div className="plan-editor-current">
                  <p className="eyebrow">{isCreatingPlan ? t('newPlan') : t('currentPlan')}</p>
                  <h2>{isCreatingPlan ? t('addPlan') : editorPlan?.name || t('planMissing')}</h2>
                  {!isCreatingPlan && editorPlan && (
                    <>
                      <p>{editorPlan.description}</p>
                      {renderPlanStops(editorPlan)}
                      {renderPlanBookings(editorPlan)}
                      {renderPlanNotes(editorPlan)}
                    </>
                  )}
                  {isCreatingPlan && (
                    <p>{t('newPlanHelp')}</p>
                  )}
                </div>

                <label>
                  <span>{t('yourRequest')}</span>
                  <textarea
                    className="textarea plan-ai-question"
                    value={planAiQuestion}
                    onChange={(event) => setPlanAiQuestion(event.target.value)}
                    placeholder={isCreatingPlan ? t('newPlanPlaceholder') : t('editPlanPlaceholder')}
                  />
                </label>

                <label>
                  <span>{t('aiResult')}</span>
                  <textarea
                    className="textarea plan-ai-result"
                    value={planAiResult}
                    onChange={(event) => setPlanAiResult(event.target.value)}
                    placeholder={t('planAiResultPlaceholder')}
                  />
                </label>

                <div className="modal-actions">
                  <button className="btn btn-outline" type="button" onClick={copyPlanAiPrompt}>
                    {t('copyToAi')}
                  </button>
                  <button className="btn btn-primary" type="button" onClick={applyPlanAiResult}>
                    {t('applyResult')}
                  </button>
                </div>
              </div>
            ) : (
              <>
            <div className="trip-editor-grid">
              <label className="trip-name-field">
                <span>{t('planName')}</span>
                <input
                  className="input"
                  value={tripName}
                  onChange={(event) => setTripName(event.target.value)}
                />
              </label>
              <div className="date-range-field">
                <span>{t('dateRange')}</span>
                <div className="date-range-inputs">
                  <label>
                    <em>{t('start')}</em>
                    <input
                      className="input"
                      type="date"
                      value={startDateStr}
                      onChange={(event) => {
                        const nextStartDate = event.target.value;
                        if (!nextStartDate) return;
                        setStartDateStr(nextStartDate);
                        setSelectedDateId(getSmartSelectedDate(nextStartDate, tripDays));
                      }}
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
                      onChange={(event) => {
                        if (!event.target.value) return;
                        const nextTripDays = getInclusiveDateSpan(startDateStr, event.target.value);
                        setTripDays(nextTripDays);
                        setSelectedDateId(getSmartSelectedDate(startDateStr, nextTripDays));
                      }}
                    />
                  </label>
                  <strong>{t('daysCount', { count: tripDays })}</strong>
                </div>
              </div>
            </div>

            <div className="editor-section">
              <div className="panel-header compact">
                <h2>{t('planData')}</h2>
                <span className="small-stat">{t('plansCount', { count: normalizedPlans.length })}</span>
              </div>
              <div className="action-grid editor-action-grid">
                <button
                  className={`btn ai-toggle-btn ${batchAiOpen ? 'is-open' : 'btn-primary'}`}
                  type="button"
                  aria-expanded={batchAiOpen}
                  onClick={() => {
                    setEditorPlanId(null);
                    setAiPlannerMode('generate');
                    setBatchAiOpen((current) => !current);
                  }}
                  title={t('aiPlanPoolTitle')}
                >
                  <span>{t('aiGenerateShort')}</span>
                  <span className="toggle-chevron" aria-hidden="true" />
                </button>
                <button className="btn btn-outline" type="button" onClick={loadExampleTrip} title={t('loadFullExample')}>
                  {t('viewExample')}
                </button>
                <button className="btn btn-outline" type="button" onClick={() => setImportModalOpen(true)} title={t('importJsonTitle')}>
                  {t('import')}
                </button>
                <button className="btn btn-outline" type="button" onClick={handleExportState} title={t('copyCurrentJson')}>
                  {t('export')}
                </button>
              </div>
              {batchAiOpen && (
                <div className="editor-ai-panel">
                  <div className="panel-header compact">
                    <div>
                      <h3>{t('aiPlanPoolTitle')}</h3>
                      <p>{t('aiPlanPoolHelp')}</p>
                    </div>
                  </div>

                  <label>
                    <span>{t('yourRequest')}</span>
                    <textarea
                      className="textarea ai-question"
                      value={aiPlannerQuestion}
                      onChange={(event) => setAiPlannerQuestion(event.target.value)}
                      placeholder={aiGenerateText.placeholder}
                    />
                  </label>

                  <label>
                    <span>{t('aiResult')}</span>
                    <textarea
                      className="textarea ai-result"
                      value={aiPlannerResult}
                      onChange={(event) => setAiPlannerResult(event.target.value)}
                      placeholder={t('aiResultPlaceholder')}
                    />
                  </label>

                  <div className="modal-actions">
                    <button className="btn btn-outline" type="button" onClick={copyBatchAiPrompt}>
                      {t('copyToAi')}
                    </button>
                    <button className="btn btn-primary" type="button" onClick={applyAiPlannerResult}>
                      {t('applyResult')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="editor-section">
              <div className="panel-header compact">
                <h2>{t('planList')}</h2>
                <span className="small-stat">{t('itemsCount', { count: normalizedPlans.length })}</span>
              </div>
              <div className="plan-review-list">
                {normalizedPlans.map((plan) => {
                  const assignedDate = planAssignments.get(plan.id);
                  return (
                    <div className="plan-review-row" key={plan.id}>
                      <div>
                        <strong>{plan.name}</strong>
                        <span>
                          {getPriorityLabel(plan.priority, language)}
                          {assignedDate ? t('scheduledSuffix', { date: formatAssignedDate(assignedDate, tripDates) }) : t('unscheduledSuffix')}
                        </span>
                      </div>
                      <div className="plan-review-actions">
                        <button
                          className="icon-btn compact-icon-btn"
                          type="button"
                          onClick={() => openPlanEditor(plan.id)}
                          aria-label={`${t('editPlan')} ${plan.name}`}
                          title={t('editPlan')}
                        >
                          <span className="edit-icon" aria-hidden="true" />
                        </button>
                        <button
                          className="icon-btn compact-icon-btn danger-icon-btn"
                          type="button"
                          onClick={() => removePlan(plan.id)}
                          aria-label={`${t('delete')} ${plan.name}`}
                          title={t('delete')}
                        >
                          <span className="trash-icon" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                <button className="plan-add-row" type="button" onClick={() => openPlanEditor()}>
                  <strong>{t('addPlan')}</strong>
                  <span>{t('addPlanHelp')}</span>
                </button>
              </div>
            </div>

            <div className="editor-section archive-section">
              <div className="trip-lifecycle-actions">
                <button className="btn btn-outline" type="button" onClick={archiveCurrentTrip}>
                  {t('archive')}
                </button>
                <button className="btn btn-danger" type="button" onClick={deleteCurrentTrip}>
                  {t('delete')}
                </button>
              </div>
              {renderArchivedTripRows()}
            </div>
              </>
            )}
          </div>
        </div>
      )}

      {checklistOpen && (
        <div className="modal-overlay" onClick={() => setChecklistOpen(false)}>
          <div className="modal checklist-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">{t('checklist')}</p>
                <h2>{t('checklistTitle')}</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => setChecklistOpen(false)} aria-label={t('close')}>
                ×
              </button>
            </div>

            <div className="checklist-overview">
              <div>
                <strong>{t('checklistProgress', { done: checklistStats.done, total: checklistStats.total })}</strong>
                {checklistStats.skipped > 0 && <span>{t('checklistSkipped', { count: checklistStats.skipped })}</span>}
              </div>
              <div className="checklist-progress" aria-hidden="true">
                <span style={{ width: `${checklistStats.total ? Math.round((checklistStats.done / checklistStats.total) * 100) : 0}%` }} />
              </div>
            </div>

            {checklistEditing ? (
              <div className="checklist-editor">
                <p className="helper-text">{t('checklistFormatHint')}</p>
                <label>
                  <span>{t('checklistTextLabel')}</span>
                  <textarea
                    className="textarea checklist-textarea"
                    value={checklistDraft}
                    onChange={(event) => setChecklistDraft(event.target.value)}
                  />
                </label>
                <div className="modal-actions">
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() => {
                      setChecklistDraft(checklistText);
                      setChecklistEditing(false);
                    }}
                  >
                    {t('cancel')}
                  </button>
                  <button className="btn btn-primary" type="button" onClick={saveChecklistText}>
                    {t('checklistSave')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {renderChecklistItems()}
                <div className="modal-actions">
                  <button className="btn btn-outline" type="button" onClick={() => setChecklistEditing(true)}>
                    {t('checklistEdit')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {archivedViewTrip && (
        <div className="modal-overlay" onClick={() => setArchivedViewTripId(null)}>
          <div className="modal archived-view-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">{t('archivedView')}</p>
                <h2>{archivedViewTrip.name}</h2>
                <span className="archived-view-meta">
                  {formatTripRange(archivedViewTrip.startDateStr, archivedViewTrip.tripDays, language)} · {t('daysCount', { count: archivedViewTrip.tripDays })}
                </span>
              </div>
              <div className="archived-view-actions">
                <span className="readonly-badge">{t('readOnly')}</span>
                <button className="icon-btn" type="button" onClick={() => setArchivedViewTripId(null)} aria-label={t('close')}>
                  ×
                </button>
              </div>
            </div>

            {renderArchivedTripView(archivedViewTrip)}
          </div>
        </div>
      )}

      {importModalOpen && (
        <div className="modal-overlay" onClick={() => setImportModalOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2>{t('importJsonTitle')}</h2>
              <button className="icon-btn" type="button" onClick={() => setImportModalOpen(false)} aria-label={t('close')}>
                ×
              </button>
            </div>
            <textarea
              className="textarea"
              rows={12}
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder='{"plans":[]}'
            />
            <div className="modal-actions">
              <button className="btn btn-outline" type="button" onClick={() => setImportModalOpen(false)}>
                {t('cancel')}
              </button>
              <button className="btn btn-primary" type="button" onClick={handleImport}>
                {t('import')}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingAssignment && (
        <div className="modal-overlay" onClick={() => setPendingAssignment(null)}>
          <div className="modal impact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2>{t('impactPreview')}</h2>
              <button className="icon-btn" type="button" onClick={() => setPendingAssignment(null)} aria-label={t('close')}>
                ×
              </button>
            </div>

            <div className="impact-summary">
              <strong>{pendingAssignment.targetPlan.name}</strong>
              <span>{t('assignToDate', { date: pendingAssignment.dateId })}</span>
            </div>

            {pendingAssignment.clears.length > 0 && (
              <div className="impact-section">
                <h3>{t('datesToClear')}</h3>
                {pendingAssignment.clears.map((item) => (
                  <div className="impact-row" key={`${item.dateId}-${item.plan.id}`}>
                    <span>{item.dateId}</span>
                    <strong>{item.plan.name}</strong>
                    <em>{translateIssue(item.reason, language)}</em>
                  </div>
                ))}
              </div>
            )}

            {pendingAssignment.nextRisks.length > 0 && (
              <div className="impact-section">
                <h3>{t('nextRisks')}</h3>
                {pendingAssignment.nextRisks.map((risk) => (
                  <div className={`risk-item ${risk.level}`} key={risk.plan.id}>
                    <strong>{risk.plan.name}</strong>
                    <p>{translateRiskTitle(risk.title, language)}{risk.reasons.length ? `${language === 'en' ? ': ' : '：'}${risk.reasons.map((reason) => translateIssue(reason, language)).join(' / ')}` : ''}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-outline" type="button" onClick={() => setPendingAssignment(null)}>
                {t('cancel')}
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={confirmPendingAssignment}
              >
                {t('continueAdjust')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;

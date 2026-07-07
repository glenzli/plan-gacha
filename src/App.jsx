import { Fragment, memo, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { createPlanGachaDriveStorage, hasStoredDriveStorageFile } from './driveStorageAdapter.js';

const APP_SCHEMA_VERSION = '1.0';
const COMPATIBLE_APP_SCHEMA_VERSIONS = new Set([APP_SCHEMA_VERSION, '13']);
const DEFAULT_TRIP_DAYS = 5;
const WEATHER_FETCH_TIMEOUT_MS = 20000;
const WEATHER_BATCH_TIMEOUT_MS = 60000;
const WEATHER_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const WEATHER_FETCH_CONCURRENCY = 4;
const DRIVE_AUTO_SYNC_MS = 5 * 60 * 1000;
const DRIVE_STORAGE_EXPOSURE = normalizeDriveStorageExposure(
  import.meta.env.VITE_DRIVE_STORAGE_EXPOSURE || 'url',
);
const WEATHER_ERRORS_KEY = Symbol('weatherErrors');
const WEATHER_CACHE_HIT_KEY = Symbol('weatherCacheHit');
const weatherTranslationCache = new Map();
const NEW_PLAN_EDITOR_ID = '__new_plan__';
const DEFAULT_LANGUAGE = 'zh';
const SUPPORTED_LANGUAGES = ['zh', 'en'];
const CHECKLIST_STATUS = {
  todo: 'todo',
  done: 'done',
  skipped: 'skipped',
};
const DEFAULT_CHECKLIST_TEXT = '';
const EXAMPLE_CHECKLIST_TEXT = `# 证件
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
    placeCopied: '地点已复制',
    copyPlace: '复制地点',
    openInMaps: '在 Google 地图打开',
    openRouteInMaps: '从上一地点到这里',
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
    importFile: '导入文件',
    importFileLoaded: ({ name }) => `已读取 ${name}`,
    importFileReadFailed: '文件读取失败',
    jsonCopied: 'JSON 已复制',
    jsonDownloaded: 'JSON 已下载',
    downloadFailed: '下载失败',
    sharePlanImage: '分享图片',
    planImageCopied: '图片已复制',
    planImageShared: '图片已生成',
    planImageDownloaded: '图片已下载',
    planImageFailed: '生成图片失败',
    driveSync: '远端同步',
    driveSyncHelp: '把本地工作区同步到宿主提供的远端 JSON 存储；未连接时会先连接，未创建文件时会自动创建。',
    driveUnavailable: '当前环境没有可用的远端同步服务，仍会继续保存在本地浏览器。',
    driveNotConfigured: '远端同步能力已加载，但宿主侧尚未完成配置。',
    driveNotConnected: '未连接远端同步',
    driveNoFile: '已连接，还没有同步文件',
    driveConnectedFile: ({ name }) => `同步文件：${name}`,
    driveUpdatedAt: ({ time }) => `远端更新：${time}`,
    driveSyncNow: '同步',
    driveConnectAndSync: '连接并同步',
    driveAutoSync: '自动同步',
    driveAutoSyncHelp: '连接并创建同步文件后，每 5 分钟自动保存一次。',
    driveBusy: '同步中...',
    driveLoaded: '已从远端拉取',
    driveSynced: '已同步到远端',
    driveMerged: '已合并并同步到远端',
    driveLinkedExisting: '已绑定远端同步文件',
    driveRemoteFound: '已找到远端同步文件，请选择拉取远端或覆盖远端。',
    driveActionFailed: ({ message }) => `远端同步失败：${message}`,
    driveAmbiguousFile: '找到多个同名同步文件，请先在 Drive 中清理重复文件后再同步。',
    driveFileMissing: '远端同步文件已不存在，已清除本地绑定。再次同步会创建新的远端文件。',
    driveInvalidJson: '远端文件不是合法 JSON，请检查文件内容，或清除绑定后重新同步。',
    driveConflictTitle: '需要确认远端文件',
    driveConflictHelp: '远端文件和当前本地数据需要确认。可以尝试自动合并；如果失败，再选择拉取远端或覆盖远端。',
    drivePullRemote: '拉取远端',
    driveMergeRemote: '合并',
    driveOverwriteRemote: '覆盖远端',
    driveMergeFailed: ({ message }) => `无法自动合并：${message}`,
    driveMergeInvalidSnapshot: ({ source }) => `${source === 'remote' ? '远端' : source === 'local' ? '本地' : '合并结果'}不是当前应用的完整同步文件`,
    driveMergeSchemaMismatch: ({ source, version }) => `${source === 'remote' ? '远端' : source === 'local' ? '本地' : '合并结果'} schemaVersion 不兼容：${version}`,
    driveMergeDataConflict: ({ path }) => `同一数据被两边修改（${path}）`,
    driveInvalidSnapshot: '远端文件不是可用的行程扭蛋数据',
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
    noBlockingRisks: '当前安排没有把未排计划卡死。',
    checklistIncomplete: '旅行清单未完成',
    aiReplanHelper: '用于大改剩余行程：整理未完成计划、当前安排、天气和预警，再复制给你常用的 AI。',
    aiGenerateHelperWhenEmpty: '当前还是空计划，会直接进入 AI 生成，用来创建计划池、备选方案和初始日程。',
    weather: '天气',
    updating: '更新中',
    updateWeather: '更新天气',
    weatherSourcesCount: ({ count }) => `已更新 ${count} 个地点`,
    viewWeatherSources: '查看地点',
    hideWeatherSources: '收起地点',
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
    planAiResultPlaceholder: '粘贴 AI 输出的单个计划 JSON，例如 {"id": "...", "name": "..."}',
    editMode: '编辑方式',
    aiEditTab: 'AI 辅助',
    rawJsonTab: '手动编辑',
    rawPlanJsonTitle: 'Raw JSON',
    rawPlanJsonHelp: '适合结构化手工修正；应用后只替换当前计划。',
    rawPlanJsonPlaceholder: '粘贴或修改单个计划 JSON',
    applyJson: '应用 JSON',
    applyPlanDraft: '应用修改',
    duplicatePlanId: ({ id }) => `计划 id 已存在：${id}`,
    invalidPlanField: ({ path, value }) => `${path} 的值不支持：${value}`,
    planName: '计划名称',
    dateRange: '日期范围',
    start: '开始',
    end: '结束',
    daysCount: ({ count }) => `${count} 天`,
    lodgingSection: '住宿',
    lodgingSectionHelp: '用于判断每天从哪里出发、在哪里结束，以及是否需要换酒店。',
    lodgingEmpty: '还没有住宿信息',
    lodgingEmptyHelp: '补上酒店/民宿名称、日期和地址后，预警会消失，AI 规划也会更准。',
    editLodging: '补住宿',
    addLodging: '新增住宿',
    lodgingNameLabel: '住宿名称',
    lodgingAddressLabel: '地址',
    lodgingCheckIn: '入住',
    lodgingCheckOut: '退房',
    lodgingNote: '备注',
    saveLodgings: '保存住宿',
    lodgingsSaved: '住宿已更新',
    planData: '计划数据',
    plansCount: ({ count }) => `${count} 个计划`,
    loadFullExample: '载入完整示例',
    importJsonTitle: '导入 JSON',
    copyCurrentJson: '导出 JSON',
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
    checklistUseExample: '填入示例',
    checklistExampleLoaded: '清单示例已填入',
    checklistImport: '导入清单',
    checklistImportTitle: '导入旅行清单',
    checklistImportHelp: '粘贴清单 JSON，或直接粘贴 # 分类 + 一行一个事项。替换会覆盖当前清单；合并会保留当前清单并追加新事项。',
    checklistImportPlaceholder: '# 证件\n身份证/护照\n驾照/学生证',
    checklistReplace: '替换',
    checklistMerge: '合并',
    checklistImported: '清单已导入',
    checklistMerged: '清单已合并',
    checklistImportEmpty: '没有找到清单内容',
    checklistMergeConflicts: ({ count }) => `已合并，${count} 项需要确认`,
    checklistMergeConflictHelp: '已保留当前清单，能确定的状态已迁移。分类或状态冲突建议交给 AI 整理后再导入。',
    checklistConflictCategory: '分类不一致',
    checklistConflictStatus: '状态不一致',
    checklistConflictDuplicate: '重复项有歧义',
    checklistExport: '导出清单',
    checklistExported: '清单 JSON 已下载',
    checklistResetState: '重置状态',
    checklistStateReset: '清单状态已重置',
    checklistNotNeeded: '不需要',
    checklistUndoSkip: '需要',
    checklistDone: '完成',
    checklistTodo: '未完成',
    restore: '恢复',
    cancel: '取消',
    impactPreview: '调整影响预览',
    assignToDate: ({ date }) => `安排到 ${date}`,
    datesToMove: '会移动原安排',
    datesToClear: '会清空这些日期',
    nextRisks: '继续后新增风险',
    continueAdjust: '继续调整',
    currentPlanLabel: '当前方案',
    unplannedToday: '当天未安排',
    currentPlanHelp: '从下面的候选里换一个，系统会先评估是否影响后续计划。',
    clear: '清空',
    moreItems: ({ count }) => `还有 ${count} 项`,
    riskDetail: '预警详情',
    noClearRisk: '当前安排没有明显冲突',
    noWarnings: '暂无预警',
    lodgingMissing: '住宿信息未填写',
    lodgingMissingHelp: '补上住宿后，AI 可以按每天出发点、返回点和换酒店约束规划。',
    collapse: '收起',
    expand: '展开',
    switchableCount: ({ count }) => `${count} 个可切换`,
    candidates: '候选',
    candidateReady: '可直接选择',
    candidateScheduled: '已安排，可移动',
    candidateUnavailable: '不可选',
    viewPlanDetails: '查看细节',
    hidePlanDetails: '收起细节',
    select: '选择',
    noWeatherForPlace: '尚未获取地点天气，先更新天气',
    reminders: '特别提醒',
    bookingAndTickets: '预约和订票',
    bookingNeededBadge: ({ count }) => `待预约 ${count}`,
    bookingDoneBadge: '已预约',
    stopsAria: ({ name }) => `${name} 行程节点`,
    transferLabel: '交通',
    openingHours: '营业',
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
    placeCopied: 'Place copied',
    copyPlace: 'Copy place',
    openInMaps: 'Open in Google Maps',
    openRouteInMaps: 'Route from previous stop',
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
    importFile: 'Import file',
    importFileLoaded: ({ name }) => `${name} loaded`,
    importFileReadFailed: 'Failed to read file',
    jsonCopied: 'JSON copied',
    jsonDownloaded: 'JSON downloaded',
    downloadFailed: 'Download failed',
    sharePlanImage: 'Share image',
    planImageCopied: 'Image copied',
    planImageShared: 'Image ready',
    planImageDownloaded: 'Image downloaded',
    planImageFailed: 'Failed to create image',
    driveSync: 'Remote sync',
    driveSyncHelp: 'Sync the local workspace with host-provided remote JSON storage. It connects first, then creates a sync file when needed.',
    driveUnavailable: 'Remote sync is unavailable in this environment. Local browser storage still works.',
    driveNotConfigured: 'Remote sync is loaded, but the host integration is not configured.',
    driveNotConnected: 'Remote sync not connected',
    driveNoFile: 'Connected, no sync file yet',
    driveConnectedFile: ({ name }) => `Sync file: ${name}`,
    driveUpdatedAt: ({ time }) => `Remote updated: ${time}`,
    driveSyncNow: 'Sync',
    driveConnectAndSync: 'Connect & sync',
    driveAutoSync: 'Auto sync',
    driveAutoSyncHelp: 'After connecting and creating a sync file, save automatically every 5 minutes.',
    driveBusy: 'Syncing...',
    driveLoaded: 'Pulled from remote',
    driveSynced: 'Synced to remote',
    driveMerged: 'Merged and synced to remote',
    driveLinkedExisting: 'Existing remote sync file linked',
    driveRemoteFound: 'Remote sync file found. Pull remote or overwrite remote to continue.',
    driveActionFailed: ({ message }) => `Remote sync failed: ${message}`,
    driveAmbiguousFile: 'Multiple matching sync files were found in Drive. Clean up duplicates before syncing again.',
    driveFileMissing: 'The remote sync file no longer exists. The local binding was cleared; syncing again will create a new remote file.',
    driveInvalidJson: 'The remote file is not valid JSON. Check the file content, or clear the binding and sync again.',
    driveConflictTitle: 'Remote file needs review',
    driveConflictHelp: 'The remote file and current local data need review. Try automatic merge first; if it fails, pull remote or overwrite remote.',
    drivePullRemote: 'Pull remote',
    driveMergeRemote: 'Merge',
    driveOverwriteRemote: 'Overwrite remote',
    driveMergeFailed: ({ message }) => `Cannot auto-merge: ${message}`,
    driveMergeInvalidSnapshot: ({ source }) => `${source} is not a complete sync file for this app`,
    driveMergeSchemaMismatch: ({ source, version }) => `${source} schemaVersion is incompatible: ${version}`,
    driveMergeDataConflict: ({ path }) => `Both sides changed the same data (${path})`,
    driveInvalidSnapshot: 'The remote file is not valid Plan Gacha data',
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
    noBlockingRisks: 'No current arrangement blocks the remaining plans.',
    checklistIncomplete: 'Checklist incomplete',
    aiReplanHelper: 'For larger changes: collect remaining plans, current schedule, weather and warnings, then copy them to your usual AI.',
    aiGenerateHelperWhenEmpty: 'This is still empty, so it opens AI Generate to create a plan pool, backups and initial schedule.',
    weather: 'Weather',
    updating: 'Updating',
    updateWeather: 'Update',
    weatherSourcesCount: ({ count }) => `${count} locations updated`,
    viewWeatherSources: 'View locations',
    hideWeatherSources: 'Hide locations',
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
    planAiResultPlaceholder: 'Paste one plan JSON, for example {"id": "...", "name": "..."}',
    editMode: 'Edit mode',
    aiEditTab: 'AI assist',
    rawJsonTab: 'Manual',
    rawPlanJsonTitle: 'Raw JSON',
    rawPlanJsonHelp: 'For structured manual fixes. Applying replaces only the current plan.',
    rawPlanJsonPlaceholder: 'Paste or edit one plan JSON',
    applyJson: 'Apply JSON',
    applyPlanDraft: 'Apply changes',
    duplicatePlanId: ({ id }) => `Plan id already exists: ${id}`,
    invalidPlanField: ({ path, value }) => `${path} has unsupported value: ${value}`,
    planName: 'Trip name',
    dateRange: 'Date range',
    start: 'Start',
    end: 'End',
    daysCount: ({ count }) => `${count} days`,
    lodgingSection: 'Lodging',
    lodgingSectionHelp: 'Used to plan daily start/end points and hotel-transfer days.',
    lodgingEmpty: 'No lodging yet',
    lodgingEmptyHelp: 'Add hotel/stay name, dates and address to clear the warning and improve AI planning.',
    editLodging: 'Add lodging',
    addLodging: 'Add lodging',
    lodgingNameLabel: 'Lodging name',
    lodgingAddressLabel: 'Address',
    lodgingCheckIn: 'Check-in',
    lodgingCheckOut: 'Check-out',
    lodgingNote: 'Note',
    saveLodgings: 'Save lodging',
    lodgingsSaved: 'Lodging updated',
    planData: 'Plan data',
    plansCount: ({ count }) => `${count} plans`,
    loadFullExample: 'Load full example',
    importJsonTitle: 'Import JSON',
    copyCurrentJson: 'Export JSON',
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
    checklistUseExample: 'Use example',
    checklistExampleLoaded: 'Checklist example loaded',
    checklistImport: 'Import checklist',
    checklistImportTitle: 'Import trip checklist',
    checklistImportHelp: 'Paste checklist JSON, or paste # Category plus one item per line. Replace overwrites the current checklist; merge keeps current items and adds new ones.',
    checklistImportPlaceholder: '# Documents\nPassport / ID\nDriver license / student ID',
    checklistReplace: 'Replace',
    checklistMerge: 'Merge',
    checklistImported: 'Checklist imported',
    checklistMerged: 'Checklist merged',
    checklistImportEmpty: 'No checklist content found',
    checklistMergeConflicts: ({ count }) => `Merged, ${count} items need review`,
    checklistMergeConflictHelp: 'The current checklist was kept, and clear status matches were migrated. Category or status conflicts should be cleaned up with AI and imported again.',
    checklistConflictCategory: 'Category differs',
    checklistConflictStatus: 'Status differs',
    checklistConflictDuplicate: 'Duplicate item is ambiguous',
    checklistExport: 'Export checklist',
    checklistExported: 'Checklist JSON downloaded',
    checklistResetState: 'Reset status',
    checklistStateReset: 'Checklist status reset',
    checklistNotNeeded: 'Skip',
    checklistUndoSkip: 'Need',
    checklistDone: 'Done',
    checklistTodo: 'Todo',
    restore: 'Restore',
    cancel: 'Cancel',
    impactPreview: 'Impact preview',
    assignToDate: ({ date }) => `Assign to ${date}`,
    datesToMove: 'Original assignment to move',
    datesToClear: 'Dates to clear',
    nextRisks: 'New risks after continuing',
    continueAdjust: 'Continue',
    currentPlanLabel: 'Current plan',
    unplannedToday: 'No plan today',
    currentPlanHelp: 'Pick one from the candidates below. The system checks whether it impacts later plans first.',
    clear: 'Clear',
    moreItems: ({ count }) => `${count} more`,
    riskDetail: 'Warning details',
    noClearRisk: 'No obvious conflicts in the current schedule.',
    noWarnings: 'No warnings',
    lodgingMissing: 'Lodging missing',
    lodgingMissingHelp: 'Add lodging so AI can plan around daily start, return and hotel-transfer constraints.',
    collapse: 'Collapse',
    expand: 'Expand',
    switchableCount: ({ count }) => `${count} switchable`,
    candidates: 'Candidates',
    candidateReady: 'Ready to select',
    candidateScheduled: 'Scheduled elsewhere',
    candidateUnavailable: 'Unavailable',
    viewPlanDetails: 'View details',
    hidePlanDetails: 'Hide details',
    select: 'Select',
    noWeatherForPlace: 'No location weather yet. Update weather first.',
    reminders: 'Reminders',
    bookingAndTickets: 'Bookings and tickets',
    bookingNeededBadge: ({ count }) => `Booking ${count}`,
    bookingDoneBadge: 'Booked',
    stopsAria: ({ name }) => `${name} itinerary stops`,
    transferLabel: 'Transit',
    openingHours: 'Hours',
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
    restaurant_reservation: { pending: '餐厅未预约', done: '餐厅已预约', link: '预约', doneAction: '标记已预约' },
    ticket: { pending: '未订票', done: '已订票', link: '订票', doneAction: '标记已订票' },
    confirmation: { pending: '待确认', done: '已确认', link: '查看', doneAction: '标记已确认' },
  },
  en: {
    reservation: { pending: 'Not reserved', done: 'Reserved', link: 'Reserve', doneAction: 'Mark reserved' },
    restaurant_reservation: { pending: 'Restaurant not reserved', done: 'Restaurant reserved', link: 'Reserve', doneAction: 'Mark reserved' },
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

const WEATHER_RULE_VALUES = new Set(Object.keys(WEATHER_LABELS.zh).filter((key) => key !== 'unknown'));
const BOOKING_TYPE_VALUES = new Set([
  'reservation',
  'ticket',
  'confirmation',
  'restaurant_reservation',
  'restaurant',
  'dining',
  'meal',
  'food',
  '餐厅',
  '餐厅预约',
  '饭店',
  '食事',
  'train',
  'flight',
  'boat',
  'ferry',
  'pass',
  '票',
  '车票',
  '门票',
  'confirm',
  'check',
  'notice',
  '确认',
  '预约',
  '预订',
]);
const BOOKING_STATUS_VALUES = new Set([
  'pending',
  'done',
  'none',
  'booked',
  'reserved',
  'purchased',
  'confirmed',
  'complete',
  'completed',
  'not_needed',
  'optional',
  '已预约',
  '已订票',
  '已确认',
  '未预约',
  '未订票',
  '待确认',
  '待预约',
  '待订票',
  '待处理',
  '需预约',
  '无需',
  '无需预约',
]);

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
  checklistText: 'pg_checklistText',
  checklistState: 'pg_checklistState',
  weatherCache: 'pg_weatherCache',
  driveAutoSync: 'pg_driveAutoSync',
};

const PRIORITY_META = {
  must: { label: '必去', rank: 4 },
  preferred: { label: '想去', rank: 3 },
  backup: { label: '备用', rank: 2 },
  optional: { label: '可放弃', rank: 1 },
};

const HARD_BLOCKED_WEATHER = ['storm'];
const SEVERE_WEATHER = ['storm', 'heavy_rain'];
const SOFT_RAIN_WEATHER = ['drizzle', 'rain'];
const RAIN_PROBABILITY_NOTICE = 31;
const RAIN_PROBABILITY_BLOCK = 51;
const RAIN_PROBABILITY_HIGH = 70;
const INDOOR_HINTS = ['室内', '馆内', '博物馆', '美术馆', '水族馆', '展馆', '商场', '购物', '咖啡', '餐厅', '避暑', '避雨', 'indoor', 'museum', 'aquarium', 'mall', 'shopping', 'cafe'];
const OUTDOOR_HINTS = ['户外', '室外', '森林', '瀑布', '溪谷', '溪流', '徒步', '远足', '散步', '公园', '湖畔', '海边', '海岸', '山', '露天', 'outside', 'outdoor', 'forest', 'waterfall', 'hike', 'trail', 'park', 'walk', 'lake', 'beach', 'coast', 'mountain'];

function normalizeLanguage(value) {
  return SUPPORTED_LANGUAGES.includes(value) ? value : DEFAULT_LANGUAGE;
}

function normalizeDriveStorageExposure(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['0', 'false', 'no', 'none'].includes(normalized)) return 'off';
  if (normalized === 'off') return 'off';
  return 'url';
}

function getInitialLanguage() {
  try {
    const params = new URLSearchParams(window.location.search);
    return normalizeLanguage(params.get('lang') || DEFAULT_LANGUAGE);
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function getDriveStorageEnabledFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('sync') === '1';
  } catch {
    return false;
  }
}

function getDriveStorageFeatureEnabled() {
  if (DRIVE_STORAGE_EXPOSURE === 'off') return false;
  return getDriveStorageEnabledFromUrl() || hasStoredDriveStorageFile();
}

function normalizeJsonValue(value, seen = new WeakSet()) {
  if (value === null) return null;

  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'boolean') return value;
  if (valueType === 'number') return Number.isFinite(value) ? value : null;
  if (valueType === 'bigint') throw new Error('JSON payload cannot contain BigInt values.');
  if (valueType === 'undefined' || valueType === 'function' || valueType === 'symbol') return undefined;

  if (typeof value.toJSON === 'function') {
    return normalizeJsonValue(value.toJSON(), seen);
  }

  if (seen.has(value)) throw new Error('JSON payload cannot contain circular references.');

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => {
        const normalized = normalizeJsonValue(item, seen);
        return normalized === undefined ? null : normalized;
      });
    }

    const normalizedObject = {};
    for (const key of Object.keys(value).sort()) {
      const normalizedProperty = normalizeJsonValue(value[key], seen);
      if (normalizedProperty !== undefined) normalizedObject[key] = normalizedProperty;
    }
    return normalizedObject;
  } finally {
    seen.delete(value);
  }
}

function stableJsonStringify(value) {
  const normalized = normalizeJsonValue(value);
  return normalized === undefined ? '' : JSON.stringify(normalized);
}

function jsonEqual(a, b) {
  return stableJsonStringify(a) === stableJsonStringify(b);
}

function normalizeSnapshotForSyncCompare(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return snapshot;
  const comparable = { ...snapshot };
  delete comparable.updatedAt;
  if (Array.isArray(comparable.trips)) {
    comparable.trips = comparable.trips.map(stripChecklistFromTripSnapshot);
  }
  return comparable;
}

function remoteSnapshotMatchesLocal(remotePayload, localSnapshot) {
  return jsonEqual(
    normalizeSnapshotForSyncCompare(remotePayload),
    normalizeSnapshotForSyncCompare(localSnapshot),
  );
}

function createSyncMergeError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function normalizeSchemaVersion(value) {
  return String(value ?? '').trim();
}

function isCompatibleAppSchemaVersion(value) {
  return COMPATIBLE_APP_SCHEMA_VERSIONS.has(normalizeSchemaVersion(value));
}

function getSnapshotSchemaVersion(snapshot) {
  return snapshot?.appSchemaVersion ?? snapshot?.schemaVersion ?? '';
}

function normalizeAppSnapshotForSync(snapshot, language = DEFAULT_LANGUAGE, source = 'remote') {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || !Array.isArray(snapshot.trips)) {
    throw createSyncMergeError('merge_invalid_snapshot', { source });
  }

  const version = getSnapshotSchemaVersion(snapshot);
  if (!isCompatibleAppSchemaVersion(version)) {
    throw createSyncMergeError('merge_schema_mismatch', { source, version: version || 'missing' });
  }

  const trips = snapshot.trips.map((trip, index) => {
    const normalizedTrip = normalizeTripSnapshot(trip, index);
    const tripDates = createTripDates(normalizedTrip.startDateStr, normalizedTrip.tripDays, language);
    return stripChecklistFromTripSnapshot({
      ...normalizedTrip,
      plans: Array.isArray(normalizedTrip.plans)
        ? normalizedTrip.plans.map((plan, planIndex) => normalizePlan(plan, planIndex, tripDates))
        : [],
      schedule: normalizeSchedule(normalizedTrip.schedule),
    });
  });

  if (!trips.length) throw createSyncMergeError('merge_invalid_snapshot', { source });

  const activeTripId = trips.some((trip) => trip.id === snapshot.activeTripId)
    ? snapshot.activeTripId
    : trips.find((trip) => !trip.archived)?.id || trips[0].id;
  const checklistText = normalizeChecklistText(snapshot.checklistText ?? snapshot.checklist ?? snapshot.packingList, '');
  const checklistGroups = parseChecklistText(checklistText, language);

  return {
    appSchemaVersion: APP_SCHEMA_VERSION,
    snapshotVersion: 1,
    activeTripId,
    trips: pruneEmptyTripDrafts(trips, activeTripId).map(stripChecklistFromTripSnapshot),
    checklistText,
    checklistState: reconcileChecklistStateForGroups(snapshot.checklistState || snapshot.checklistStatus || {}, checklistGroups),
  };
}

function mergeScalarValue(localValue, remoteValue, path) {
  if (jsonEqual(localValue, remoteValue)) return localValue;
  if (localValue === undefined || localValue === null || localValue === '') return remoteValue;
  if (remoteValue === undefined || remoteValue === null || remoteValue === '') return localValue;
  throw createSyncMergeError('merge_data_conflict', { path });
}

function mergeScheduleForSync(localSchedule, remoteSchedule, path) {
  const result = { ...remoteSchedule };
  Object.entries(localSchedule || {}).forEach(([dateId, localEntry]) => {
    const remoteEntry = result[dateId];
    if (!remoteEntry) {
      result[dateId] = localEntry;
      return;
    }
    if (!jsonEqual(localEntry, remoteEntry)) {
      throw createSyncMergeError('merge_data_conflict', { path: `${path}.schedule.${dateId}` });
    }
  });
  return normalizeSchedule(result);
}

function mergePlansForSync(localPlans, remotePlans, path) {
  const result = [];
  const localById = new Map((localPlans || []).map((plan) => [plan.id, plan]));
  const remoteById = new Map((remotePlans || []).map((plan) => [plan.id, plan]));
  const ids = [...new Set([...remoteById.keys(), ...localById.keys()])];

  ids.forEach((id) => {
    const localPlan = localById.get(id);
    const remotePlan = remoteById.get(id);
    if (!localPlan) {
      result.push(remotePlan);
      return;
    }
    if (!remotePlan) {
      result.push(localPlan);
      return;
    }
    if (!jsonEqual(localPlan, remotePlan)) {
      throw createSyncMergeError('merge_data_conflict', { path: `${path}.plans.${id}` });
    }
    result.push(localPlan);
  });

  return result;
}

function mergeLodgingsForSync(localLodgings, remoteLodgings, path) {
  const result = [];
  const localById = new Map((localLodgings || []).map((lodging) => [lodging.id, lodging]));
  const remoteById = new Map((remoteLodgings || []).map((lodging) => [lodging.id, lodging]));
  const ids = [...new Set([...remoteById.keys(), ...localById.keys()])];

  ids.forEach((id) => {
    const localLodging = localById.get(id);
    const remoteLodging = remoteById.get(id);
    if (!localLodging) {
      result.push(remoteLodging);
      return;
    }
    if (!remoteLodging) {
      result.push(localLodging);
      return;
    }
    if (!jsonEqual(localLodging, remoteLodging)) {
      throw createSyncMergeError('merge_data_conflict', { path: `${path}.lodgings.${id}` });
    }
    result.push(localLodging);
  });

  return result;
}

function mergeTripForSync(localTrip, remoteTrip) {
  if (jsonEqual(localTrip, remoteTrip)) return localTrip;
  const path = `trips.${localTrip.id}`;

  return {
    id: localTrip.id,
    name: mergeScalarValue(localTrip.name, remoteTrip.name, `${path}.name`),
    startDateStr: mergeScalarValue(localTrip.startDateStr, remoteTrip.startDateStr, `${path}.startDateStr`),
    tripDays: mergeScalarValue(localTrip.tripDays, remoteTrip.tripDays, `${path}.tripDays`),
    plans: mergePlansForSync(localTrip.plans, remoteTrip.plans, path),
    schedule: mergeScheduleForSync(localTrip.schedule, remoteTrip.schedule, path),
    lodgings: mergeLodgingsForSync(localTrip.lodgings, remoteTrip.lodgings, path),
    archived: mergeScalarValue(localTrip.archived, remoteTrip.archived, `${path}.archived`),
  };
}

function mergeTripsForSync(localTrips, remoteTrips) {
  const result = [];
  const localById = new Map(localTrips.map((trip) => [trip.id, trip]));
  const remoteById = new Map(remoteTrips.map((trip) => [trip.id, trip]));
  const ids = [...new Set([...remoteById.keys(), ...localById.keys()])];

  ids.forEach((id) => {
    const localTrip = localById.get(id);
    const remoteTrip = remoteById.get(id);
    if (!localTrip) {
      result.push(remoteTrip);
      return;
    }
    if (!remoteTrip) {
      result.push(localTrip);
      return;
    }
    result.push(mergeTripForSync(localTrip, remoteTrip));
  });

  return result;
}

function mergeAppSnapshots(localSnapshot, remoteSnapshot, language = DEFAULT_LANGUAGE) {
  const local = normalizeAppSnapshotForSync(localSnapshot, language, 'local');
  const remote = normalizeAppSnapshotForSync(remoteSnapshot, language, 'remote');

  if (jsonEqual(local, remote)) return local;

  const trips = mergeTripsForSync(local.trips, remote.trips);
  const activeTripId = trips.some((trip) => trip.id === local.activeTripId)
    ? local.activeTripId
    : trips.some((trip) => trip.id === remote.activeTripId)
      ? remote.activeTripId
      : trips.find((trip) => !trip.archived)?.id || trips[0]?.id;
  const checklist = mergeChecklistPayload(
    local.checklistText,
    local.checklistState,
    remote.checklistText,
    remote.checklistState,
    language,
  );

  if (checklist.conflicts.length) {
    throw createSyncMergeError('merge_data_conflict', { path: 'checklist' });
  }

  return normalizeAppSnapshotForSync({
    appSchemaVersion: APP_SCHEMA_VERSION,
    snapshotVersion: 1,
    activeTripId,
    trips,
    checklistText: checklist.checklistText,
    checklistState: checklist.checklistState,
  }, language, 'merged');
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

function getPlanBookingBadge(plan, language = DEFAULT_LANGUAGE) {
  const actionableBookings = toArray(plan?.bookings).filter((booking) => booking.status !== 'none');
  if (!actionableBookings.length) return null;

  const pendingBookings = actionableBookings.filter((booking) => booking.status !== 'done');
  if (pendingBookings.length) {
    return {
      status: 'pending',
      label: pendingBookings.length === 1
        ? getBookingTypeMeta(pendingBookings[0].type, language).pending
        : translate('bookingNeededBadge', language, { count: pendingBookings.length }),
    };
  }

  return {
    status: 'done',
    label: actionableBookings.length === 1
      ? getBookingTypeMeta(actionableBookings[0].type, language).done
      : translate('bookingDoneBadge', language),
  };
}

function getWeatherLabel(condition, language = DEFAULT_LANGUAGE) {
  return WEATHER_LABELS[normalizeLanguage(language)]?.[condition] || condition || translate('weatherUnknown', language);
}

function getWeatherStatusLabel(level, language = DEFAULT_LANGUAGE) {
  return WEATHER_STATUS_LABELS[normalizeLanguage(language)]?.[level] || level;
}

const WEATHER_ICON_SYMBOLS = {
  sunny: '晴',
  partly_cloudy: '多云',
  cloudy: '阴',
  drizzle: '小雨',
  rain: '雨',
  heavy_rain: '大雨',
  storm: '雷雨',
  fog: '雾',
  hot: '高温',
  cold: '低温',
  windy: '风',
  unknown: '?',
};

const WEATHER_ICON_PRIORITY = [
  'storm',
  'heavy_rain',
  'rain',
  'drizzle',
  'windy',
  'fog',
  'hot',
  'cold',
  'sunny',
  'partly_cloudy',
  'cloudy',
];

function getWeatherIconCondition(snapshot) {
  if (!snapshot) return 'unknown';
  if (Array.isArray(snapshot.entries) && snapshot.entries.length) {
    const conditions = snapshot.entries.map((entry) => getWeatherIconCondition(entry.snapshot));
    return WEATHER_ICON_PRIORITY.find((condition) => conditions.includes(condition)) || conditions[0] || 'unknown';
  }

  return snapshot.primary || 'unknown';
}

function WeatherIcon({ condition = 'unknown', level = 'unknown' }) {
  const normalizedCondition = WEATHER_ICON_SYMBOLS[condition] ? condition : 'unknown';

  return (
    <span className={`weather-icon condition-${normalizedCondition} level-${level}`} aria-hidden="true">
      {WEATHER_ICON_SYMBOLS[normalizedCondition]}
    </span>
  );
}

function getAiModeText(mode, language = DEFAULT_LANGUAGE) {
  return AI_PLANNER_MODE_TEXT[normalizeLanguage(language)]?.[mode] || AI_PLANNER_MODE_TEXT[DEFAULT_LANGUAGE][mode];
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
    旅行清单未完成: 'checklistIncomplete',
    住宿信息未填写: 'lodgingMissing',
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

const WEATHER_QUERY_CHAR_ALIASES = {
  长: '長',
  户: '戸',
  广: '広',
  岛: '島',
  滨: '浜',
  泽: '沢',
  龟: '亀',
  德: '徳',
  黑: '黒',
  乡: '郷',
  館: '館',
  阪: '阪',
};

const WEATHER_LOCATION_FALLBACKS = {
  大和郡山市: { weatherLabel: '大和郡山市', latitude: 34.6498, longitude: 135.7826, timezone: 'Asia/Tokyo' },
  箕面市: { weatherLabel: '箕面市', latitude: 34.8269, longitude: 135.4705, timezone: 'Asia/Tokyo' },
  京都市: { weatherLabel: '京都市', latitude: 35.0116, longitude: 135.7681, timezone: 'Asia/Tokyo' },
  京都市下京区: { weatherLabel: '京都市下京区', latitude: 34.9876, longitude: 135.7555, timezone: 'Asia/Tokyo' },
  大阪市: { weatherLabel: '大阪市', latitude: 34.6937, longitude: 135.5023, timezone: 'Asia/Tokyo' },
  大阪市北区: { weatherLabel: '大阪市北区', latitude: 34.7054, longitude: 135.4983, timezone: 'Asia/Tokyo' },
  河内長野市: { weatherLabel: '河内長野市', latitude: 34.4587, longitude: 135.5642, timezone: 'Asia/Tokyo' },
  kawachinagano: { weatherLabel: '河内長野市', latitude: 34.4587, longitude: 135.5642, timezone: 'Asia/Tokyo' },
  草津市: { weatherLabel: '草津市', latitude: 35.0131, longitude: 135.9598, timezone: 'Asia/Tokyo' },
  神戸市: { weatherLabel: '神戸市', latitude: 34.6901, longitude: 135.1955, timezone: 'Asia/Tokyo' },
  神戸市中央区: { weatherLabel: '神戸市中央区', latitude: 34.6951, longitude: 135.1979, timezone: 'Asia/Tokyo' },
  和歌山市: { weatherLabel: '和歌山市', latitude: 34.2305, longitude: 135.1708, timezone: 'Asia/Tokyo' },
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
      weather_rules: {
        best: ['sunny', 'partly_cloudy'],
        ok: ['cloudy'],
        blocked: ['rain', 'heavy_rain', 'storm', 'fog', 'windy'],
      },
      conflicts: ['lazy-beach'],
      reminders: [{ time: '前一晚', text: '确认日出时间、潮汐和云量，太晚睡就不要硬上' }],
      tips: ['早市现金和纸巾提前备好'],
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
      weather_rules: {
        best: ['partly_cloudy', 'cloudy'],
        ok: ['sunny'],
        blocked: ['rain', 'heavy_rain', 'hot', 'storm'],
      },
      conflicts: [],
      tips: ['信号山有坡，鞋子不舒服时直接跳过'],
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
      weather_rules: {
        best: ['cloudy', 'partly_cloudy', 'sunny'],
        ok: ['hot', 'drizzle'],
        blocked: ['heavy_rain', 'storm'],
      },
      conflicts: [],
      reminders: [{ time: '21:00', text: '控制收尾时间，第二天有早起计划就别拖太晚' }],
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
      weather_rules: {
        best: ['sunny', 'partly_cloudy'],
        ok: ['cloudy', 'hot'],
        blocked: ['rain', 'heavy_rain', 'storm', 'windy'],
      },
      conflicts: ['sunrise-sea'],
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
      weather_rules: {
        best: ['rain', 'drizzle', 'cold'],
        ok: ['cloudy', 'hot', 'heavy_rain'],
        blocked: [],
      },
      conflicts: [],
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
      weather_rules: {
        best: ['cloudy', 'rain', 'hot'],
        ok: ['sunny', 'partly_cloudy', 'drizzle'],
        blocked: ['heavy_rain', 'storm'],
      },
      conflicts: [],
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
    lodgings: [],
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
    lodgings: [],
    archived: false,
  };
}

function normalizeLodging(lodging, index = 0) {
  if (!lodging || typeof lodging !== 'object') return null;
  const name = lodging.name || lodging.title || lodging.hotel || lodging.label || `住宿 ${index + 1}`;
  const address = lodging.address || lodging.addr || lodging.full_address || lodging.location?.address || '';
  const location = normalizeLocation(lodging.location || {
    label: name,
    address,
  }, name);

  return {
    id: lodging.id || `lodging-${index + 1}`,
    name,
    location: {
      ...location,
      address: location.address || address,
    },
    checkIn: lodging.checkIn || lodging.check_in || lodging.startDate || lodging.start_date || lodging.from || '',
    checkOut: lodging.checkOut || lodging.check_out || lodging.endDate || lodging.end_date || lodging.to || '',
    note: lodging.note || lodging.description || '',
    bookingUrl: normalizeExternalLinkUrl(lodging.bookingUrl || lodging.booking_url || lodging.url),
    mapUrl: normalizeExternalLinkUrl(lodging.mapUrl || lodging.map_url),
  };
}

function normalizeTripLodgings(lodgings) {
  return toArray(lodgings)
    .map(normalizeLodging)
    .filter(Boolean);
}

function createLodgingId() {
  return `lodging-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function hasUsefulLodgingInfo(lodging) {
  if (!lodging || typeof lodging !== 'object') return false;
  const location = lodging.location || {};

  return [
    lodging.name,
    location.label,
    location.address,
    lodging.address,
  ].some((value) => String(value || '').trim());
}

function createLodgingEditorDraft(lodging = {}, index = 0, startDateStr = getTodayId(), endDateStr = startDateStr) {
  const location = lodging.location || {};

  return {
    id: lodging.id || createLodgingId(),
    name: lodging.name || lodging.title || lodging.hotel || location.label || '',
    checkIn: lodging.checkIn || lodging.check_in || lodging.startDate || lodging.start_date || startDateStr,
    checkOut: lodging.checkOut || lodging.check_out || lodging.endDate || lodging.end_date || endDateStr,
    address: lodging.address || location.address || '',
    note: lodging.note || lodging.description || '',
    order: index,
  };
}

function normalizeLodgingDrafts(drafts) {
  return drafts
    .map((draft, index) => ({
      id: draft.id || createLodgingId(),
      name: String(draft.name || '').trim(),
      location: {
        label: String(draft.name || '').trim(),
        address: String(draft.address || '').trim(),
      },
      checkIn: String(draft.checkIn || '').trim(),
      checkOut: String(draft.checkOut || '').trim(),
      note: String(draft.note || '').trim(),
      order: index,
    }))
    .filter(hasUsefulLodgingInfo)
    .map((lodging, index) => normalizeLodging(lodging, index))
    .filter(Boolean);
}

function normalizeTripSnapshot(trip, index = 0) {
  const startDate = trip.startDateStr || trip.startDate || getTodayId();
  const tripDays = clampTripDays(trip.tripDays || trip.days || DEFAULT_TRIP_DAYS);
  const tripDates = createTripDates(startDate, tripDays);

  return {
    id: trip.id || `trip-${index + 1}`,
    name: trip.name || trip.title || `旅行计划 ${index + 1}`,
    startDateStr: startDate,
    tripDays,
    plans: Array.isArray(trip.plans)
      ? trip.plans.map((plan, planIndex) => normalizePlan(plan, planIndex, tripDates))
      : [],
    schedule: normalizeSchedule(trip.schedule || {}),
    lodgings: normalizeTripLodgings(trip.lodgings || trip.hotels || trip.accommodations || trip.stays),
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
    return inferWeatherLabel(weatherLocation) || weatherLocation.query || weatherLocation.label || weatherLocation.name;
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

function normalizeCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeCountryCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  const countryMap = {
    JAPAN: 'JP',
    日本: 'JP',
    CHINA: 'CN',
    中国: 'CN',
    SOUTH_KOREA: 'KR',
    'SOUTH KOREA': 'KR',
    韩国: 'KR',
    韓國: 'KR',
    TAIWAN: 'TW',
    台湾: 'TW',
    臺灣: 'TW',
    THAILAND: 'TH',
    泰国: 'TH',
    SINGAPORE: 'SG',
    新加坡: 'SG',
  };

  if (/^[A-Z]{2}$/.test(normalized)) return normalized;
  return countryMap[normalized] || normalized;
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
    const latitude = normalizeCoordinate(
      weatherLocationObject?.latitude ?? weatherLocationObject?.lat ?? location.latitude ?? location.lat,
    );
    const longitude = normalizeCoordinate(
      weatherLocationObject?.longitude ?? weatherLocationObject?.lon ?? weatherLocationObject?.lng ?? location.longitude ?? location.lon ?? location.lng,
    );
    const countryCode = normalizeCountryCode(
      weatherLocationObject?.countryCode ||
        weatherLocationObject?.country_code ||
        weatherLocationObject?.country ||
        location.countryCode ||
        location.country_code ||
        location.country ||
        '',
    );
    const admin1 =
      weatherLocationObject?.admin1 ||
      weatherLocationObject?.prefecture ||
      weatherLocationObject?.province ||
      weatherLocationObject?.state ||
      location.admin1 ||
      location.prefecture ||
      location.province ||
      location.state ||
      '';
    const admin2 =
      weatherLocationObject?.admin2 ||
      weatherLocationObject?.county ||
      weatherLocationObject?.city ||
      location.admin2 ||
      location.county ||
      location.city ||
      '';
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
      latitude,
      longitude,
      countryCode,
      admin1,
      admin2,
      address: location.address || location.addr || location.full_address || '',
    };
  }

  return { label: area || '待定地点', query: area || '', address: '' };
}

function hasCoordinates(location) {
  return normalizeCoordinate(location.latitude) !== undefined && normalizeCoordinate(location.longitude) !== undefined;
}

function getWeatherLocationKey(location) {
  if (hasCoordinates(location)) return `${normalizeCoordinate(location.latitude)},${normalizeCoordinate(location.longitude)}`;
  if (location.query) return location.query;
  return location.label;
}

function getWeatherLocationLabel(location) {
  return location.weatherLabel || location.weather_label || location.city || location.district || location.area || location.query || location.label;
}

function normalizeWeatherSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, '')
    .replace(/[，、,].*$/, '')
    .replace(/[區]/g, '区')
    .replace(/[県]/g, '県')
    .replace(/[长户广岛滨泽龟德黑乡]/g, (char) => WEATHER_QUERY_CHAR_ALIASES[char] || char);
}

function getCountryNameFromCode(countryCode) {
  const normalized = String(countryCode || '').trim().toUpperCase();
  if (normalized === 'JP') return 'Japan';
  if (normalized === 'CN') return 'China';
  if (normalized === 'KR') return 'South Korea';
  if (normalized === 'TW') return 'Taiwan';
  if (normalized === 'TH') return 'Thailand';
  if (normalized === 'SG') return 'Singapore';
  return normalized;
}

function expandWeatherSearchTerm(term, location = {}) {
  const value = String(term || '').trim();
  if (!value) return [];

  const countryName = getCountryNameFromCode(location.countryCode);
  const variants = [
    value,
    value.split(',')[0],
  ];

  if (location.admin1) {
    variants.push(`${value}, ${location.admin1}`);
    if (countryName) variants.push(`${value}, ${location.admin1}, ${countryName}`);
  }

  if (countryName) variants.push(`${value}, ${countryName}`);

  const normalized = normalizeWeatherSearchText(value);
  if (normalized && normalized !== value) variants.push(normalized);

  return variants;
}

function getWeatherSearchTerms(location) {
  const label = getWeatherLocationLabel(location);
  const rawTerms = uniq([
    location.query,
    label,
    location.admin2,
    location.admin1 && label ? `${label}, ${location.admin1}` : '',
    location.admin1 && location.countryCode ? `${label}, ${location.admin1}, ${getCountryNameFromCode(location.countryCode)}` : '',
    location.address,
    location.query?.split(',')[0],
  ]).filter(Boolean);

  const terms = [];
  rawTerms.forEach((term) => {
    const normalized = normalizeWeatherSearchText(term);
    terms.push(...expandWeatherSearchTerm(term, location), normalized);

    const cityMatch = normalized.match(/^(.+?市).+区$/);
    if (cityMatch) terms.push(cityMatch[1]);

    if (normalized.endsWith('市')) terms.push(normalized.slice(0, -1));
  });

  return uniq(terms);
}

function getWeatherLocationFallback(location) {
  const terms = getWeatherSearchTerms(location);
  const matchedTerm = terms.find((term) => WEATHER_LOCATION_FALLBACKS[normalizeWeatherSearchText(term)]);
  if (!matchedTerm) return null;

  const fallback = WEATHER_LOCATION_FALLBACKS[normalizeWeatherSearchText(matchedTerm)];
  return {
    ...location,
    ...fallback,
    query: fallback.weatherLabel,
    weatherLabel: getWeatherLocationLabel(location) || fallback.weatherLabel,
  };
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

function normalizeStopTransfer(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const duration = value.trim();
    return duration ? { departAt: '', arriveAt: '', duration, mode: '', note: '' } : null;
  }

  if (typeof value !== 'object') return null;
  const duration = String(value.duration || value.time || value.travel_time || value.travelTime || '').trim();
  const mode = String(value.mode || value.method || value.transport || '').trim();
  const note = String(value.note || value.description || value.detail || '').trim();
  const departAt = String(
    value.depart_at || value.departAt || value.departure || value.depart || value.departure_at || value.departureAt || value.departure_time || value.departureTime || value.start_at || value.startAt || value.start_time || value.startTime || '',
  ).trim();
  const arriveAt = String(
    value.arrive_at || value.arriveAt || value.arrival || value.arrive || value.arrival_at || value.arrivalAt || value.arrival_time || value.arrivalTime || value.end_at || value.endAt || value.end_time || value.endTime || '',
  ).trim();
  if (!duration && !mode && !note && !departAt && !arriveAt) return null;
  return { departAt, arriveAt, duration, mode, note };
}

function formatStopTransfer(transfer) {
  if (!transfer) return '';
  return [transfer.mode, transfer.duration].filter(Boolean).join(' · ');
}

function normalizeNumericText(value) {
  return String(value || '').replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0));
}

function parseClockTime(value) {
  const match = normalizeNumericText(value).match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 47 || minutes > 59) return null;
  return (hours % 24) * 60 + minutes;
}

function formatClockTime(totalMinutes) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseDurationMinutes(value) {
  const text = normalizeNumericText(value).toLowerCase();
  if (!text.trim()) return null;

  let total = 0;
  let matched = false;
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(小时|小時|時間|hours?|hrs?|hr|h)/i);
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*(分钟|分鐘|分|min(?:ute)?s?|m)/i);

  if (hourMatch) {
    total += Number(hourMatch[1]) * 60;
    matched = true;
  }

  if (minuteMatch) {
    total += Number(minuteMatch[1]);
    matched = true;
  }

  if (!matched) {
    const plainNumber = text.match(/\d+(?:\.\d+)?/);
    if (plainNumber) {
      total = Number(plainNumber[0]);
      matched = true;
    }
  }

  return matched && Number.isFinite(total) && total > 0 ? total : null;
}

function formatStopTransferDeparture(transfer, fallbackArriveAt = '', language = DEFAULT_LANGUAGE) {
  if (!transfer) return '';
  const departAt = transfer.departAt || '';
  if (departAt) return departAt;

  const arriveAt = transfer.arriveAt || fallbackArriveAt;
  const arriveMinutes = parseClockTime(arriveAt);
  const durationMinutes = parseDurationMinutes(transfer.duration);
  if (arriveMinutes === null || durationMinutes === null) return '';

  const estimatedTime = formatClockTime(arriveMinutes - durationMinutes);
  return language === 'en' ? `~ ${estimatedTime}` : `约 ${estimatedTime}`;
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
          transferFromPrevious: null,
          openingHours: '',
          weatherRelevant: true,
        };
      }

      const location = normalizeStopLocation(stop.location || stop.place || fallbackLocation, fallbackLocation);
      const time = stop.time || stop.time_window || stop.window || (stop.start && stop.end ? `${stop.start}-${stop.end}` : stop.start || '');
      const transferFromPrevious = normalizeStopTransfer(
        stop.transfer_from_previous || stop.transferFromPrevious || stop.transfer || stop.travel_from_previous || stop.travelFromPrevious,
      );
      const openingHours = String(stop.opening_hours || stop.openingHours || stop.business_hours || stop.businessHours || stop.hours || '').trim();

      return {
        id: stop.id || `stop-${index + 1}`,
        time,
        title: stop.title || stop.name || location.label,
        location,
        note: stop.note || stop.description || '',
        transferFromPrevious,
        openingHours,
        weatherRelevant: stop.weather_relevant !== false && stop.weatherRelevant !== false,
      };
    });
}

const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi;
const MARKDOWN_LINK_EXTRACT_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/i;
const BARE_URL_PATTERN = /https?:\/\/[^\s)）\]]+/gi;
const BARE_URL_EXTRACT_PATTERN = /https?:\/\/[^\s)）\]]+/i;
const URL_TRAILING_PUNCTUATION_PATTERN = /[.,，。；;!！?？、)）\]]+$/;

function normalizeHttpUrlToken(value, allowSearchUnwrap = true) {
  const raw = String(value || '').trim().replace(URL_TRAILING_PUNCTUATION_PATTERN, '');
  if (!raw) return '';

  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';

    if (allowSearchUnwrap && /(^|\.)google\./i.test(url.hostname)) {
      const searchTarget = url.searchParams.get('q') || url.searchParams.get('url');
      const normalizedSearchTarget = normalizeHttpUrlToken(searchTarget, false);
      if (normalizedSearchTarget) return normalizedSearchTarget;
    }

    return url.toString();
  } catch {
    return '';
  }
}

function normalizeExternalLinkUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const markdownMatch = raw.match(MARKDOWN_LINK_EXTRACT_PATTERN);
  if (markdownMatch) {
    return normalizeHttpUrlToken(markdownMatch[1]) || normalizeHttpUrlToken(markdownMatch[2]);
  }

  return normalizeHttpUrlToken(raw) || normalizeHttpUrlToken(raw.match(BARE_URL_EXTRACT_PATTERN)?.[0]);
}

function getExternalLinkFallbackLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function normalizeReminderLinkLabel(label, url) {
  const text = String(label || '').trim();
  if (!text || /^https?:\/\//i.test(text)) return getExternalLinkFallbackLabel(url);
  return text;
}

function collectReminderLinksFromText(text) {
  const links = [];
  const seen = new Set();
  const addLink = (label, url) => {
    const normalizedUrl = normalizeExternalLinkUrl(url);
    if (!normalizedUrl || seen.has(normalizedUrl)) return;
    seen.add(normalizedUrl);
    links.push({
      label: normalizeReminderLinkLabel(label, normalizedUrl),
      url: normalizedUrl,
    });
  };

  String(text || '').replace(MARKDOWN_LINK_PATTERN, (_, label, url) => {
    addLink(label, url);
    return '';
  });
  String(text || '').replace(BARE_URL_PATTERN, (url) => {
    addLink('', url);
    return '';
  });

  return links;
}

function stripLinksFromReminderText(text) {
  return String(text || '')
    .replace(MARKDOWN_LINK_PATTERN, (_, label, url) => (normalizeExternalLinkUrl(url) ? label : ''))
    .replace(BARE_URL_PATTERN, '')
    .replace(/（\s*）/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([，。；、,.!?])/g, '$1')
    .trim();
}

function normalizeReminderLinks(item, text) {
  const source = item && typeof item === 'object' ? item : {};
  const explicitLinks = [
    ...toArray(source.links),
    ...toArray(source.urls),
    ...toArray(source.url || source.link),
  ];
  const seen = new Set();

  return [
    ...explicitLinks.map((link) => {
      if (typeof link === 'string') {
        const url = normalizeExternalLinkUrl(link);
        return url ? { label: getExternalLinkFallbackLabel(url), url } : null;
      }

      const url = normalizeExternalLinkUrl(link.url || link.href || link.link);
      if (!url) return null;

      return {
        label: normalizeReminderLinkLabel(link.label || link.title || link.name, url),
        url,
      };
    }).filter(Boolean),
    ...collectReminderLinksFromText(text),
  ].filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

function normalizePlanReminders(value) {
  return toArray(value)
    .map((item, index) => {
      const rawText = typeof item === 'string' ? item : item.text || item.title || item.note || item.description || '';
      const links = normalizeReminderLinks(item, rawText);
      const text = stripLinksFromReminderText(rawText) || links[0]?.label || rawText;

      if (typeof item === 'string') {
        return { id: `reminder-${index + 1}`, time: '', text, links };
      }

      return {
        id: item.id || `reminder-${index + 1}`,
        time: item.time || item.at || '',
        text,
        links,
      };
    })
    .filter((item) => item.text || item.links.length);
}

function normalizePlanTips(value) {
  return toArray(value)
    .map((item) => (typeof item === 'string' ? item : item.text || item.title || item.note || item.description || ''))
    .filter(Boolean);
}

function normalizeBookingType(value) {
  const type = String(value || '').toLowerCase();
  if (['restaurant_reservation', 'restaurant', 'dining', 'meal', 'food', '餐厅', '餐厅预约', '饭店', '食事'].includes(type)) {
    return 'restaurant_reservation';
  }
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
    url: normalizeExternalLinkUrl(item.url || item.link || item.booking_url || item.bookingUrl || item.reserve_url || item.reserveUrl),
    cancelUrl: normalizeExternalLinkUrl(item.cancel_url || item.cancelUrl || item.refund_url || item.refundUrl || item.manage_url || item.manageUrl),
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
    const rawBest = toArray(plan.weather_rules.best);
    const rawOk = toArray(plan.weather_rules.ok);
    return {
      best: rawBest.filter((item) => !SEVERE_WEATHER.includes(item)),
      ok: uniq([...rawOk, ...rawBest.filter((item) => item === 'heavy_rain')]).filter((item) => !HARD_BLOCKED_WEATHER.includes(item)),
      blocked: uniq([...toArray(plan.weather_rules.blocked), ...HARD_BLOCKED_WEATHER]),
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
    weather_rules: normalizeWeatherRules(plan),
    conflicts: toArray(plan.conflicts || plan.mutually_exclusive_with),
    reminders: normalizePlanReminders(plan.reminders || plan.special_reminders || plan.alerts),
    tips: normalizePlanTips(plan.tips || plan.hints),
    bookings: normalizePlanBookings(plan),
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

function isUntouchedExampleChecklist(text, state) {
  const normalizedText = normalizeChecklistText(text, '');
  const normalizedExample = normalizeChecklistText(EXAMPLE_CHECKLIST_TEXT, '');
  return normalizedText === normalizedExample && Object.keys(normalizeChecklistState(state)).length === 0;
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

function reconcileChecklistStateForGroups(state, groups) {
  const validItemIds = new Set(groups.flatMap((group) => group.items.map((item) => item.id)));
  return Object.fromEntries(
    Object.entries(normalizeChecklistState(state))
      .filter(([itemId]) => validItemIds.has(itemId)),
  );
}

function serializeChecklistGroups(groups) {
  return groups
    .map((group) => [
      `# ${group.title}`,
      ...group.items.map((item) => item.text),
    ].join('\n'))
    .join('\n\n')
    .trim();
}

function countChecklistTexts(groups) {
  const counts = new Map();
  groups.forEach((group) => {
    group.items.forEach((item) => {
      counts.set(item.text, (counts.get(item.text) || 0) + 1);
    });
  });
  return counts;
}

function parseChecklistImportPayload(input, language = DEFAULT_LANGUAGE) {
  let parsed;

  try {
    parsed = parseImportJson(input);
  } catch {
    parsed = { checklistText: input };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    parsed = { checklistText: String(parsed || '') };
  }

  const checklistSource = Object.hasOwn(parsed, 'checklistText')
    ? parsed.checklistText
    : parsed.checklist || parsed.packingList || parsed.text || '';
  const checklistText = normalizeChecklistText(checklistSource, '');
  if (!checklistText) throw new Error(translate('checklistImportEmpty', language));

  const groups = parseChecklistText(checklistText, language);
  return {
    checklistText,
    checklistState: reconcileChecklistStateForGroups(parsed.checklistState || parsed.checklistStatus || {}, groups),
    groups,
  };
}

function mergeChecklistPayload(currentText, currentState, incomingText, incomingState, language = DEFAULT_LANGUAGE) {
  const currentGroups = parseChecklistText(currentText, language);
  const incomingGroups = parseChecklistText(incomingText, language);
  const incomingCounts = countChecklistTexts(incomingGroups);
  const resultGroups = currentGroups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item })),
  }));
  const resultState = reconcileChecklistStateForGroups(currentState, resultGroups);
  const conflicts = [];

  const groupById = new Map(resultGroups.map((group) => [group.id, group]));
  const itemById = new Map();
  const itemsByText = new Map();

  const indexResultItem = (group, item) => {
    itemById.set(item.id, { group, item });
    const items = itemsByText.get(item.text) || [];
    items.push({ group, item });
    itemsByText.set(item.text, items);
  };

  resultGroups.forEach((group) => {
    group.items.forEach((item) => indexResultItem(group, item));
  });

  const ensureGroup = (incomingGroup) => {
    const existing = groupById.get(incomingGroup.id);
    if (existing) return existing;

    const nextGroup = { id: incomingGroup.id, title: incomingGroup.title, items: [] };
    resultGroups.push(nextGroup);
    groupById.set(nextGroup.id, nextGroup);
    return nextGroup;
  };

  const applyIncomingStatus = (target, incomingStatus, incomingGroup) => {
    if (!incomingStatus) return;

    const currentStatus = resultState[target.item.id];
    if (currentStatus && currentStatus !== incomingStatus) {
      conflicts.push({
        type: 'status',
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
      const incomingStatus = incomingState[incomingItem.id];
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
            type: 'category',
            text: incomingItem.text,
            currentGroup: target.group.title,
            incomingGroup: incomingGroup.title,
          });
        }
        applyIncomingStatus(target, incomingStatus, incomingGroup);
        return;
      }

      if (sameTextTargets.length > 1 || incomingCounts.get(incomingItem.text) > 1) {
        conflicts.push({
          type: 'duplicate',
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

function isEmptyTripDraft(trip) {
  return (!Array.isArray(trip?.plans) || trip.plans.length === 0)
    && (!Array.isArray(trip?.lodgings) || trip.lodgings.length === 0);
}

function pruneEmptyTripDrafts(tripList, activeTripId) {
  return tripList.filter((trip) => !isEmptyTripDraft(trip) || trip.id === activeTripId);
}

function stripChecklistFromTripSnapshot(trip) {
  const nextTrip = { ...trip };
  delete nextTrip.checklistText;
  delete nextTrip.checklistState;
  delete nextTrip.checklist;
  delete nextTrip.checklistStatus;
  delete nextTrip.packingList;
  delete nextTrip.weatherData;
  return nextTrip;
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
  const loadedTrips = isCompatibleAppSchemaVersion(currentVersion) && Array.isArray(storedTrips) && storedTrips.length > 0
    ? storedTrips.map(normalizeTripSnapshot)
    : [createEmptyTripSnapshot('新旅行计划', getTodayId(), 'trip-default')];

  const requestedActiveTripId = localStorage.getItem(STORAGE_KEYS.currentTrip) || loadedTrips[0].id;
  const visibleLoadedTrips = loadedTrips.filter((trip) => !trip.archived);
  const loadedActiveTrip = visibleLoadedTrips.find((trip) => trip.id === requestedActiveTripId) || visibleLoadedTrips[0] || loadedTrips[0];
  const trips = pruneEmptyTripDrafts(loadedTrips, loadedActiveTrip.id);
  const visibleTrips = trips.filter((trip) => !trip.archived);
  const activeTrip = visibleTrips.find((trip) => trip.id === loadedActiveTrip.id) || visibleTrips[0] || trips[0];
  const storedChecklistText = localStorage.getItem(STORAGE_KEYS.checklistText);
  const storedChecklistState = safeJsonRead(STORAGE_KEYS.checklistState, null);
  const storedWeatherCache = safeJsonRead(STORAGE_KEYS.weatherCache, {});
  const loadedChecklistText = storedChecklistText ?? activeTrip.checklistText;
  const loadedChecklistState = storedChecklistState ?? activeTrip.checklistState;
  const nextChecklistText = isUntouchedExampleChecklist(loadedChecklistText, loadedChecklistState)
    ? ''
    : normalizeChecklistText(loadedChecklistText);
  const nextChecklistGroups = parseChecklistText(nextChecklistText, DEFAULT_LANGUAGE);
  const nextChecklistState = reconcileChecklistStateForGroups(
    loadedChecklistState,
    nextChecklistGroups,
  );

  return {
    trips,
    activeTripId: activeTrip.id,
    tripName: activeTrip.name,
    startDate: activeTrip.startDateStr,
    tripDays: activeTrip.tripDays,
    plans: activeTrip.plans,
    schedule: activeTrip.schedule,
    lodgings: activeTrip.lodgings || [],
    selectedDate: getSmartSelectedDate(activeTrip.startDateStr, activeTrip.tripDays),
    weatherData: storedWeatherCache && typeof storedWeatherCache === 'object' && !Array.isArray(storedWeatherCache)
      ? storedWeatherCache
      : {},
    checklistText: nextChecklistText,
    checklistState: nextChecklistState,
  };
}

function parseImportJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1].trim() : trimmed);
}

function getSinglePlanPayload(parsed) {
  if (Array.isArray(parsed?.plans)) return parsed.plans[0] || null;
  if (parsed?.plan && typeof parsed.plan === 'object' && !Array.isArray(parsed.plan)) return parsed.plan;
  return parsed;
}

async function readImportFileText(file) {
  if (!file) return '';
  return file.text();
}

function formatWeatherMetrics(primary, tempMin, tempMax, precipitationProbability, windMax, language = DEFAULT_LANGUAGE) {
  return `${getWeatherLabel(primary, language)} ${formatWeatherDataMetrics(tempMin, tempMax, precipitationProbability, windMax, language)}`;
}

function formatWeatherDataMetrics(tempMin, tempMax, precipitationProbability, windMax, language = DEFAULT_LANGUAGE) {
  const precipLabel = language === 'en' ? 'Rain ' : '降水';
  const windLabel = language === 'en' ? 'Wind ' : '风';
  return `${Math.round(tempMin)}-${Math.round(tempMax)}°C / ${precipLabel}${Math.round(precipitationProbability || 0)}% / ${windLabel}${Math.round(windMax || 0)}km/h`;
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

function formatWeatherDataSummary(snapshot, language = DEFAULT_LANGUAGE) {
  if (!snapshot) return '';
  if (Array.isArray(snapshot.entries) && snapshot.entries.length) {
    return snapshot.entries
      .map((entry) => `${getWeatherLocationLabel(entry.location)} ${formatWeatherDataSummary(entry.snapshot, language)}`)
      .join(language === 'en' ? '; ' : '；');
  }

  if (Number.isFinite(snapshot.tempMin) && Number.isFinite(snapshot.tempMax)) {
    return formatWeatherDataMetrics(snapshot.tempMin, snapshot.tempMax, snapshot.precipitationProbability, snapshot.windMax, language);
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

  const precipitationSum = Number.isFinite(day.precipitationSum) ? day.precipitationSum : 0;
  const precipitationProbability = Number.isFinite(day.precipitationProbability) ? day.precipitationProbability : 0;
  const categories = new Set([classifyWeatherCode(day.weatherCode)]);
  if (day.tempMax >= 32 || day.apparentMax >= 34) categories.add('hot');
  if (day.tempMin <= 5 || day.apparentMin <= 3) categories.add('cold');
  if (day.windMax >= 35) categories.add('windy');
  if (precipitationSum >= 12) categories.add('heavy_rain');
  if (precipitationSum > 0 && precipitationSum < 4 && precipitationProbability >= RAIN_PROBABILITY_NOTICE) categories.add('drizzle');
  if (precipitationSum >= 4 && precipitationSum < 12) categories.add('rain');
  if (precipitationProbability >= RAIN_PROBABILITY_HIGH && !categories.has('heavy_rain')) categories.add('rain');

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
    precipitationProbability: Math.round(precipitationProbability),
    windMax: Math.round(day.windMax || 0),
    summary: formatWeatherMetrics(primary, day.tempMin, day.tempMax, precipitationProbability, day.windMax),
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

function getSnapshotPrecipitationProbability(snapshot) {
  if (!snapshot) return 0;
  if (snapshot.entries?.length) {
    return Math.max(...snapshot.entries.map((entry) => getSnapshotPrecipitationProbability(entry.snapshot)));
  }
  return Number.isFinite(snapshot.precipitationProbability) ? snapshot.precipitationProbability : 0;
}

function getRainRisk(snapshot) {
  const categories = snapshot?.categories || [];
  const precipitationProbability = getSnapshotPrecipitationProbability(snapshot);
  const hasSoftRain = categories.some((category) => SOFT_RAIN_WEATHER.includes(category));

  if (categories.includes('storm') || categories.includes('heavy_rain')) return 'severe';
  if (!hasSoftRain && precipitationProbability < RAIN_PROBABILITY_HIGH) return 'none';
  if (precipitationProbability >= RAIN_PROBABILITY_BLOCK) return 'high';
  if (precipitationProbability >= RAIN_PROBABILITY_NOTICE) return 'notice';
  return hasSoftRain ? 'low' : 'none';
}

function includesAnyKeyword(text, keywords) {
  const normalized = String(text || '').toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function getPlanWeatherExposure(plan) {
  const headlineText = [plan.name, plan.description].join(' ');
  const detailText = [...plan.tips, ...plan.stops.flatMap((stop) => [stop.title, stop.note, stop.location.label])].join(' ');
  const stopTexts = plan.stops.map((stop) => [stop.title, stop.note, stop.location.label].join(' '));
  const outdoorScore = (
    (includesAnyKeyword(headlineText, OUTDOOR_HINTS) ? 3 : 0) +
    stopTexts.filter((text) => includesAnyKeyword(text, OUTDOOR_HINTS)).length +
    plan.stops.filter((stop) => stop.weatherRelevant).length
  );
  const indoorScore = (
    (includesAnyKeyword(headlineText, INDOOR_HINTS) ? 2 : 0) +
    (includesAnyKeyword(detailText, INDOOR_HINTS) ? 1 : 0) +
    stopTexts.filter((text) => includesAnyKeyword(text, INDOOR_HINTS)).length
  );

  if (outdoorScore >= indoorScore + 1) return 'outdoor';
  if (indoorScore >= outdoorScore + 2) return 'indoor';
  return 'mixed';
}

function evaluateWeather(plan, dateId, weatherData, language = DEFAULT_LANGUAGE) {
  const snapshot = getPlanWeatherSnapshot(plan, dateId, weatherData);
  if (!snapshot) return { level: 'unknown', label: getWeatherStatusLabel('unknown', language), snapshot: null };

  const categories = snapshot.categories;
  const { best, ok, blocked } = plan.weather_rules;
  const exposure = getPlanWeatherExposure(plan);
  const rainRisk = getRainRisk(snapshot);
  const hasHardWeather = categories.some((category) => HARD_BLOCKED_WEATHER.includes(category));
  const hasSevereWeather = categories.some((category) => SEVERE_WEATHER.includes(category));
  const hasSoftRainRuleBlock = categories.some((category) => SOFT_RAIN_WEATHER.includes(category) && blocked.includes(category));
  const hasStrictRuleBlock = categories.some((category) => (
    !SOFT_RAIN_WEATHER.includes(category) &&
    !SEVERE_WEATHER.includes(category) &&
    blocked.includes(category)
  ));

  if ((hasSevereWeather || rainRisk === 'severe') && exposure === 'outdoor') {
    return { level: 'blocked', label: getWeatherStatusLabel('blocked', language), snapshot };
  }

  if ((hasSevereWeather || rainRisk === 'severe') && exposure === 'indoor') {
    return { level: 'ok', label: getWeatherStatusLabel('ok', language), snapshot };
  }

  if ((hasHardWeather || hasSevereWeather || rainRisk === 'severe') && exposure === 'mixed') {
    return { level: 'mismatch', label: getWeatherStatusLabel('mismatch', language), snapshot };
  }

  if (rainRisk === 'high' && exposure === 'outdoor') {
    return { level: 'blocked', label: getWeatherStatusLabel('blocked', language), snapshot };
  }

  if (rainRisk === 'high' && exposure === 'mixed') {
    return { level: 'mismatch', label: getWeatherStatusLabel('mismatch', language), snapshot };
  }

  if (rainRisk === 'notice' && exposure !== 'indoor') {
    return { level: 'mismatch', label: getWeatherStatusLabel('mismatch', language), snapshot };
  }

  if (hasSoftRainRuleBlock && rainRisk === 'high' && exposure !== 'indoor') {
    return { level: exposure === 'outdoor' ? 'blocked' : 'mismatch', label: getWeatherStatusLabel(exposure === 'outdoor' ? 'blocked' : 'mismatch', language), snapshot };
  }

  if ((hasStrictRuleBlock || hasSoftRainRuleBlock) && exposure === 'indoor') {
    return { level: 'ok', label: getWeatherStatusLabel('ok', language), snapshot };
  }

  if (hasStrictRuleBlock && exposure !== 'indoor') {
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
  const weatherText = weather.snapshot ? formatWeatherDataSummary(weather.snapshot, language) : translate('noWeather', language);
  const weatherCondition = getWeatherIconCondition(weather.snapshot);

  return {
    level: isCritical ? 'critical' : hasHardIssue ? 'danger' : weather.level,
    label: hasHardIssue ? translate('adjustRecommended', language) : '',
    weatherText,
    weatherCondition,
    riskText: issues[0] ? translateIssue(issues[0], language) : (weather.level === 'mismatch' ? translate('weatherNotIdeal', language) : weather.level === 'unknown' ? translate('confirmWeather', language) : ''),
    riskTone: issues.length ? 'danger' : weather.level === 'mismatch' || weather.level === 'unknown' ? 'notice' : '',
    issueCount: issues.length,
  };
}

function getCalendarDayState(plan, insight, language = DEFAULT_LANGUAGE) {
  if (!plan) return { key: 'empty', label: '', ariaLabel: translate('assignedAriaEmpty', language) };

  if (insight.issueCount > 0 || ['danger', 'critical'].includes(insight.level)) {
    return { key: 'adjust', label: translate('adjust', language), ariaLabel: translate('assignedAriaAdjust', language) };
  }

  if (['blocked', 'unknown', 'mismatch'].includes(insight.level)) {
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

function getScheduledRiskLevel(plan, title) {
  if (plan.priority === 'must') return 'critical';
  if (['天气不合适', '当天不可用', '日期不合适', '和其他安排冲突'].includes(title)) {
    return 'critical';
  }
  return 'warning';
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

      const title = getScheduledRiskTitle(issues);

      return {
        plan,
        dateId,
        level: getScheduledRiskLevel(plan, title),
        title,
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
  const dateOrder = new Map(tripDates.map((date, index) => [date.id, index]));
  const groupsByTitle = new Map();

  riskItems.forEach((risk, inputOrder) => {
    const title = getRiskGroupTitle(risk.title);
    const existing = groupsByTitle.get(title) || {
      title,
      level: risk.level,
      items: [],
      unit: risk.dateId ? '天' : '项',
    };

    if (levelRank[risk.level] > levelRank[existing.level]) existing.level = risk.level;
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
        }, new Map()).values(),
      )
        .sort((a, b) => {
          const dateDiff = a.sortIndex - b.sortIndex;
          if (dateDiff) return dateDiff;
          return a.inputOrder - b.inputOrder;
        })
        .map((item) => item.label),
    }))
    .sort((a, b) => {
      const levelDiff = levelRank[b.level] - levelRank[a.level];
      if (levelDiff) return levelDiff;
      return b.items.length - a.items.length;
    });
}

function buildChecklistRiskGroup(groups, state, language = DEFAULT_LANGUAGE) {
  const pendingItems = groups.flatMap((group) =>
    group.items
      .filter((item) => {
        const status = state[item.id] || CHECKLIST_STATUS.todo;
        return status !== CHECKLIST_STATUS.done && status !== CHECKLIST_STATUS.skipped;
      })
      .map((item) => (
        language === 'en' ? `${group.title}: ${item.text}` : `${group.title} · ${item.text}`
      )),
  );

  if (!pendingItems.length) return null;

  return {
    title: '旅行清单未完成',
    level: 'warning',
    items: pendingItems,
    unit: '项',
  };
}

function buildLodgingRiskGroup(lodgings, hasTripContent, language = DEFAULT_LANGUAGE) {
  const hasLodgings = Array.isArray(lodgings) && lodgings.some(hasUsefulLodgingInfo);
  if (hasLodgings || !hasTripContent) return null;

  return {
    title: '住宿信息未填写',
    level: 'warning',
    items: [translate('lodgingMissingHelp', language)],
    unit: '项',
  };
}

function getWeatherOverviewGroup(condition) {
  if (condition === 'sunny' || condition === 'partly_cloudy') return 'clear';
  if (condition === 'drizzle' || condition === 'rain' || condition === 'heavy_rain') return 'rain';
  if (condition === 'storm') return 'storm';
  if (condition === 'cloudy') return 'cloudy';
  if (condition === 'hot') return 'hot';
  if (condition === 'cold') return 'cold';
  if (condition === 'fog') return 'fog';
  if (condition === 'windy') return 'wind';
  return 'unknown';
}

function formatWeatherOverviewPart(group, rows, language = DEFAULT_LANGUAGE) {
  const count = rows.length;
  const dayLabels = rows.map((row) => `D${row.date.dayNumber}`);
  const shouldListDays = count <= 3 || ['rain', 'storm', 'hot', 'cold', 'fog', 'wind', 'unknown'].includes(group);

  if (language === 'en') {
    const labels = {
      clear: 'clear/cloudy',
      cloudy: 'overcast',
      rain: 'rain',
      storm: 'storm',
      hot: 'hot',
      cold: 'cold',
      fog: 'fog',
      wind: 'windy',
      unknown: 'unknown',
    };
    if (shouldListDays) return `${dayLabels.join(', ')} ${labels[group] || group}`;
    return `${count} ${count === 1 ? 'day' : 'days'} ${labels[group] || group}`;
  }

  const labels = {
    clear: '晴/多云',
    cloudy: '阴天',
    rain: '有雨',
    storm: '雷雨',
    hot: '高温',
    cold: '低温',
    fog: '有雾',
    wind: '风大',
    unknown: '待确认',
  };
  if (shouldListDays) return `${dayLabels.join('、')} ${labels[group] || group}`;
  return `${count} 天${labels[group] || group}`;
}

function formatWeatherOverviewStatus(rows, language = DEFAULT_LANGUAGE) {
  const suitable = rows.filter((row) => row.level === 'best' || row.level === 'ok').length;
  const notice = rows.filter((row) => row.level === 'mismatch').length;
  const blocked = rows.filter((row) => row.level === 'blocked').length;
  const unknown = rows.filter((row) => row.level === 'unknown').length;

  if (language === 'en') {
    return [
      suitable ? `${suitable} usable` : '',
      notice ? `${notice} not ideal` : '',
      blocked ? `${blocked} unsuitable` : '',
      unknown ? `${unknown} unknown` : '',
    ].filter(Boolean).join(', ');
  }

  return [
    suitable ? `${suitable} 天可用` : '',
    notice ? `${notice} 天一般` : '',
    blocked ? `${blocked} 天不合适` : '',
    unknown ? `${unknown} 天待确认` : '',
  ].filter(Boolean).join('，');
}

function buildWeatherOverview(tripDates, schedule, plansById, weatherData, language = DEFAULT_LANGUAGE) {
  const scheduledRows = tripDates
    .map((date) => {
      const plan = plansById.get(schedule[date.id]?.planId);
      if (!plan) return null;
      const weather = evaluateWeather(plan, date.id, weatherData, language);
      const condition = getWeatherIconCondition(weather.snapshot);
      return {
        date,
        plan,
        level: weather.level,
        condition,
        snapshot: weather.snapshot,
        metrics: weather.snapshot ? formatWeatherDataSummary(weather.snapshot, language) : translate('noWeather', language),
      };
    })
    .filter(Boolean);

  if (!scheduledRows.length) {
    return {
      summary: language === 'en'
        ? 'No scheduled days yet. Weather overview will appear after days are assigned.'
        : '还没有已安排日期，安排后会按地点生成天气概览。',
    };
  }

  const rowsWithWeather = scheduledRows.filter((row) => row.snapshot);
  if (!rowsWithWeather.length) {
    return {
      summary: language === 'en'
        ? `${scheduledRows.length}/${tripDates.length} days scheduled. No weather fetched yet.`
        : `已排 ${scheduledRows.length}/${tripDates.length} 天，尚未获取天气。`,
    };
  }

  const groupRows = rowsWithWeather.reduce((rowsByGroup, row) => {
    const group = getWeatherOverviewGroup(row.condition);
    rowsByGroup.set(group, [...(rowsByGroup.get(group) || []), row]);
    return rowsByGroup;
  }, new Map());
  const conditionSummary = ['clear', 'cloudy', 'rain', 'storm', 'hot', 'cold', 'fog', 'wind', 'unknown']
    .map((group) => {
      const rows = groupRows.get(group);
      return rows?.length ? formatWeatherOverviewPart(group, rows, language) : '';
    })
    .filter(Boolean)
    .join(language === 'en' ? ', ' : '，');
  const statusSummary = formatWeatherOverviewStatus(scheduledRows, language);
  const summary = language === 'en'
    ? `${scheduledRows.length}/${tripDates.length} days scheduled: ${conditionSummary || 'weather available'}.${statusSummary ? ` ${statusSummary}.` : ''}`
    : `已排 ${scheduledRows.length}/${tripDates.length} 天：${conditionSummary || '已获取天气'}。${statusSummary ? `${statusSummary}。` : ''}`;

  return { summary };
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

async function translateWeatherSearchTerm(term) {
  const normalizedTerm = normalizeWeatherSearchText(term);
  if (!normalizedTerm || !Array.from(normalizedTerm).some((char) => char.charCodeAt(0) > 127)) return [];
  if (weatherTranslationCache.has(normalizedTerm)) return weatherTranslationCache.get(normalizedTerm);

  const translatedTerms = [];
  const languagePairs = ['zh|en', 'ja|en'];

  for (const langpair of languagePairs) {
    try {
      const translateUrl = new URL('https://api.mymemory.translated.net/get');
      translateUrl.searchParams.set('q', normalizedTerm);
      translateUrl.searchParams.set('langpair', langpair);
      const data = await fetchJson(translateUrl, `地点翻译：${normalizedTerm}`);
      const translated = data?.responseData?.translatedText?.trim();
      if (translated && translated !== normalizedTerm && !translated.includes('MYMEMORY')) {
        translatedTerms.push(translated);
      }
    } catch {
      // Translation is only a fallback; keep the weather update path non-blocking.
    }
  }

  const result = uniq(translatedTerms);
  weatherTranslationCache.set(normalizedTerm, result);
  return result;
}

function scoreGeocodeResult(result, term, location = {}) {
  const normalizedTerm = normalizeWeatherSearchText(term);
  const name = normalizeWeatherSearchText(result.name);
  const admin1 = normalizeWeatherSearchText(result.admin1);
  const admin2 = normalizeWeatherSearchText(result.admin2 || result.admin3);
  const countryCode = String(location.countryCode || '').trim().toUpperCase();
  let score = 0;

  if (name && normalizedTerm) {
    if (name === normalizedTerm) score += 90;
    else if (normalizedTerm.includes(name) || name.includes(normalizedTerm)) score += 55;
  }

  if (countryCode) {
    score += String(result.country_code || '').toUpperCase() === countryCode ? 80 : -80;
  }

  if (location.admin1) {
    const expectedAdmin1 = normalizeWeatherSearchText(location.admin1);
    if (expectedAdmin1 && admin1) {
      if (admin1 === expectedAdmin1) score += 55;
      else if (admin1.includes(expectedAdmin1) || expectedAdmin1.includes(admin1)) score += 30;
    }
  }

  if (location.admin2) {
    const expectedAdmin2 = normalizeWeatherSearchText(location.admin2);
    if (expectedAdmin2 && admin2) {
      if (admin2 === expectedAdmin2) score += 35;
      else if (admin2.includes(expectedAdmin2) || expectedAdmin2.includes(admin2)) score += 18;
    }
  }

  return score;
}

async function geocodeWeatherSearchTerms(searchTerms, resolvedLabel, location = {}) {
  const languages = uniq(['zh', 'ja', 'en']);
  let best = null;

  for (const term of searchTerms) {
    if (!String(term || '').trim()) continue;
    for (const geoLanguage of languages) {
      const geoUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
      geoUrl.searchParams.set('name', term);
      geoUrl.searchParams.set('count', '10');
      geoUrl.searchParams.set('language', geoLanguage);
      geoUrl.searchParams.set('format', 'json');
      const countryCode = String(location.countryCode || '').trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(countryCode)) {
        geoUrl.searchParams.set('countryCode', countryCode);
      }
      const geoData = await fetchJson(geoUrl, `地点查询：${resolvedLabel}`);
      const results = geoData.results || [];
      results.forEach((result) => {
        const score = scoreGeocodeResult(result, term, location);
        if (!best || score > best.score) {
          best = { result, score };
        }
      });

      if (best?.score >= 135) return best.result;
    }
  }

  return best && best.score >= 20 ? best.result : null;
}

async function fetchWeatherForLocation(location, startDateStr, endDate) {
  let resolved = location;
  if (!hasCoordinates(resolved)) {
    const resolvedLabel = getWeatherLocationLabel(resolved);
    const searchTerms = getWeatherSearchTerms(resolved);
    let first = null;
    let geocodeError = null;

    try {
      first = await geocodeWeatherSearchTerms(searchTerms, resolvedLabel, resolved);

      if (!first) {
        const translatedTerms = [];
        for (const term of searchTerms.slice(0, 3)) {
          translatedTerms.push(...await translateWeatherSearchTerm(term));
        }
        first = await geocodeWeatherSearchTerms(uniq(translatedTerms), resolvedLabel, resolved);
      }
    } catch (error) {
      geocodeError = error;
    }

    if (first) {
      resolved = {
        ...resolved,
        weatherLabel: resolved.weatherLabel || `${first.name}${first.admin1 ? `, ${first.admin1}` : ''}`,
        latitude: first.latitude,
        longitude: first.longitude,
        timezone: first.timezone,
        countryCode: resolved.countryCode || first.country_code,
        admin1: resolved.admin1 || first.admin1,
        admin2: resolved.admin2 || first.admin2,
      };
    } else {
      const fallback = getWeatherLocationFallback(resolved);
      if (fallback) {
        resolved = fallback;
      } else if (geocodeError) {
        throw geocodeError;
      } else {
        throw new Error(`找不到地点：${resolvedLabel}`);
      }
    }
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
      "location": { "label": "Display location", "address": "Detailed address, optional", "weather_location": { "query": "City/Ward, Prefecture, Country for weather lookup", "country_code": "JP", "admin1": "Prefecture/state", "latitude": "", "longitude": "" } },
      "stops": [
        {
          "time": "09:30",
          "title": "Stop title",
          "location": { "label": "Specific place", "address": "Detailed address, optional", "weather_location": { "query": "City/Ward, Prefecture, Country; empty if same as plan location", "country_code": "JP", "admin1": "Prefecture/state", "latitude": "", "longitude": "" } },
          "transfer_from_previous": { "depart_at": "09:00", "duration": "About 20 min", "mode": "walk | transit | train | bus | taxi | car | sightseeing_walk", "note": "Default to walk for normal point-to-point walking. Use sightseeing_walk only when the walk itself is a planned scenic activity." },
          "opening_hours": "Only the opening/business hours relevant to the planned arrival time, e.g. 10:00-17:00; leave empty if unknown or unreliable",
          "note": "What happens at this stop",
          "weather_relevant": true
        }
      ],
      "available_dates": ["YYYY-MM-DD"],
      "closed_dates": ["YYYY-MM-DD"],
      "weather_rules": {
        "best": ["sunny", "partly_cloudy"],
        "ok": ["cloudy", "drizzle"],
        "blocked": ["heavy_rain", "storm"]
      },
      "conflicts": ["other_plan_id"],
      "bookings": [
        {
          "id": "booking_id",
          "type": "reservation | ticket | confirmation | restaurant_reservation",
          "title": "Reservation/ticket item",
          "status": "pending | done | none",
          "address": "Service or arrival address",
          "url": "Reservation or booking link, optional",
          "cancel_url": "Cancellation/change/manage link, optional",
          "note": "Lead time, ID requirements, cancellation rules, restaurant reservation or queue notes, etc."
        }
      ],
      "reminders": [{"time": "HH:mm or text time", "text": "Important reminder", "links": [{"label": "Official site", "url": "https://example.com"}]}],
      "tips": ["General tip"],
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
      "location": { "label": "地点展示名", "address": "详细地址，可空", "weather_location": { "query": "天气查询用行政地点，例如 Kawachi-Nagano, Osaka, Japan", "country_code": "JP", "admin1": "都道府县/省州", "latitude": "", "longitude": "" } },
      "stops": [
        {
          "time": "09:30",
          "title": "节点标题",
          "location": { "label": "具体地点", "address": "详细地址，可空", "weather_location": { "query": "跨城或不同区县时填写行政地点；同计划地点可留空", "country_code": "JP", "admin1": "都道府县/省州", "latitude": "", "longitude": "" } },
          "transfer_from_previous": { "depart_at": "09:00", "duration": "约 20 分钟", "mode": "步行 | 地铁 | 电车 | 巴士 | 出租车 | 自驾 | 游玩型步行", "note": "普通点到点步行默认写步行。只有这段步行本身就是独立观景/逛街/散步项目时，才写游玩型步行。" },
          "opening_hours": "只写和计划到达时间相关的开放/营业时间，例如 10:00-17:00；不确定或不可靠时留空",
          "note": "这个节点做什么",
          "weather_relevant": true
        }
      ],
      "available_dates": ["YYYY-MM-DD"],
      "closed_dates": ["YYYY-MM-DD"],
      "weather_rules": {
        "best": ["sunny", "partly_cloudy"],
        "ok": ["cloudy", "drizzle"],
        "blocked": ["heavy_rain", "storm"]
      },
      "conflicts": ["other_plan_id"],
      "bookings": [
        {
          "id": "booking_id",
          "type": "reservation | ticket | confirmation | restaurant_reservation",
          "title": "需要预约/订票的项目",
          "status": "pending | done | none",
          "address": "办理或到达地址",
          "url": "预约或订票链接，可空",
          "cancel_url": "退订/改签/管理链接，可空",
          "note": "提前多久、证件要求、退改规则、餐厅预约或排队说明等"
        }
      ],
      "reminders": [{"time": "HH:mm 或文字时间", "text": "必须注意的事项", "links": [{"label": "官网", "url": "https://example.com"}]}],
      "tips": ["普通提示"],
      "assigned_day": "YYYY-MM-DD"
    }
  ]
}`;
}

function getSinglePlanJsonSchema(language = DEFAULT_LANGUAGE) {
  if (language === 'en') {
    return `{
  "id": "unique_plan_id",
  "name": "Short title",
  "description": "What to do",
  "priority": "must | preferred | backup | optional",
  "location": { "label": "Display place", "address": "", "weather_location": { "query": "City/Ward, Prefecture, Country", "country_code": "JP", "admin1": "Prefecture/state", "latitude": "", "longitude": "" } },
  "stops": [{ "time": "09:30", "title": "Stop", "location": { "label": "Place", "address": "", "weather_location": { "query": "", "country_code": "", "admin1": "", "latitude": "", "longitude": "" } }, "transfer_from_previous": { "depart_at": "", "duration": "", "mode": "walk | transit | train | bus | taxi | car | sightseeing_walk", "note": "" }, "opening_hours": "", "note": "", "weather_relevant": true }],
  "available_dates": ["YYYY-MM-DD"],
  "closed_dates": ["YYYY-MM-DD"],
  "weather_rules": {
    "best": ["sunny", "partly_cloudy"],
    "ok": ["cloudy", "drizzle"],
    "blocked": ["heavy_rain", "storm"]
  },
  "conflicts": ["other_plan_id"],
  "bookings": [{ "id": "booking_id", "type": "reservation | ticket | confirmation | restaurant_reservation", "title": "", "status": "pending | done | none", "address": "", "url": "", "cancel_url": "", "note": "" }],
  "reminders": [{ "time": "", "text": "", "links": [{ "label": "", "url": "" }] }],
  "tips": [],
  "assigned_day": "YYYY-MM-DD"
}`;
  }

  return `{
  "id": "unique_plan_id",
  "name": "短标题",
  "description": "当天做什么",
  "priority": "must | preferred | backup | optional",
  "location": { "label": "地点展示名", "address": "", "weather_location": { "query": "行政地点，例如 Kawachi-Nagano, Osaka, Japan", "country_code": "JP", "admin1": "都道府县/省州", "latitude": "", "longitude": "" } },
  "stops": [{ "time": "09:30", "title": "节点标题", "location": { "label": "具体地点", "address": "", "weather_location": { "query": "", "country_code": "", "admin1": "", "latitude": "", "longitude": "" } }, "transfer_from_previous": { "depart_at": "", "duration": "", "mode": "步行 | 地铁 | 电车 | 巴士 | 出租车 | 自驾 | 游玩型步行", "note": "" }, "opening_hours": "", "note": "", "weather_relevant": true }],
  "available_dates": ["YYYY-MM-DD"],
  "closed_dates": ["YYYY-MM-DD"],
  "weather_rules": {
    "best": ["sunny", "partly_cloudy"],
    "ok": ["cloudy", "drizzle"],
    "blocked": ["heavy_rain", "storm"]
  },
  "conflicts": ["other_plan_id"],
  "bookings": [{ "id": "booking_id", "type": "reservation | ticket | confirmation | restaurant_reservation", "title": "", "status": "pending | done | none", "address": "", "url": "", "cancel_url": "", "note": "" }],
  "reminders": [{ "time": "", "text": "", "links": [{ "label": "", "url": "" }] }],
  "tips": [],
  "assigned_day": "YYYY-MM-DD"
}`;
}

function pruneEmptyAiValue(value) {
  if (Array.isArray(value)) {
    const items = value
      .map(pruneEmptyAiValue)
      .filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, pruneEmptyAiValue(item)])
      .filter(([, item]) => item !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  if (value === '' || value === null || value === undefined) return undefined;
  return value;
}

function compactLocationForAi(location) {
  if (!location) return undefined;

  return pruneEmptyAiValue({
    label: location.label,
    address: location.address,
    weather_location: {
      query: location.query || getWeatherLocationLabel(location),
      country_code: location.countryCode,
      admin1: location.admin1,
      admin2: location.admin2,
      latitude: location.latitude,
      longitude: location.longitude,
    },
  });
}

function compactLodgingForAi(lodging) {
  if (!lodging) return undefined;

  return pruneEmptyAiValue({
    id: lodging.id,
    name: lodging.name,
    location: {
      label: lodging.location?.label || lodging.name,
      address: lodging.location?.address,
    },
    check_in: lodging.checkIn,
    check_out: lodging.checkOut,
    note: lodging.note,
    booking_url: lodging.bookingUrl,
    map_url: lodging.mapUrl,
  });
}

function compactTransferForAi(transfer) {
  if (!transfer) return undefined;

  return pruneEmptyAiValue({
    depart_at: transfer.departAt,
    mode: transfer.mode,
    duration: transfer.duration,
    note: transfer.note,
  });
}

function getLodgingContextForDate(lodgings, dateId) {
  const checkoutFrom = lodgings.filter((lodging) => lodging.checkOut === dateId).map(compactLodgingForAi);
  const checkinTo = lodgings.filter((lodging) => lodging.checkIn === dateId).map(compactLodgingForAi);
  const stayingNight = lodgings
    .filter((lodging) => lodging.checkIn && lodging.checkOut && lodging.checkIn <= dateId && dateId < lodging.checkOut)
    .map(compactLodgingForAi);

  return pruneEmptyAiValue({
    checkout_from: checkoutFrom,
    checkin_to: checkinTo,
    staying_night: stayingNight,
  });
}

function compactPlanForAi(plan, assignedDay) {
  if (!plan) return null;

  return pruneEmptyAiValue({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    priority: plan.priority,
    location: compactLocationForAi(plan.location),
    stops: plan.stops.map((stop) => ({
      time: stop.time,
      title: stop.title,
      location: compactLocationForAi(stop.location),
      transfer_from_previous: compactTransferForAi(stop.transferFromPrevious),
      opening_hours: stop.openingHours,
      note: stop.note,
      weather_relevant: stop.weatherRelevant,
    })),
    available_dates: plan.available_dates,
    closed_dates: plan.closed_dates,
    weather_rules: plan.weather_rules,
    conflicts: plan.conflicts,
    bookings: plan.bookings.map((booking) => ({
      id: booking.id,
      type: booking.type,
      title: booking.title,
      status: booking.status,
      address: booking.address,
      url: booking.url,
      cancel_url: booking.cancelUrl,
      note: booking.note,
    })),
    reminders: plan.reminders.map((item) => ({ time: item.time, text: item.text, links: item.links || [] })),
    tips: plan.tips,
    assigned_day: assignedDay,
  });
}

function sanitizeFileNamePart(value, fallback = 'plan-gacha') {
  const normalized = String(value || fallback)
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);

  return normalized || fallback;
}

function getReadableStyleText() {
  let cssText = '';
  Array.from(document.styleSheets || []).forEach((sheet) => {
    try {
      Array.from(sheet.cssRules || []).forEach((rule) => {
        cssText += `${rule.cssText}\n`;
      });
    } catch {
      // Cross-origin stylesheets cannot be read; the app's own stylesheet is enough for export.
    }
  });

  const rootStyle = window.getComputedStyle(document.documentElement);
  const cssVariables = Array.from(rootStyle)
    .filter((name) => name.startsWith('--'))
    .map((name) => `${name}: ${rootStyle.getPropertyValue(name)};`)
    .join('\n');

  return `
    :root,
    .screenshot-export-shell {
      ${cssVariables}
      color: ${rootStyle.getPropertyValue('--text') || '#18181b'};
      font-family: ${rootStyle.fontFamily || 'system-ui, sans-serif'};
    }
    * { box-sizing: border-box; }
    [data-screenshot-exclude="true"] { display: none !important; }
    .screenshot-export-shell {
      width: 100%;
      min-height: 100%;
      padding: 24px;
      background: ${rootStyle.getPropertyValue('--canvas') || '#f8f9fa'};
    }
    .screenshot-export-card {
      width: 100% !important;
      margin: 0 !important;
    }
    ${cssText}
  `;
}

function blobFromDataUrl(dataUrl) {
  const [header, data] = dataUrl.split(',');
  const mimeType = header.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
  const binary = atob(data || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

async function canvasToPngBlob(canvas) {
  const blob = await new Promise((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/png');
  });

  if (blob) return blob;
  return blobFromDataUrl(canvas.toDataURL('image/png'));
}

async function renderElementToImageBlob(element) {
  if (!element) throw new Error('missing_element');

  const rect = element.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  if (!width) throw new Error('empty_element');

  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => {});
  }

  const clone = element.cloneNode(true);
  clone.querySelectorAll('[data-screenshot-exclude="true"], .stop-location-actions').forEach((node) => node.remove());
  clone.classList.add('screenshot-export-card');
  clone.style.width = `${width}px`;

  const measureHost = document.createElement('div');
  measureHost.style.position = 'fixed';
  measureHost.style.left = '-10000px';
  measureHost.style.top = '0';
  measureHost.style.width = `${width}px`;
  measureHost.style.pointerEvents = 'none';
  measureHost.appendChild(clone);
  document.body.appendChild(measureHost);

  const height = Math.ceil(clone.getBoundingClientRect().height);
  const cloneMarkup = clone.outerHTML;
  measureHost.remove();
  if (!height) throw new Error('empty_element');

  const padding = 24;
  const svgWidth = width + padding * 2;
  const svgHeight = height + padding * 2;
  const shell = document.createElement('div');
  shell.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  shell.className = 'screenshot-export-shell';
  shell.innerHTML = `<style>${getReadableStyleText()}</style>${cloneMarkup}`;
  const xhtml = new XMLSerializer().serializeToString(shell);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
      <foreignObject x="0" y="0" width="${svgWidth}" height="${svgHeight}">
        ${xhtml}
      </foreignObject>
    </svg>
  `;
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('svg_image_load_failed'));
      image.src = url;
    });

    const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(svgWidth * scale);
    canvas.height = Math.round(svgHeight * scale);
    const context = canvas.getContext('2d');
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, svgWidth, svgHeight);

    const pngBlob = await canvasToPngBlob(canvas);
    return { blob: pngBlob, extension: 'png', mimeType: 'image/png' };
  } catch (error) {
    console.warn('[plan-gacha] PNG export failed, falling back to SVG image.', error);
    return { blob: svgBlob, extension: 'svg', mimeType: 'image/svg+xml' };
  }
}

function shouldUseNativeImageShare() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const isTouchPrimary = window.matchMedia?.('(pointer: coarse)').matches;
  return Boolean(navigator.share && (navigator.maxTouchPoints > 0 || isTouchPrimary));
}

async function copyImageBlobToClipboard(blob) {
  if (
    blob?.type !== 'image/png'
    || typeof ClipboardItem !== 'function'
    || !navigator.clipboard?.write
  ) {
    return false;
  }

  try {
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type]: blob }),
    ]);
    return true;
  } catch (error) {
    console.warn('[plan-gacha] Image clipboard write failed, falling back to download/share.', error);
    return false;
  }
}

function getLocationSearchText(location) {
  if (!location) return '';
  const label = location.label || '';
  const address = location.address || '';
  const weatherLocation = location.weatherLocation || location.weather_location || location.weatherLabel || '';
  return [address, label].filter(Boolean).join(' ') || weatherLocation;
}

function getLocationCopyText(location) {
  if (!location) return '';
  return [location.label, location.address].filter(Boolean).join('\n') || getLocationSearchText(location);
}

function getGoogleMapsUrl(location) {
  const query = getLocationSearchText(location);
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '';
}

function getGoogleMapsDirectionsUrl(origin, destination) {
  const originText = getLocationSearchText(origin);
  const destinationText = getLocationSearchText(destination);
  if (!originText || !destinationText) return '';
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originText)}&destination=${encodeURIComponent(destinationText)}&travelmode=transit`;
}

function Icon({ name, className = '' }) {
  const commonProps = {
    className: `svg-icon ${className}`.trim(),
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  };

  const paths = {
    check: (
      <path d="M20 6 9 17l-5-5" />
    ),
    camera: (
      <>
        <path d="M14.5 4h-5L8 6H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3Z" />
        <circle cx="12" cy="12.5" r="3.2" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    listChecks: (
      <>
        <path d="m3 7 2 2 4-4" />
        <path d="m3 17 2 2 4-4" />
        <path d="M13 6h8" />
        <path d="M13 18h8" />
      </>
    ),
    pencil: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </>
    ),
    copy: (
      <>
        <rect width="14" height="14" x="8" y="8" rx="2" />
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
      </>
    ),
    mapPin: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
    route: (
      <>
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="6" r="2" />
        <path d="M8 18h3a3 3 0 0 0 0-6h2a3 3 0 0 0 3-3V8" />
      </>
    ),
    home: (
      <>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    refresh: (
      <>
        <path d="M21 12a9 9 0 0 1-15.2 6.5" />
        <path d="M3 12A9 9 0 0 1 18.2 5.5" />
        <path d="M18 3v4h-4" />
        <path d="M6 21v-4h4" />
      </>
    ),
    cloud: (
      <>
        <path d="M17.5 19H8a5 5 0 1 1 1.4-9.8A7 7 0 0 1 22 13.5 4.5 4.5 0 0 1 17.5 19Z" />
        <path d="m12 13 2 2 4-4" />
      </>
    ),
    sparkles: (
      <>
        <path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8Z" />
        <path d="m19 15 .8 1.7L21.5 18l-1.7.8L19 20.5l-.8-1.7-1.7-.8 1.7-.8Z" />
        <path d="m5 14 .7 1.5L7.2 16l-1.5.7L5 18.2l-.7-1.5L2.8 16l1.5-.7Z" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v5" />
        <path d="M14 11v5" />
      </>
    ),
    x: (
      <>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </>
    ),
  };

  return <svg {...commonProps}>{paths[name] || paths.plus}</svg>;
}

function BufferedTripNameField({ value, t, onCommit }) {
  const [draft, setDraft] = useState(value || '');

  const commitDraft = () => {
    if (draft !== value) onCommit(draft);
  };

  return (
    <label className="trip-name-field">
      <span>{t('planName')}</span>
      <input
        className="input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function PlanRawJsonEditor({ value, t, onChange }) {
  return (
    <div className="plan-raw-json-editor">
      <div className="panel-header compact">
        <div>
          <h3>{t('rawPlanJsonTitle')}</h3>
          <p>{t('rawPlanJsonHelp')}</p>
        </div>
      </div>
      <textarea
        className="textarea plan-raw-json"
        value={value}
        spellCheck={false}
        placeholder={t('rawPlanJsonPlaceholder')}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

const PlanEditorPreview = memo(function PlanEditorPreview({
  isCreatingPlan,
  editorPlan,
  t,
  renderPlanStops,
  renderPlanBookings,
  renderPlanNotes,
}) {
  return (
    <section className="plan-editor-preview">
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
    </section>
  );
});

function PlanEditorDetail({
  isCreatingPlan,
  editorPlan,
  initialDraftJson,
  t,
  onBack,
  onCopyPrompt,
  onApplyDraft,
  renderPlanStops,
  renderPlanBookings,
  renderPlanNotes,
}) {
  const [planEditorMode, setPlanEditorMode] = useState('ai');
  const [questionDraft, setQuestionDraft] = useState('');
  const [manualDraftJson, setManualDraftJson] = useState(initialDraftJson || '');
  const [aiDraftJson, setAiDraftJson] = useState('');
  const hasAiDraft = aiDraftJson.trim().length > 0;
  const effectiveDraftJson = hasAiDraft ? aiDraftJson : manualDraftJson;

  const updateEffectiveDraftJson = (nextDraft) => {
    if (hasAiDraft) {
      setAiDraftJson(nextDraft);
    } else {
      setManualDraftJson(nextDraft);
    }
  };

  return (
    <div className="plan-editor-detail">
      <button className="btn btn-small btn-outline plan-back-btn" type="button" onClick={onBack}>
        {t('backToList')}
      </button>

      <div className="plan-editor-split">
        <PlanEditorPreview
          isCreatingPlan={isCreatingPlan}
          editorPlan={editorPlan}
          t={t}
          renderPlanStops={renderPlanStops}
          renderPlanBookings={renderPlanBookings}
          renderPlanNotes={renderPlanNotes}
        />

        <section className="plan-editor-workspace">
          <div className="plan-editor-mode">
            <span>{t('editMode')}</span>
            <div className="editor-tabs plan-editor-mode-tabs" role="tablist" aria-label={t('editSinglePlan')}>
              <button
                className={planEditorMode === 'ai' ? 'is-active' : ''}
                type="button"
                role="tab"
                aria-selected={planEditorMode === 'ai'}
                onClick={() => setPlanEditorMode('ai')}
              >
                {t('aiEditTab')}
              </button>
              <button
                className={planEditorMode === 'json' ? 'is-active' : ''}
                type="button"
                role="tab"
                aria-selected={planEditorMode === 'json'}
                onClick={() => setPlanEditorMode('json')}
              >
                {t('rawJsonTab')}
              </button>
            </div>
          </div>

          <div className="plan-editor-ai-pane" hidden={planEditorMode !== 'ai'}>
            <label className="plan-ai-question-field">
              <span>{t('yourRequest')}</span>
              <textarea
                className="textarea plan-ai-question"
                value={questionDraft}
                placeholder={isCreatingPlan ? t('newPlanPlaceholder') : t('editPlanPlaceholder')}
                onChange={(event) => setQuestionDraft(event.target.value)}
              />
            </label>
            <div className="plan-ai-copy-row">
              <button className="btn btn-outline" type="button" onClick={() => onCopyPrompt(questionDraft)}>
                {t('copyToAi')}
              </button>
            </div>

            <label>
              <span>{t('aiResult')}</span>
              <textarea
                className="textarea plan-ai-result"
                value={aiDraftJson}
                placeholder={t('planAiResultPlaceholder')}
                spellCheck={false}
                onChange={(event) => setAiDraftJson(event.target.value)}
              />
            </label>
          </div>

          <div className="plan-editor-manual-pane" hidden={planEditorMode !== 'json'}>
            <PlanRawJsonEditor
              value={effectiveDraftJson}
              t={t}
              onChange={updateEffectiveDraftJson}
            />
          </div>
          <div className="modal-actions plan-editor-actions">
            <button className="btn btn-primary" type="button" onClick={() => onApplyDraft(effectiveDraftJson)}>
              {t('applyPlanDraft')}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function LodgingEditor({ lodgings, startDateStr, endDateStr, t, onSave }) {
  const [drafts, setDrafts] = useState(() => (
    lodgings.length
      ? lodgings.map((lodging, index) => createLodgingEditorDraft(lodging, index, startDateStr, endDateStr))
      : []
  ));

  const addDraft = () => {
    setDrafts((current) => [
      ...current,
      createLodgingEditorDraft({}, current.length, startDateStr, endDateStr),
    ]);
  };

  const updateDraft = (id, field, value) => {
    setDrafts((current) => current.map((draft) => (
      draft.id === id ? { ...draft, [field]: value } : draft
    )));
  };

  const removeDraft = (id) => {
    setDrafts((current) => current.filter((draft) => draft.id !== id));
  };

  const saveDrafts = () => {
    onSave(normalizeLodgingDrafts(drafts));
  };

  return (
    <div className="lodging-editor">
      <div className="lodging-editor-head">
        <div>
          <h3>{t('lodgingSection')}</h3>
          <p>{t('lodgingSectionHelp')}</p>
        </div>
        <button className="btn btn-small btn-outline" type="button" onClick={addDraft}>
          {t('addLodging')}
        </button>
      </div>

      {drafts.length === 0 ? (
        <div className="lodging-empty">
          <strong>{t('lodgingEmpty')}</strong>
          <span>{t('lodgingEmptyHelp')}</span>
        </div>
      ) : (
        <div className="lodging-list">
          {drafts.map((draft) => (
            <div className="lodging-row" key={draft.id}>
              <div className="lodging-row-main">
                <label>
                  <span>{t('lodgingNameLabel')}</span>
                  <input
                    className="input"
                    value={draft.name}
                    onChange={(event) => updateDraft(draft.id, 'name', event.target.value)}
                  />
                </label>
                <label>
                  <span>{t('lodgingAddressLabel')}</span>
                  <input
                    className="input"
                    value={draft.address}
                    onChange={(event) => updateDraft(draft.id, 'address', event.target.value)}
                  />
                </label>
              </div>
              <div className="lodging-row-meta">
                <label>
                  <span>{t('lodgingCheckIn')}</span>
                  <input
                    className="input"
                    type="date"
                    value={draft.checkIn}
                    onChange={(event) => updateDraft(draft.id, 'checkIn', event.target.value)}
                  />
                </label>
                <label>
                  <span>{t('lodgingCheckOut')}</span>
                  <input
                    className="input"
                    type="date"
                    min={draft.checkIn || startDateStr}
                    value={draft.checkOut}
                    onChange={(event) => updateDraft(draft.id, 'checkOut', event.target.value)}
                  />
                </label>
              </div>
              <div className="lodging-row-footer">
                <label>
                  <span>{t('lodgingNote')}</span>
                  <input
                    className="input"
                    value={draft.note}
                    onChange={(event) => updateDraft(draft.id, 'note', event.target.value)}
                  />
                </label>
                <button
                  className="icon-btn compact-icon-btn danger-icon-btn"
                  type="button"
                  onClick={() => removeDraft(draft.id)}
                  aria-label={t('delete')}
                  title={t('delete')}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="modal-actions lodging-actions">
        <button className="btn btn-primary" type="button" onClick={saveDrafts}>
          {t('saveLodgings')}
        </button>
      </div>
    </div>
  );
}

function App() {
  const { i18n } = useTranslation();
  const [, startUiTransition] = useTransition();
  const [language, setLanguage] = useState(() => normalizeLanguage(i18n.language || getInitialLanguage()));
  const [initial] = useState(loadInitialState);
  const [trips, setTrips] = useState(initial.trips);
  const [activeTripId, setActiveTripId] = useState(initial.activeTripId);
  const [tripName, setTripName] = useState(initial.tripName);
  const [startDateStr, setStartDateStr] = useState(initial.startDate);
  const [tripDays, setTripDays] = useState(initial.tripDays);
  const [plans, setPlans] = useState(initial.plans);
  const [schedule, setSchedule] = useState(initial.schedule);
  const [lodgings, setLodgings] = useState(initial.lodgings);
  const [selectedDateId, setSelectedDateId] = useState(initial.selectedDate);
  const [weatherData, setWeatherData] = useState(initial.weatherData);
  const [checklistText, setChecklistText] = useState(initial.checklistText);
  const [checklistState, setChecklistState] = useState(initial.checklistState);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistEditing, setChecklistEditing] = useState(false);
  const [checklistImportOpen, setChecklistImportOpen] = useState(false);
  const [checklistImportText, setChecklistImportText] = useState('');
  const [checklistImportConflicts, setChecklistImportConflicts] = useState([]);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPlanId, setEditorPlanId] = useState(null);
  const [editorTab, setEditorTab] = useState('itinerary');
  const [batchAiOpen, setBatchAiOpen] = useState(false);
  const [aiPlannerOpen, setAiPlannerOpen] = useState(false);
  const [aiPlannerMode, setAiPlannerMode] = useState('replan');
  const [tripMenuOpen, setTripMenuOpen] = useState(false);
  const [mobileRisksOpen, setMobileRisksOpen] = useState(false);
  const [archivedViewTripId, setArchivedViewTripId] = useState(null);
  const [pendingAssignment, setPendingAssignment] = useState(null);
  const [driveFeatureEnabled, setDriveFeatureEnabled] = useState(getDriveStorageFeatureEnabled);
  const [driveStorage, setDriveStorage] = useState(null);
  const [driveStatus, setDriveStatus] = useState(null);
  const [driveBusy, setDriveBusy] = useState('');
  const [driveConflict, setDriveConflict] = useState(false);
  const [drivePanelOpen, setDrivePanelOpen] = useState(false);
  const [driveAutoSync, setDriveAutoSync] = useState(() => localStorage.getItem(STORAGE_KEYS.driveAutoSync) === 'true');
  const [planImageBusy, setPlanImageBusy] = useState(false);
  const [toast, setToast] = useState('');

  const toastTimerRef = useRef(null);
  const autoWeatherKeyRef = useRef('');
  const dayTileRefs = useRef(new Map());
  const planImageBusyRef = useRef(false);
  const aiPlannerQuestionRef = useRef(null);
  const aiPlannerResultRef = useRef(null);
  const importTextRef = useRef(null);
  const checklistDraftRef = useRef(null);
  const lodgingSectionRef = useRef(null);
  const latestAppSnapshotRef = useRef(null);
  const driveBusyRef = useRef('');
  const driveConflictRef = useRef(false);
  const notifyRef = useRef(null);
  const weatherDataRef = useRef(initial.weatherData);
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
  const scheduleRiskGroups = useMemo(
    () => buildRiskGroups(riskItems, tripDates),
    [riskItems, tripDates],
  );
  const checklistRiskGroup = useMemo(
    () => buildChecklistRiskGroup(checklistGroups, checklistState, language),
    [checklistGroups, checklistState, language],
  );
  const scheduleHasEntries = useMemo(
    () => Object.keys(schedule).length > 0,
    [schedule],
  );
  const lodgingRiskGroup = useMemo(
    () => buildLodgingRiskGroup(lodgings, hasInitializedPlans || scheduleHasEntries, language),
    [hasInitializedPlans, language, lodgings, scheduleHasEntries],
  );
  const riskGroups = useMemo(
    () => [
      ...scheduleRiskGroups,
      ...(lodgingRiskGroup ? [lodgingRiskGroup] : []),
      ...(checklistRiskGroup ? [checklistRiskGroup] : []),
    ],
    [checklistRiskGroup, lodgingRiskGroup, scheduleRiskGroups],
  );
  const weatherOverview = useMemo(
    () => buildWeatherOverview(tripDates, schedule, plansById, weatherData, language),
    [language, plansById, schedule, tripDates, weatherData],
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
    if (!selectedDate || editorOpen || aiPlannerOpen || importModalOpen || checklistOpen || checklistImportOpen || drivePanelOpen || archivedViewTripId) return [];
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
          weatherOverride: weather.level === 'blocked',
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
    editorOpen,
    aiPlannerOpen,
    importModalOpen,
    checklistOpen,
    checklistImportOpen,
    drivePanelOpen,
    archivedViewTripId,
    language,
    t,
    tripDates,
    weatherData,
  ]);

  const {
    currentCandidate,
    readyCandidates,
    candidateGroups,
  } = useMemo(() => {
    const current = candidates.find((candidate) => candidate.isCurrent);
    const ready = [];
    const scheduled = [];
    const unavailable = [];

    candidates.forEach((candidate) => {
      if (candidate.isCurrent) return;
      if (!candidate.canAssign) {
        unavailable.push(candidate);
        return;
      }
      if (candidate.assignedDateId) scheduled.push(candidate);
      else ready.push(candidate);
    });

    return {
      currentCandidate: current,
      readyCandidates: ready,
      candidateGroups: [
        { key: 'ready', title: t('candidateReady'), items: ready },
        { key: 'scheduled', title: t('candidateScheduled'), items: scheduled },
        { key: 'unavailable', title: t('candidateUnavailable'), items: unavailable },
      ].filter((group) => group.items.length > 0),
    };
  }, [candidates, t]);
  const availableCandidateCount = readyCandidates.length;
  const isCreatingPlan = editorPlanId === NEW_PLAN_EDITOR_ID;
  const editorPlan = editorPlanId && !isCreatingPlan ? plansById.get(editorPlanId) : null;
  const getPlanEditorDraftJson = (planId = NEW_PLAN_EDITOR_ID) => {
    const plan = planId && planId !== NEW_PLAN_EDITOR_ID ? plansById.get(planId) : null;
    if (plan) return JSON.stringify(compactPlanForAi(plan, planAssignments.get(plan.id) || null), null, 2);

    return JSON.stringify({
      id: '',
      name: language === 'en' ? 'New plan' : '新计划',
      description: '',
      priority: 'preferred',
      location: {
        label: '',
        address: '',
        weather_location: { query: '', country_code: '', admin1: '', latitude: '', longitude: '' },
      },
      stops: [],
      available_dates: tripDates.map((date) => date.id),
      closed_dates: [],
      weather_rules: { best: [], ok: [], blocked: ['heavy_rain', 'storm'] },
      conflicts: [],
      bookings: [],
      reminders: [],
      tips: [],
    }, null, 2);
  };

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
      const nextDriveFeatureEnabled = getDriveStorageFeatureEnabled();
      setLanguage(nextLanguage);
      setDriveFeatureEnabled(nextDriveFeatureEnabled);
      if (!nextDriveFeatureEnabled) setDrivePanelOpen(false);
      document.documentElement.lang = nextLanguage;
      if (i18n.language !== nextLanguage) i18n.changeLanguage(nextLanguage);
    };

    window.addEventListener('popstate', syncLanguageFromUrl);
    return () => window.removeEventListener('popstate', syncLanguageFromUrl);
  }, [i18n]);

  useEffect(() => {
    if (!driveFeatureEnabled) return undefined;

    let cancelled = false;

    createPlanGachaDriveStorage().then((storage) => {
      if (cancelled) return;
      setDriveStorage(storage);
      setDriveStatus(storage?.status() || null);
    });

    return () => {
      cancelled = true;
    };
  }, [driveFeatureEnabled]);

  useEffect(() => {
    const currentTrip = {
      id: activeTripId,
      name: tripName || t('unnamedTrip'),
      startDateStr,
      tripDays,
      plans: normalizedPlans,
      schedule: normalizeSchedule(schedule),
      lodgings,
      archived: activeTripArchived,
    };
    const persistedTrips = pruneEmptyTripDrafts(
      trips.map((trip) => (trip.id === activeTripId ? currentTrip : trip)),
      activeTripId,
    ).map(stripChecklistFromTripSnapshot);

    localStorage.setItem(STORAGE_KEYS.schemaVersion, APP_SCHEMA_VERSION);
    localStorage.setItem(STORAGE_KEYS.trips, JSON.stringify(persistedTrips));
    localStorage.setItem(STORAGE_KEYS.currentTrip, activeTripId);
  }, [
    activeTripId,
    activeTripArchived,
    t,
    normalizedPlans,
    lodgings,
    schedule,
    startDateStr,
    tripName,
    tripDays,
    trips,
  ]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.checklistText, checklistText);
    localStorage.setItem(STORAGE_KEYS.checklistState, JSON.stringify(checklistState));
  }, [checklistState, checklistText]);

  useEffect(() => {
    weatherDataRef.current = weatherData;
  }, [weatherData]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.weatherCache, JSON.stringify(weatherData));
  }, [weatherData]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.driveAutoSync, driveAutoSync ? 'true' : 'false');
  }, [driveAutoSync]);

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
    lodgings,
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
    setLodgings(normalizedTrip.lodgings || []);
    setSelectedDateId(getSmartSelectedDate(normalizedTrip.startDateStr, normalizedTrip.tripDays));
    setWeatherError('');
  };

  const saveCurrentTripInto = (tripList) => {
    const currentTrip = getCurrentTripSnapshot();
    return tripList
      .map((trip) => (trip.id === activeTripId ? currentTrip : trip))
      .map(stripChecklistFromTripSnapshot);
  };

  const exportAppSnapshot = () => ({
    appSchemaVersion: APP_SCHEMA_VERSION,
    snapshotVersion: 1,
    activeTripId,
    trips: pruneEmptyTripDrafts(saveCurrentTripInto(trips), activeTripId).map(stripChecklistFromTripSnapshot),
    checklistText,
    checklistState: reconcileChecklistStateForGroups(checklistState, checklistGroups),
  });

  const isLocalWorkspaceEmpty = (snapshot = exportAppSnapshot()) => {
    const hasTripContent = snapshot.trips.some((trip) => (
      Array.isArray(trip.plans) && trip.plans.length > 0
    ) || (
      Array.isArray(trip.lodgings) && trip.lodgings.length > 0
    ) || Object.values(trip.schedule || {}).some((entry) => entry?.planId));
    const hasChecklistContent = Boolean(snapshot.checklistText?.trim())
      || Object.keys(snapshot.checklistState || {}).length > 0;

    return !hasTripContent && !hasChecklistContent;
  };

  useEffect(() => {
    driveBusyRef.current = driveBusy;
    driveConflictRef.current = driveConflict;
    latestAppSnapshotRef.current = exportAppSnapshot;
    notifyRef.current = notify;
  });

  const importAppSnapshot = (payload) => {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.trips)) {
      throw new Error(t('driveInvalidSnapshot'));
    }

    const importedTrips = payload.trips
      .map(normalizeTripSnapshot)
      .map(stripChecklistFromTripSnapshot);
    if (!importedTrips.length) throw new Error(t('driveInvalidSnapshot'));

    const preferredTripId = payload.activeTripId || importedTrips[0].id;
    const visibleImportedTrips = importedTrips.filter((trip) => !trip.archived);
    const activeTrip = visibleImportedTrips.find((trip) => trip.id === preferredTripId)
      || visibleImportedTrips[0]
      || importedTrips.find((trip) => trip.id === preferredTripId)
      || importedTrips[0];
    const nextTrips = pruneEmptyTripDrafts(importedTrips, activeTrip.id).map(stripChecklistFromTripSnapshot);
    const nextActiveTrip = nextTrips.find((trip) => trip.id === activeTrip.id) || nextTrips[0];

    const nextChecklistText = normalizeChecklistText(payload.checklistText ?? payload.checklist ?? payload.packingList, '');
    const nextChecklistGroups = parseChecklistText(nextChecklistText, language);

    setTrips(nextTrips);
    applyTripSnapshot(nextActiveTrip);
    setChecklistText(nextChecklistText);
    setChecklistState(reconcileChecklistStateForGroups(payload.checklistState || payload.checklistStatus || {}, nextChecklistGroups));
    setChecklistEditing(false);
    setChecklistImportOpen(false);
    setChecklistImportConflicts([]);
    setImportModalOpen(false);
    setPendingAssignment(null);
    setArchivedViewTripId(null);
    setBatchAiOpen(false);
    setAiPlannerOpen(false);
    resetAiPlannerFields();
  };

  const refreshDriveStatus = () => {
    setDriveStatus(driveStorage?.status() || null);
  };

  const ensureDriveConnected = async () => {
    if (!driveStorage?.status()?.connected) {
      await driveStorage.connect({ prompt: 'consent' });
    }
  };

  const formatDriveMergeError = (error) => {
    if (error?.code === 'merge_invalid_snapshot') {
      return t('driveMergeInvalidSnapshot', { source: error.details?.source || 'remote' });
    }
    if (error?.code === 'merge_schema_mismatch') {
      return t('driveMergeSchemaMismatch', {
        source: error.details?.source || 'remote',
        version: error.details?.version || 'missing',
      });
    }
    if (error?.code === 'merge_data_conflict') {
      return t('driveMergeDataConflict', { path: error.details?.path || 'unknown' });
    }
    return error?.message || String(error);
  };

  const isDriveFileNotFoundError = (error) => (
    error?.code === 'file_not_found' || error?.name === 'DriveStorageFileNotFoundError'
  );

  const isDriveInvalidJsonError = (error) => error?.code === 'invalid_json';

  const assertRemoteSnapshotImportable = (payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Array.isArray(payload.trips)) {
      throw new Error(t('driveInvalidSnapshot'));
    }
  };

  const runDriveAction = async (busyKey, action) => {
    if (!driveStorage) {
      notify(t('driveActionFailed', { message: t('driveUnavailable') }));
      return;
    }

    setDriveBusy(busyKey);
    try {
      await action();
      refreshDriveStatus();
    } catch (error) {
      if (error?.name === 'DriveStorageAmbiguousFileError') {
        notify(t('driveAmbiguousFile'));
        refreshDriveStatus();
        return;
      }

      if (isDriveFileNotFoundError(error)) {
        setDriveConflict(false);
        notify(t('driveFileMissing'));
        refreshDriveStatus();
        return;
      }

      if (isDriveInvalidJsonError(error)) {
        setDriveConflict(false);
        notify(t('driveInvalidJson'));
        refreshDriveStatus();
        return;
      }

      if (String(error?.code || '').startsWith('merge_')) {
        notify(t('driveMergeFailed', { message: formatDriveMergeError(error) }));
        refreshDriveStatus();
        return;
      }

      if (error?.name === 'DriveStorageConflictError') {
        setDriveConflict(true);
        notify(t('driveConflictTitle'));
        refreshDriveStatus();
        return;
      }

      notify(t('driveActionFailed', { message: error?.message || String(error) }));
      refreshDriveStatus();
    } finally {
      setDriveBusy('');
    }
  };

  const syncDrive = () => runDriveAction('sync', async () => {
    await ensureDriveConnected();
    const localSnapshot = exportAppSnapshot();

    if (driveStorage.status()?.file?.id) {
      await driveStorage.save(localSnapshot);
      setDriveConflict(false);
      notify(t('driveSynced'));
      return;
    }

    if (typeof driveStorage.findFile === 'function') {
      const existing = await driveStorage.findFile();

      if (existing?.file?.id) {
        const remoteSnapshot = await driveStorage.load();
        assertRemoteSnapshotImportable(remoteSnapshot);
        if (remoteSnapshotMatchesLocal(remoteSnapshot, localSnapshot)) {
          setDriveConflict(false);
          notify(t('driveLinkedExisting'));
        } else if (isLocalWorkspaceEmpty(localSnapshot)) {
          importAppSnapshot(remoteSnapshot);
          setDriveConflict(false);
          notify(t('driveLoaded'));
        } else {
          setDriveConflict(true);
          notify(t('driveRemoteFound'));
        }
        return;
      }
    }

    await driveStorage.create(exportAppSnapshot());
    setDriveConflict(false);
    notify(t('driveSynced'));
  });

  const loadDriveFile = () => runDriveAction('load', async () => {
    const remote = await driveStorage.load();
    importAppSnapshot(remote);
    setDriveConflict(false);
    notify(t('driveLoaded'));
  });

  const mergeDriveFile = () => runDriveAction('merge', async () => {
    await ensureDriveConnected();
    const localSnapshot = exportAppSnapshot();
    const remoteSnapshot = await driveStorage.load();
    const mergedSnapshot = mergeAppSnapshots(localSnapshot, remoteSnapshot, language);
    await driveStorage.save(mergedSnapshot, { force: true });
    importAppSnapshot(mergedSnapshot);
    setDriveConflict(false);
    notify(t('driveMerged'));
  });

  const overwriteDriveFile = () => runDriveAction('overwrite', async () => {
    await ensureDriveConnected();
    await driveStorage.save(exportAppSnapshot(), { force: true });
    setDriveConflict(false);
    notify(t('driveSynced'));
  });

  useEffect(() => {
    const fileId = driveStatus?.file?.id;
    if (!driveFeatureEnabled || !driveAutoSync || !driveStorage || driveStorage.available === false || !driveStatus?.connected || !fileId || driveConflict) {
      return undefined;
    }

    const timer = window.setInterval(async () => {
      if (driveBusyRef.current || driveConflictRef.current) return;

      setDriveBusy('auto');
      try {
        const snapshot = latestAppSnapshotRef.current?.();
        if (snapshot) await driveStorage.save(snapshot);
        setDriveStatus(driveStorage.status());
      } catch (error) {
        if (isDriveFileNotFoundError(error)) {
          setDriveConflict(false);
          notifyRef.current?.(t('driveFileMissing'));
        } else if (isDriveInvalidJsonError(error)) {
          setDriveConflict(false);
          notifyRef.current?.(t('driveInvalidJson'));
        } else if (error?.name === 'DriveStorageConflictError') {
          setDriveConflict(true);
          notifyRef.current?.(t('driveConflictTitle'));
        } else {
          notifyRef.current?.(t('driveActionFailed', { message: error?.message || String(error) }));
        }
        setDriveStatus(driveStorage.status());
      } finally {
        setDriveBusy('');
      }
    }, DRIVE_AUTO_SYNC_MS);

    return () => window.clearInterval(timer);
  }, [driveAutoSync, driveConflict, driveFeatureEnabled, driveStatus?.connected, driveStatus?.file?.id, driveStorage, t]);

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
      startUiTransition(() => {
        setTripMenuOpen(false);
        setEditorTab('itinerary');
        setEditorOpen(true);
        setBatchAiOpen(false);
      });
      notify(t('emptyPlanNotice'));
      return;
    }

    const nextTrip = createEmptyTripSnapshot(language === 'en' ? `Trip ${trips.length + 1}` : `旅行计划 ${trips.length + 1}`, getTodayId());
    setTrips([...pruneEmptyTripDrafts(saveCurrentTripInto(trips), activeTripId), nextTrip]);
    applyTripSnapshot(nextTrip);
    startUiTransition(() => {
      setTripMenuOpen(false);
      setEditorTab('itinerary');
      setEditorOpen(true);
      setBatchAiOpen(false);
    });
    notify(t('newTripCreated'));
  };

  const loadExampleTrip = () => {
    const hasCurrentContent = normalizedPlans.length > 0 || lodgings.length > 0 || Object.keys(schedule).length > 0;
    if (hasCurrentContent && !window.confirm(t('overwriteExampleConfirm'))) return;

    const exampleTrip = createExampleTripSnapshot(t('exampleTripName'), startDateStr, activeTripId);
    setTripName(exampleTrip.name);
    setTripDays(exampleTrip.tripDays);
    setPlans(exampleTrip.plans);
    setSchedule(exampleTrip.schedule);
    setLodgings(exampleTrip.lodgings || []);
    setWeatherData({});
    setSelectedDateId(exampleTrip.startDateStr);
    closePlanEditor();
    setBatchAiOpen(false);
    notify(t('exampleLoaded'));
  };

  const openBatchAiGenerator = () => {
    startUiTransition(() => {
      setAiPlannerMode('generate');
      setAiPlannerOpen(false);
      setEditorPlanId(null);
      setEditorTab('itinerary');
      setEditorOpen(true);
      setBatchAiOpen(true);
    });
    resetAiPlannerFields();
  };

  const openAiPlanner = (mode = 'replan') => {
    if (mode === 'generate' || !hasInitializedPlans) {
      openBatchAiGenerator();
      return;
    }

    resetAiPlannerFields();
    startUiTransition(() => {
      setAiPlannerMode('replan');
      setEditorOpen(false);
      setAiPlannerOpen(true);
    });
  };

  const resetAiPlannerFields = () => {
    if (aiPlannerQuestionRef.current) aiPlannerQuestionRef.current.value = '';
    if (aiPlannerResultRef.current) aiPlannerResultRef.current.value = '';
  };

  const openPlanEditor = (planId = NEW_PLAN_EDITOR_ID) => {
    startUiTransition(() => {
      setEditorPlanId(planId);
      setEditorTab('itinerary');
      setEditorOpen(true);
      setBatchAiOpen(false);
      setAiPlannerOpen(false);
    });
  };

  const openLodgingEditor = () => {
    startUiTransition(() => {
      setEditorPlanId(null);
      setEditorTab('lodging');
      setEditorOpen(true);
      setBatchAiOpen(false);
      setAiPlannerOpen(false);
    });
    window.setTimeout(() => {
      lodgingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const closePlanEditor = () => {
    setEditorPlanId(null);
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

  const saveLodgings = (nextLodgings) => {
    setLodgings(normalizeTripLodgings(nextLodgings));
    notify(t('lodgingsSaved'));
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
    const currentTripIsEmpty = !hasInitializedPlans && lodgings.length === 0 && Object.keys(schedule).length === 0;
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
    const currentRiskKeys = new Set(riskItems.map(getRiskIdentity));

    const nextRisks = buildRiskItems(normalizedPlans, tripDates, nextSchedule, plansById, weatherData)
      .filter((risk) => risk.level !== 'info')
      .filter((risk) => !currentRiskKeys.has(getRiskIdentity(risk)));

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
    startUiTransition(() => {
      setChecklistEditing(false);
      setChecklistOpen(true);
    });
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
    const nextChecklistText = normalizeChecklistText(checklistDraftRef.current?.value ?? checklistText);
    const nextGroups = parseChecklistText(nextChecklistText, language);

    setChecklistText(nextChecklistText);
    setChecklistState((current) => reconcileChecklistStateForGroups(current, nextGroups));
    setChecklistEditing(false);
    notify(t('checklistSaved'));
  };

  const loadChecklistExample = () => {
    const nextChecklistText = normalizeChecklistText(EXAMPLE_CHECKLIST_TEXT);
    setChecklistText(nextChecklistText);
    setChecklistState({});
    setChecklistEditing(false);
    notify(t('checklistExampleLoaded'));
  };

  const resetChecklistState = () => {
    setChecklistState({});
    notify(t('checklistStateReset'));
  };

  const openChecklistImport = () => {
    startUiTransition(() => {
      setChecklistImportText('');
      setChecklistImportConflicts([]);
      setChecklistImportOpen(true);
    });
  };

  const closeChecklistImport = () => {
    startUiTransition(() => {
      setChecklistImportOpen(false);
      setChecklistImportConflicts([]);
    });
  };

  const getChecklistImportPayload = () => parseChecklistImportPayload(checklistImportText, language);

  const replaceChecklistFromImport = () => {
    try {
      const payload = getChecklistImportPayload();
      setChecklistText(payload.checklistText);
      setChecklistState(payload.checklistState);
      setChecklistEditing(false);
      setChecklistImportText('');
      closeChecklistImport();
      notify(t('checklistImported'));
    } catch (error) {
      notify(t('importFailed', { message: error.message }));
    }
  };

  const mergeChecklistFromImport = () => {
    try {
      const payload = getChecklistImportPayload();
      const merged = mergeChecklistPayload(
        checklistText,
        checklistState,
        payload.checklistText,
        payload.checklistState,
        language,
      );

      setChecklistText(merged.checklistText);
      setChecklistState(merged.checklistState);
      setChecklistEditing(false);
      setChecklistImportConflicts(merged.conflicts);

      if (merged.conflicts.length) {
        notify(t('checklistMergeConflicts', { count: merged.conflicts.length }));
      } else {
        setChecklistImportText('');
        closeChecklistImport();
        notify(t('checklistMerged'));
      }
    } catch (error) {
      notify(t('importFailed', { message: error.message }));
    }
  };

  const getChecklistStatusLabel = (status) => {
    if (status === CHECKLIST_STATUS.done) return t('checklistDone');
    if (status === CHECKLIST_STATUS.skipped) return t('checklistNotNeeded');
    return t('checklistTodo');
  };

  const getChecklistConflictLabel = (type) => {
    if (type === 'category') return t('checklistConflictCategory');
    if (type === 'status') return t('checklistConflictStatus');
    return t('checklistConflictDuplicate');
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

  const downloadJson = (data, fileName, message) => {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      downloadBlob(blob, fileName);
      notify(message);
    } catch {
      notify(t('downloadFailed'));
    }
  };

  const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');

      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  };

  const shareCurrentPlanImage = async (cardElement) => {
    if (!selectedDate || !selectedPlan || !cardElement || planImageBusyRef.current) return;

    planImageBusyRef.current = true;
    setPlanImageBusy(true);
    try {
      const imageResult = await renderElementToImageBlob(cardElement);
      const fileName = `${sanitizeFileNamePart(tripName)}-${sanitizeFileNamePart(selectedDate.display)}-${sanitizeFileNamePart(selectedPlan.name)}.${imageResult.extension}`;
      let file = null;
      let canShareFile = false;
      const canCopyImage = await copyImageBlobToClipboard(imageResult.blob);

      if (canCopyImage) {
        notify(t('planImageCopied'));
        return;
      }

      if (shouldUseNativeImageShare() && typeof File === 'function') {
        file = new File([imageResult.blob], fileName, { type: imageResult.mimeType });
        try {
          canShareFile = !navigator.canShare || navigator.canShare({ files: [file] });
        } catch {
          canShareFile = false;
        }
      }

      if (canShareFile) {
        await navigator.share({
          files: [file],
          title: selectedPlan.name,
          text: `${tripName || t('unnamedTrip')} · ${selectedDate.display}`,
        });
        notify(t('planImageShared'));
      } else {
        downloadBlob(imageResult.blob, fileName);
        notify(t('planImageDownloaded'));
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('[plan-gacha] plan image export failed', error);
        notify(t('planImageFailed'));
      }
    } finally {
      planImageBusyRef.current = false;
      setPlanImageBusy(false);
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
      const nextWeatherData = await fetchWeatherForPlans(normalizedPlans, tripDates, startDateStr, weatherDataRef.current);
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

    fetchWeatherForPlans(normalizedPlans, tripDates, startDateStr, weatherDataRef.current)
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
  }, [language, normalizedPlans, startDateStr, t, tripDates]);

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
        lodging: getLodgingContextForDate(lodgings, date.id),
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
      location: compactLocationForAi(plan.location),
      stops: plan.stops.map((stop) => ({
        time: stop.time,
        title: stop.title,
        location: stop.location.label,
        address: stop.location.address || '',
        transfer_from_previous: compactTransferForAi(stop.transferFromPrevious),
        opening_hours: stop.openingHours,
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
      reminders: plan.reminders.map((item) => ({
        time: item.time,
        text: item.text,
        links: item.links || [],
      })),
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
      lodgings: lodgings.map(compactLodgingForAi),
      existing_schedule: tripDates.map(summarizeScheduleDate),
      existing_plans: normalizedPlans.map(summarizePlan),
      current_warnings: riskGroups.map((group) => ({
        title: translateRiskTitle(group.title, language),
        level: group.level,
        items: group.items,
      })),
    };

    const planSchema = getPlanJsonSchema(language);
    const plannerQuestion = aiPlannerQuestionRef.current?.value || '';

    if (mode === 'generate') {
      const unplannedDates = tripDates.filter((date) => !schedule[date.id]?.planId);
      const generateRequest = plannerQuestion.trim() || (hasInitializedPlans
        ? (language === 'en'
          ? 'Add candidate plans for backups or added days; include assigned_day when useful.'
          : '请补充计划池、backup 或新增天数需要的候选计划；必要时给出 assigned_day。')
        : (language === 'en'
          ? 'Generate a travel plan pool and include an initial schedule when useful.'
          : '请生成旅行计划池；如果适合，也给出初始日程。'));
      if (language === 'en') {
        return `You are a travel plan-pool assistant. Generate or extend travel plans based on the current state.

User request, prioritize this:
${generateRequest}

Data:
${JSON.stringify({
  ...tripContext,
  mode: hasInitializedPlans ? 'extend existing plan pool' : 'generate a full plan pool from empty state',
  keep_existing_schedule_by_default: hasInitializedPlans,
  unplanned_dates: unplannedDates.map(summarizeScheduleDate),
  existing_plan_ids_should_not_duplicate: normalizedPlans.map((plan) => plan.id),
}, null, 2)}

Output rules:
1. Only output importable JSON, with no Markdown or explanation.
2. Follow the JSON format below. Use empty arrays for optional list fields when absent.
3. Fill available_dates, closed_dates, weather_rules and conflicts from the trip constraints and the user request.
4. Fill location.weather_location as an administrative weather lookup object, not a scenic spot. For Japan, use query like "Kawachi-Nagano, Osaka, Japan", country_code "JP", and admin1 "Osaka"; do not write concatenated romanization like "Kawachinagano". Fill latitude/longitude only when you are confident.
5. Put storm in weather_rules.blocked. Heavy rain should usually be blocked; if it is an indoor backup, put heavy_rain in ok, not best.
6. Fill stops.location.address and bookings.address when possible. Add bookings for reservations, tickets or cancellation/change links. For restaurants that require or strongly benefit from reservation, add a restaurant_reservation booking with status pending unless already booked, plus a short note about when/why to reserve.
7. If lodging is provided for that date, include the lodging as the first stop, e.g. "Depart from lodging", using the lodging location and weather_relevant false.
8. stops.time is the arrival/start time at that stop. Do not use stops.time as the departure time of the transfer.
9. For transfer_from_previous, fill depart_at whenever possible because the UI shows the departure time. stops.time is already the arrival/start time, so do not duplicate it in transfer_from_previous. Only fill the main transport mode and rough duration. Do not write detailed turn-by-turn routes; the user will check maps later. Use mode "walk" for normal point-to-point walking, short walks between nearby stops, station walking, or ordinary pedestrian transfers. Use "sightseeing_walk" only when the transfer itself is a distinct planned scenic stroll or street-walk activity; if unsure, use "walk".
10. For stops.opening_hours, only write the hours relevant to the planned arrival time. Do not include seasonal notes, full-day schedules or long caveats; leave it empty if unsure.
11. If the day should return to lodging, add a final stop such as "Return to lodging" with the lodging location, transfer_from_previous from the previous stop, and weather_relevant false.
12. Do not call a plan a "loop" just because it starts and ends at lodging. Use loop only for a real circular sightseeing route.
13. If lodgings are provided, use them as day start/end and hotel-transfer constraints.
14. Avoid repeating the same point across description, reminders and tips. Use description for the day summary and why the flow works; use reminders only for time-sensitive or must-check actions; use tips only for optional general advice.
15. URL fields such as bookings.url, bookings.cancel_url, reminders[].links[].url, lodging booking/map URLs must be plain https URLs, never Markdown links.
16. For official sites, realtime status pages, live cameras, booking pages or other URLs in reminders, put them in reminders[].links. Do not put Markdown links or raw URLs inside reminder text.
17. Add reminders and tips only when useful; otherwise use empty arrays.
18. When an existing plan pool exists, do not duplicate existing plan_id. Unless explicitly replacing, only add or supplement.
19. If a plan should be scheduled, write assigned_day on that plan.

JSON format:
${planSchema}`;
      }

      return `你是旅行计划池生成助手。请根据当前状态生成或补充旅行计划。

用户需求，请优先处理：
${generateRequest}

数据：
${JSON.stringify({
  ...tripContext,
  mode: hasInitializedPlans ? '补充现有计划池' : '从空计划池生成完整规划',
  keep_existing_schedule_by_default: hasInitializedPlans,
  unplanned_dates: unplannedDates.map(summarizeScheduleDate),
  existing_plan_ids_should_not_duplicate: normalizedPlans.map((plan) => plan.id),
}, null, 2)}

输出规范：
1. 只输出可导入 JSON，不要 Markdown 或解释。
2. 严格按下面格式补齐字段；可选数组没有内容时用空数组。
3. 根据旅行限制和用户需求填写 available_dates、closed_dates、weather_rules、conflicts。
4. location.weather_location 写成天气查询用行政地点对象，不要用景点名。日本地点用类似 "Kawachi-Nagano, Osaka, Japan" 的 query，并写 country_code "JP"、admin1 "Osaka"；不要写 "Kawachinagano" 这种无空格拼接罗马字。只有确定坐标时才填 latitude/longitude。
5. storm 必须放在 weather_rules.blocked；heavy_rain 通常也应 blocked，如果是室内避雨方案，最多放 ok，不要放 best。
6. stops.location.address 和 bookings.address 尽量写清楚；需要预约、订票或退改入口时写 bookings。餐厅如果需要预约，或强烈建议预约/排队风险较高，也写 restaurant_reservation 类型的 booking；除非已订好，否则 status 用 pending，并在 note 简要说明何时/为什么要预约。
7. 如果当天有住宿信息，把住宿作为第一个 stop，例如“酒店出发/从住宿出发”，location 使用住宿地点，weather_relevant 为 false。
8. stops.time 是到达/开始当前 stop 的时间，不是从上一站出发的时间。
9. transfer_from_previous 尽量填写 depart_at，因为界面会显示出发时间。stops.time 已经是到达/开始当前 stop 的时间，不要在 transfer_from_previous 里重复。只写从上一 stop 到当前 stop 的主要交通工具和粗略耗时，不要写详细换乘路线；用户之后会看地图。普通点到点步行、相邻地点短距离步行、站内步行或普通通勤步行，mode 都写“步行”。只有这段移动本身就是一个明确安排的观景散步、街区漫步或游览项目时，才写“游玩型步行”；不确定时写“步行”。
10. stops.opening_hours 只写和计划到达时间相关的开放/营业时间，不要写季节说明、全天完整时间表或很长的注意事项；不确定就留空。
11. 如果当天应该回住宿，在 stops 最后增加“返回酒店/返回住宿”节点，location 使用住宿地点，transfer_from_previous 写上一站到住宿的移动，weather_relevant 为 false。
12. 不要因为从酒店出发、回酒店结束，就把计划命名为“环线”；只有真实闭环游览路线才可以叫环线。
13. 如果提供了 lodgings，把住宿作为每天出发、返回和换酒店约束。
14. 避免在 description、reminders、tips 里反复写同一件事。description 只写当天概览和动线为什么成立；reminders 只写有时间点、必须确认、必须执行的动作；tips 只写额外建议。
15. bookings.url、bookings.cancel_url、reminders[].links[].url、住宿 booking/map URL 等 URL 字段只能填写纯 https URL，不要写 Markdown 链接。
16. 提醒里如果涉及官网、实时状态、实时摄像头、预约页或其他 URL，放到 reminders[].links；不要把 Markdown 链接或裸 URL 写进 text。
17. 有特别提醒和 tips 就写，没有就留空数组。
18. 已有计划池时不要重复已有 plan_id；除非明确要替换，否则只新增或补充。
19. 需要安排日期时，在对应 plan 上写 assigned_day。

JSON 格式：
${planSchema}`;
    }

    const replanRequest = plannerQuestion.trim() || (language === 'en'
      ? 'Replan the remaining dates based on current weather, date limits, must-go priority and day flow.'
      : '请根据当前天气、日期限制、必去优先级和当天动线，重排剩余日期。');
    const context = {
      ...tripContext,
      fixed_dates_do_not_change: fixedDates.map(summarizeScheduleDate),
      adjustable_dates: adjustableDates.map(summarizeScheduleDate),
      remaining_or_adjustable_plans: remainingPlans.map(summarizePlan),
    };

    if (language === 'en') {
      return `You are a travel itinerary replanning assistant. Only adjust the remaining itinerary based on the data below. Do not change dates listed in fixed_dates_do_not_change.

User request, prioritize this:
${replanRequest}

You need to:
1. Rearrange the dates in adjustable_dates.
2. Prioritize must-go plans and reduce weather-unsuitable or date-unsuitable choices.
3. Do not casually move reserved/ticketed plans; call out pending reservations/tickets in the reasons.
4. Consider lodging check-in/check-out, day start/end and hotel-transfer constraints.
5. Explain if a plan must be dropped.
6. Clearly list anything I need to confirm if the adjustment creates risk.
7. End with JSON so I can import or compare changes manually.

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

用户需求，请优先处理：
${replanRequest}

你需要做：
1. 重新安排 adjustable_dates 中的日期。
2. 优先保留必去计划，尽量减少天气不合适和日期不合适。
3. 已预约/已订票的计划不要随意挪动；未预约/未订票的计划需要在原因里提醒。
4. 考虑住宿入住/退房、每天出发/返回和换酒店约束。
5. 如果必须放弃计划，请说明原因。
6. 如果某个调整会带来风险，请明确列出需要我确认的事项。
7. 最后输出一个 JSON，方便我手动导入或对照修改。

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
    const importedLodgings = parsed.lodgings || parsed.hotels || parsed.accommodations || parsed.stays;
    if (Array.isArray(importedLodgings)) {
      touched = true;
      setLodgings(normalizeTripLodgings(importedLodgings));
    }

    if (Array.isArray(parsed.plans)) {
      touched = true;
      setPlans((current) => {
        const next = [...current];
        parsed.plans.forEach((incomingPlan, index) => {
          const normalized = normalizePlan(incomingPlan, index, tripDates);
          const existingIndex = next.findIndex((plan) => plan.id === normalized.id);
          if (existingIndex >= 0) {
            next[existingIndex] = normalized;
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

    if (!touched && !parsed.startDateStr && !parsed.tripDays) {
      throw new Error(t('noApplicableJson'));
    }

    notify(message);
  };

  const applyAiPlannerResult = () => {
    try {
      applyImportedPayload(parseImportJson(aiPlannerResultRef.current?.value || ''), t('aiPlanApplied'));
      resetAiPlannerFields();
      setAiPlannerOpen(false);
      setBatchAiOpen(false);
    } catch (error) {
      notify(t('applyFailed', { message: error.message }));
    }
  };

  const buildPlanAiPrompt = (planQuestion = '') => {
    const schema = getSinglePlanJsonSchema(language);
    const currentPlan = editorPlan
      ? compactPlanForAi(editorPlan, planAssignments.get(editorPlan.id) || null)
      : null;
    const planUserRequest = planQuestion.trim() || (isCreatingPlan
      ? (language === 'en' ? 'Add a plan that fits the current trip.' : '请新增一个适合当前旅行的计划。')
      : (language === 'en' ? 'Improve the current plan.' : '请优化当前计划。'));
    const planContext = isCreatingPlan
      ? {
        trip: {
          name: tripName || t('unnamedTrip'),
          range: formatTripRange(startDateStr, tripDays, language),
          days: tripDays,
        },
        lodgings: lodgings.map(compactLodgingForAi),
        existing_plan_ids: normalizedPlans.map((plan) => plan.id),
      }
      : {
        trip: {
          name: tripName || t('unnamedTrip'),
          range: formatTripRange(startDateStr, tripDays, language),
          days: tripDays,
        },
        lodgings: lodgings.map(compactLodgingForAi),
        current_plan: currentPlan,
      };

    return `${language === 'en'
    ? `You are a single travel-plan editing assistant. ${isCreatingPlan ? 'Add one plan' : 'Modify the current plan'} based on the user request. Only output one plan JSON object.`
    : `你是旅行单个计划编辑助手。请根据用户需求${isCreatingPlan ? '新增一个计划' : '修改当前计划'}，只输出单个计划 JSON 对象。`}

${language === 'en' ? 'Context:' : '上下文：'}
${JSON.stringify(planContext, null, 2)}

${language === 'en' ? 'User request, prioritize this:' : '用户需求，请优先处理：'}
${planUserRequest}

${language === 'en' ? `Requirements:
1. ${isCreatingPlan ? 'The new plan id must not duplicate existing_plan_ids.' : 'Keep the current plan id unless the user explicitly asks to change it.'}
2. Fill location.weather_location as an administrative weather lookup object, not a scenic spot. For Japan, use query like "Kawachi-Nagano, Osaka, Japan", country_code "JP", and admin1 "Osaka"; do not write concatenated romanization like "Kawachinagano". Fill latitude/longitude only when you are confident.
3. Put storm in weather_rules.blocked. Heavy rain should usually be blocked; if it is an indoor backup, put heavy_rain in ok, not best.
4. Fill stops.location.address and bookings.address when possible. Add bookings for reservations, tickets or cancellation/change links. For restaurants that require or strongly benefit from reservation, add a restaurant_reservation booking with status pending unless already booked, plus a short note about when/why to reserve.
5. If lodging is provided for that date, include the lodging as the first stop, e.g. "Depart from lodging", using the lodging location and weather_relevant false.
6. stops.time is the arrival/start time at that stop. Do not use stops.time as the departure time of the transfer.
7. For transfer_from_previous, fill depart_at whenever possible because the UI shows the departure time. stops.time is already the arrival/start time, so do not duplicate it in transfer_from_previous. Only fill the main transport mode and rough duration. Do not write detailed turn-by-turn routes; the user will check maps later. Use mode "walk" for normal point-to-point walking, short walks between nearby stops, station walking, or ordinary pedestrian transfers. Use "sightseeing_walk" only when the transfer itself is a distinct planned scenic stroll or street-walk activity; if unsure, use "walk".
8. For stops.opening_hours, only write the hours relevant to the planned arrival time. Do not include seasonal notes, full-day schedules or long caveats; leave it empty if unsure.
9. If the day should return to lodging, add a final stop such as "Return to lodging" with the lodging location, transfer_from_previous from the previous stop, and weather_relevant false.
10. Do not call a plan a "loop" just because it starts and ends at lodging. Use loop only for a real circular sightseeing route.
11. If lodgings are provided, account for day start/end and hotel-transfer constraints.
12. Avoid repeating the same point across description, reminders and tips. Use description for the day summary and why the flow works; use reminders only for time-sensitive or must-check actions; use tips only for optional general advice.
13. URL fields such as bookings.url, bookings.cancel_url, reminders[].links[].url, lodging booking/map URLs must be plain https URLs, never Markdown links.
14. For official sites, realtime status pages, live cameras, booking pages or other URLs in reminders, put them in reminders[].links. Do not put Markdown links or raw URLs inside reminder text.
15. If the plan fits a specific day, include assigned_day.
16. Output one plan JSON object only, with no explanation, no array and no outer "plans" wrapper.

Single plan JSON format:
${schema}` : `要求：
1. ${isCreatingPlan ? '新增计划 id 不要和 existing_plan_ids 重复。' : '除非用户明确要求，否则保留当前计划 id。'}
2. location.weather_location 写成天气查询用行政地点对象，不要用景点名。日本地点用类似 "Kawachi-Nagano, Osaka, Japan" 的 query，并写 country_code "JP"、admin1 "Osaka"；不要写 "Kawachinagano" 这种无空格拼接罗马字。只有确定坐标时才填 latitude/longitude。
3. storm 必须放在 weather_rules.blocked；heavy_rain 通常也应 blocked，如果是室内避雨方案，最多放 ok，不要放 best。
4. stops.location.address 和 bookings.address 尽量写清楚；需要预约、订票或退改入口时写 bookings。餐厅如果需要预约，或强烈建议预约/排队风险较高，也写 restaurant_reservation 类型的 booking；除非已订好，否则 status 用 pending，并在 note 简要说明何时/为什么要预约。
5. 如果当天有住宿信息，把住宿作为第一个 stop，例如“酒店出发/从住宿出发”，location 使用住宿地点，weather_relevant 为 false。
6. stops.time 是到达/开始当前 stop 的时间，不是从上一站出发的时间。
7. transfer_from_previous 尽量填写 depart_at，因为界面会显示出发时间。stops.time 已经是到达/开始当前 stop 的时间，不要在 transfer_from_previous 里重复。只写从上一 stop 到当前 stop 的主要交通工具和粗略耗时，不要写详细换乘路线；用户之后会看地图。普通点到点步行、相邻地点短距离步行、站内步行或普通通勤步行，mode 都写“步行”。只有这段移动本身就是一个明确安排的观景散步、街区漫步或游览项目时，才写“游玩型步行”；不确定时写“步行”。
8. stops.opening_hours 只写和计划到达时间相关的开放/营业时间，不要写季节说明、全天完整时间表或很长的注意事项；不确定就留空。
9. 如果当天应该回住宿，在 stops 最后增加“返回酒店/返回住宿”节点，location 使用住宿地点，transfer_from_previous 写上一站到住宿的移动，weather_relevant 为 false。
10. 不要因为从酒店出发、回酒店结束，就把计划命名为“环线”；只有真实闭环游览路线才可以叫环线。
11. 如果提供了 lodgings，把住宿作为当天出发、返回和换酒店约束。
12. 避免在 description、reminders、tips 里反复写同一件事。description 只写当天概览和动线为什么成立；reminders 只写有时间点、必须确认、必须执行的动作；tips 只写额外建议。
13. bookings.url、bookings.cancel_url、reminders[].links[].url、住宿 booking/map URL 等 URL 字段只能填写纯 https URL，不要写 Markdown 链接。
14. 提醒里如果涉及官网、实时状态、实时摄像头、预约页或其他 URL，放到 reminders[].links；不要把 Markdown 链接或裸 URL 写进 text。
15. 如果计划适合安排到某一天，可以写 assigned_day。
16. 只输出单个计划 JSON 对象，不要解释，不要数组，不要外层 plans 包装。

单个计划 JSON 格式：
${schema}`}
`;
  };

  const copyPlanAiPrompt = (planQuestion = '') => {
    copyText(buildPlanAiPrompt(planQuestion), isCreatingPlan ? t('addPlanPromptCopied') : t('editPlanPromptCopied'));
  };

  const assertPlanDraftOption = (value, allowedValues, path) => {
    const normalizedValue = String(value || '').trim();
    if (normalizedValue && !allowedValues.has(normalizedValue)) {
      throw new Error(t('invalidPlanField', { path, value: normalizedValue }));
    }
  };

  const validatePlanDraftOptions = (payload) => {
    if (!payload || typeof payload !== 'object') return;

    if (payload.priority) {
      assertPlanDraftOption(payload.priority, new Set(Object.keys(PRIORITY_META)), 'priority');
    }

    if (payload.weather_rules && typeof payload.weather_rules === 'object') {
      ['best', 'ok', 'blocked'].forEach((ruleKey) => {
        toArray(payload.weather_rules[ruleKey]).forEach((value) => {
          assertPlanDraftOption(value, WEATHER_RULE_VALUES, `weather_rules.${ruleKey}`);
        });
      });
    }

    [
      ...toArray(payload.bookings),
      ...toArray(payload.reservations),
      ...toArray(payload.appointments),
      ...toArray(payload.tickets),
    ].forEach((booking, index) => {
      if (!booking || typeof booking !== 'object') return;
      if (booking.type || booking.kind) {
        assertPlanDraftOption(booking.type || booking.kind, BOOKING_TYPE_VALUES, `bookings[${index}].type`);
      }
      if (booking.status) {
        assertPlanDraftOption(booking.status, BOOKING_STATUS_VALUES, `bookings[${index}].status`);
      }
    });
  };

  const parseSinglePlanDraft = (text) => {
    const parsed = parseImportJson(text);
    const payload = getSinglePlanPayload(parsed);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error(t('noApplicableJson'));
    }
    validatePlanDraftOptions(payload);

    const payloadWithFallbackId = isCreatingPlan
      ? payload
      : { ...payload, id: payload.id || editorPlanId };
    const normalizedPlan = normalizePlan(payloadWithFallbackId, 0, tripDates);
    const duplicatePlan = normalizedPlans.find((plan) => (
      plan.id === normalizedPlan.id && (isCreatingPlan || plan.id !== editorPlanId)
    ));
    if (duplicatePlan) throw new Error(t('duplicatePlanId', { id: normalizedPlan.id }));

    return {
      plan: normalizedPlan,
      assignedDay: payload.assigned_day || payload.assignedDay || '',
    };
  };

  const applySinglePlanDraft = ({ plan, assignedDay }, message) => {
    const previousPlanId = isCreatingPlan ? '' : editorPlanId;

    setPlans((current) => {
      if (isCreatingPlan) return [...current, plan];

      return current.map((item, index) => {
        const normalizedPlan = normalizePlan(item, index, tripDates);
        return normalizedPlan.id === previousPlanId ? plan : item;
      });
    });

    if (assignedDay || (previousPlanId && previousPlanId !== plan.id)) {
      setSchedule((current) => {
        const next = Object.fromEntries(
          Object.entries(current).map(([dateId, entry]) => [
            dateId,
            entry?.planId === previousPlanId ? { ...entry, planId: plan.id } : entry,
          ]),
        );

        if (assignedDay) next[assignedDay] = { planId: plan.id };
        return next;
      });
    }

    notify(message);
    closePlanEditor();
  };

  const applyPlanEditDraft = (draftJson) => {
    try {
      applySinglePlanDraft(
        parseSinglePlanDraft(draftJson),
        isCreatingPlan ? t('planCreated') : t('planUpdated'),
      );
    } catch (error) {
      notify(t('applyFailed', { message: error.message }));
    }
  };

  const handleImport = () => {
    try {
      applyImportedPayload(parseImportJson(importTextRef.current?.value || ''), t('importDone'));
      setImportModalOpen(false);
      if (importTextRef.current) importTextRef.current.value = '';
    } catch (error) {
      notify(t('importFailed', { message: error.message }));
    }
  };

  const handleImportFile = async (event, onLoaded) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await readImportFileText(file);
      onLoaded(text);
      notify(t('importFileLoaded', { name: file.name }));
    } catch {
      notify(t('importFileReadFailed'));
    } finally {
      event.target.value = '';
    }
  };

  const handleTripImportFile = (event) => handleImportFile(event, (text) => {
    if (importTextRef.current) importTextRef.current.value = text;
  });

  const handleChecklistImportFile = (event) => handleImportFile(event, (text) => {
    setChecklistImportText(text);
    setChecklistImportConflicts([]);
  });

  const handleExportState = () => {
    const data = { schemaVersion: APP_SCHEMA_VERSION, startDateStr, tripDays, lodgings, plans: normalizedPlans, schedule };
    const fileName = `${sanitizeFileNamePart(tripName || t('unnamedTrip'))}-${startDateStr || 'trip'}.json`;
    downloadJson(data, fileName, t('jsonDownloaded'));
  };

  const handleExportChecklist = () => {
    const data = {
      schemaVersion: APP_SCHEMA_VERSION,
      checklistText,
      checklistState,
    };
    const fileName = `${sanitizeFileNamePart(tripName || t('unnamedTrip'))}-checklist-${startDateStr || 'trip'}.json`;
    downloadJson(data, fileName, t('checklistExported'));
  };

  const renderDriveSyncPanel = () => {
    if (!driveStorage) return null;

    const file = driveStatus?.file;
    const hasFile = Boolean(file?.id);
    const isConnected = Boolean(driveStatus?.connected);
    const isAvailable = driveStorage.available !== false;
    const isBusy = Boolean(driveBusy);
    const disabled = !isAvailable || isBusy;
    const syncDisabled = disabled || driveConflict;
    const canAutoSync = isAvailable && isConnected && hasFile;
    const modifiedAt = file?.modifiedTime ? new Date(file.modifiedTime) : null;
    const modifiedLabel = modifiedAt && !Number.isNaN(modifiedAt.getTime())
      ? t('driveUpdatedAt', {
        time: modifiedAt.toLocaleString(language === 'en' ? 'en-US' : 'zh-CN', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      })
      : '';
    const statusLabel = !isAvailable
      ? t(driveStatus?.configured === false ? 'driveNotConfigured' : 'driveUnavailable')
      : hasFile
      ? t('driveConnectedFile', { name: file.name || 'plan-gacha.state.json' })
      : isConnected
        ? t('driveNoFile')
        : t('driveNotConnected');

    return (
      <div className={`drive-sync-panel ${isAvailable ? '' : 'is-unavailable'}`}>
        <div className="drive-sync-head">
          <div>
            <strong>{t('driveSync')}</strong>
            <span>{t('driveSyncHelp')}</span>
          </div>
          {isBusy && <em>{t('driveBusy')}</em>}
        </div>
        <div className="drive-sync-status">
          <span>{statusLabel}</span>
          {modifiedLabel && <span>{modifiedLabel}</span>}
        </div>
        {isAvailable && (
          <label className={`drive-auto-sync ${canAutoSync ? '' : 'is-disabled'}`}>
            <input
              type="checkbox"
              checked={driveAutoSync}
              disabled={!canAutoSync || isBusy}
              onChange={(event) => setDriveAutoSync(event.target.checked)}
            />
            <span>
              <strong>{t('driveAutoSync')}</strong>
              <em>{t('driveAutoSyncHelp')}</em>
            </span>
          </label>
        )}
        {driveConflict && (
          <div className="drive-conflict">
            <strong>{t('driveConflictTitle')}</strong>
            <p>{t('driveConflictHelp')}</p>
            <div>
              <button className="btn btn-outline" type="button" onClick={loadDriveFile} disabled={disabled || !hasFile}>
                {t('drivePullRemote')}
              </button>
              <button className="btn btn-outline" type="button" onClick={mergeDriveFile} disabled={disabled || !hasFile}>
                {t('driveMergeRemote')}
              </button>
              <button className="btn btn-primary" type="button" onClick={overwriteDriveFile} disabled={disabled}>
                {t('driveOverwriteRemote')}
              </button>
            </div>
          </div>
        )}
        <div className="drive-sync-actions">
          <button className="btn btn-primary drive-sync-main" type="button" onClick={syncDrive} disabled={syncDisabled}>
            {isConnected ? t('driveSyncNow') : t('driveConnectAndSync')}
          </button>
        </div>
      </div>
    );
  };

  const renderPlanStops = (plan) => {
    if (!plan?.stops.length) return null;

    return (
      <ol className="stop-list" aria-label={t('stopsAria', { name: plan.name })}>
        {plan.stops.map((stop, index) => {
          const previousStop = index > 0 ? plan.stops[index - 1] : null;
          const routeUrl = previousStop ? getGoogleMapsDirectionsUrl(previousStop.location, stop.location) : '';
          const mapsUrl = getGoogleMapsUrl(stop.location);
          const copyValue = getLocationCopyText(stop.location);
          const transferText = formatStopTransfer(stop.transferFromPrevious);
          const transferDepartureText = formatStopTransferDeparture(stop.transferFromPrevious, stop.time, language);
          const metaSeparator = language === 'en' ? ': ' : '：';
          const previousStopName = previousStop?.title || previousStop?.location?.label || '';
          const currentStopName = stop.title || stop.location?.label || '';
          const showTransfer = Boolean(previousStop && (transferText || transferDepartureText));

          return (
            <Fragment key={stop.id}>
              {showTransfer && (
                <li className="stop-item stop-transfer-item">
                  <span className="stop-time stop-transfer-time">
                    {transferDepartureText}
                  </span>
                  <span className="stop-detail stop-transfer-detail">
                    <span className="stop-commute" aria-label={`${previousStopName} ${t('transferLabel')} ${currentStopName}`}>
                      <Icon name="route" />
                      <span className="stop-commute-route">
                        <span>{previousStopName}</span>
                        <span aria-hidden="true">-&gt;</span>
                        <span>{currentStopName}</span>
                      </span>
                      {transferText && <strong>{transferText}</strong>}
                    </span>
                  </span>
                </li>
              )}
              <li className="stop-item">
                <span className="stop-time">{stop.time || t('flexible')}</span>
                <span className="stop-detail">
                  <strong>{stop.title}</strong>
                  <span className="stop-location">
                    <span className="stop-location-text">
                      <span className="stop-location-line">
                        <span className="stop-location-label">{stop.location.label}</span>
                        {stop.openingHours && (
                          <span className="stop-hours-inline">
                            <Icon name="clock" />
                            <span>{t('openingHours')}{metaSeparator}{stop.openingHours}</span>
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="stop-location-actions">
                      {routeUrl && (
                        <a
                          className="stop-location-action"
                          href={routeUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={t('openRouteInMaps')}
                          title={t('openRouteInMaps')}
                        >
                          <Icon name="route" />
                        </a>
                      )}
                      {mapsUrl && (
                        <a
                          className="stop-location-action"
                          href={mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={t('openInMaps')}
                          title={t('openInMaps')}
                        >
                          <Icon name="mapPin" />
                        </a>
                      )}
                      {copyValue && (
                        <button
                          className="stop-location-action"
                          type="button"
                          onClick={() => copyText(copyValue, t('placeCopied'))}
                          aria-label={t('copyPlace')}
                          title={t('copyPlace')}
                        >
                          <Icon name="copy" />
                        </button>
                      )}
                    </span>
                  </span>
                  {stop.note && <em>{stop.note}</em>}
                </span>
              </li>
            </Fragment>
          );
        })}
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
                  {item.time && <span className="plan-note-time">{item.time}</span>}
                  <span className="plan-note-content">
                    {item.text && <em>{item.text}</em>}
                    {item.links?.length > 0 && (
                      <span className="plan-note-links">
                        {item.links.map((link) => (
                          <a key={link.url} className="plan-note-link" href={link.url} target="_blank" rel="noreferrer">
                            {link.label}
                          </a>
                        ))}
                      </span>
                    )}
                  </span>
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
          <strong>
            <WeatherIcon condition={getWeatherIconCondition(weather.snapshot)} level={weather.level} />
            <span>{weather.label}</span>
          </strong>
          <span className="weather-summary">{weather.snapshot ? formatWeatherDataSummary(weather.snapshot, language) : t('noWeatherForPlace')}</span>
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

  const renderCandidateDetails = (plan) => {
    const hasDetails = Boolean(plan?.stops.length || plan?.bookings.length || plan?.reminders.length || plan?.tips.length);
    if (!hasDetails) return null;
    const routeStops = plan.stops
      .map((stop) => stop.title || stop.location.label)
      .filter(Boolean);
    const visibleRouteStops = routeStops.slice(0, 4);
    const hiddenRouteCount = Math.max(routeStops.length - visibleRouteStops.length, 0);

    return (
      <details className="candidate-card-details">
        <summary>
          {visibleRouteStops.length > 0 && (
            <span className="candidate-route-summary">
              {visibleRouteStops.map((label, index) => (
                <Fragment key={`${plan.id}-route-${label}-${index}`}>
                  {index > 0 && <span className="route-separator">-&gt;</span>}
                  <span>{label}</span>
                </Fragment>
              ))}
              {hiddenRouteCount > 0 && <em>+{hiddenRouteCount}</em>}
            </span>
          )}
          <span className="candidate-detail-toggle">
            <span className="details-closed">{t('viewPlanDetails')}</span>
            <span className="details-open">{t('hidePlanDetails')}</span>
            <span className="details-chevron" aria-hidden="true" />
          </span>
        </summary>
        <div className="candidate-card-detail-body">
          {renderPlanStops(plan)}
          {renderPlanBookings(plan)}
          {renderPlanNotes(plan)}
        </div>
      </details>
    );
  };

  const renderCandidateActions = (plan, canAssign, weatherOverride = false) => (
    <div className="candidate-actions">
      <button
        className={`icon-btn compact-icon-btn candidate-select-btn ${weatherOverride && canAssign ? 'is-risky' : ''}`}
        type="button"
        disabled={!canAssign || !selectedDate}
        onClick={() => selectedDate && requestAssignPlan(selectedDate.id, plan.id)}
        aria-label={`${t('select')} ${plan.name}`}
        title={t('select')}
      >
        <Icon name="check" />
      </button>
      <button
        className="icon-btn compact-icon-btn candidate-edit-btn"
        type="button"
        onClick={() => openPlanEditor(plan.id)}
        aria-label={t('editSinglePlan')}
        title={t('editSinglePlan')}
      >
        <Icon name="pencil" />
      </button>
    </div>
  );

  const renderPlanBookingBadge = (plan) => {
    const bookingBadge = getPlanBookingBadge(plan, language);
    if (!bookingBadge) return null;

    return (
      <span className={`booking-badge status-${bookingBadge.status}`}>
        {bookingBadge.label}
      </span>
    );
  };

  const renderCandidateCard = (candidate) => {
    const { plan, canAssign, assignedDateId, weatherOverride } = candidate;

    return (
      <article
        className={`plan-card ${!canAssign ? 'is-disabled is-mobile-collapsed' : ''} ${weatherOverride && canAssign ? 'is-weather-risk' : ''} priority-${plan.priority}`}
        key={plan.id}
      >
        <div className="plan-card-header">
          <div>
            <div className="title-row">
              <h3>{plan.name}</h3>
              <span className={`priority-badge ${plan.priority}`}>{getPriorityLabel(plan.priority, language)}</span>
              {renderPlanBookingBadge(plan)}
              {assignedDateId && (
                <span className="assigned-badge">
                  {t('scheduledOn', { date: formatAssignedDate(assignedDateId, tripDates) })}
                </span>
              )}
            </div>
            <p>{plan.description}</p>
          </div>
        </div>

        {renderCandidateDetails(plan)}
        {renderCandidateSignals(candidate)}

        {renderCandidateActions(plan, canAssign, weatherOverride)}
      </article>
    );
  };

  const renderCandidateGroups = (gridClassName = 'plan-grid') => (
    <div className="candidate-group-list">
      {candidateGroups.map((group) => (
        <section className={`candidate-group candidate-group-${group.key}`} key={group.key}>
          <div className="candidate-group-title">
            <h3>{group.title}</h3>
            <span>{t('itemsCount', { count: group.items.length })}</span>
          </div>
          <div className={gridClassName}>
            {group.items.map(renderCandidateCard)}
          </div>
        </section>
      ))}
    </div>
  );

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
        {renderPlanBookingBadge(selectedPlan)}
      </div>
      <p className="current-plan-summary">{selectedPlan?.description || t('currentPlanHelp')}</p>
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
        <button
          className="icon-btn compact-icon-btn"
          type="button"
          disabled={planImageBusy}
          onClick={(event) => shareCurrentPlanImage(event.currentTarget.closest('[data-current-plan-card="true"]'))}
          aria-label={t('sharePlanImage')}
          title={t('sharePlanImage')}
          data-screenshot-exclude="true"
        >
          <Icon name="camera" />
        </button>
        <button
          className="icon-btn compact-icon-btn"
          type="button"
          onClick={() => openPlanEditor(selectedPlan.id)}
          aria-label={`${t('editSinglePlan')} ${selectedPlan.name}`}
          title={t('editSinglePlan')}
          data-screenshot-exclude="true"
        >
          <Icon name="pencil" />
        </button>
        <button
          className="icon-btn compact-icon-btn current-clear-btn"
          type="button"
          onClick={() => clearDay(selectedDate.id)}
          aria-label={t('clear')}
          title={t('clear')}
          data-screenshot-exclude="true"
        >
          <Icon name="x" />
        </button>
      </div>
    );
  };

  const renderRiskGroup = (group) => {
    const isLodgingRisk = group.title === '住宿信息未填写';

    return (
      <div className={`risk-item risk-group ${group.level}`} key={group.title}>
        <div className="risk-group-head">
          <strong>{translateRiskTitle(group.title, language)}</strong>
          {isLodgingRisk && (
            <button className="btn btn-small btn-outline" type="button" onClick={openLodgingEditor}>
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
  };

  const renderMobileRiskPanel = () => {
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
          onClick={() => setMobileRisksOpen((current) => !current)}
        >
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

      {renderCandidateGroups('plan-grid mobile-plan-grid')}
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

    return (
      <div className="archived-view-body">
        {archiveDates.map((date) => {
          const plan = archivePlansById.get(archiveSchedule[date.id]?.planId);
          const weather = plan ? evaluateWeather(plan, date.id, weatherData, language) : null;

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
                      <strong>
                        <WeatherIcon condition={getWeatherIconCondition(weather.snapshot)} level={weather.level} />
                        <span>{weather.label}</span>
                      </strong>
                      <span className="weather-summary">{weather.snapshot ? formatWeatherDataSummary(weather.snapshot, language) : t('noWeatherForPlace')}</span>
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
                        {isDone && <Icon name="check" />}
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
          <button className="btn btn-outline" type="button" onClick={() => startUiTransition(() => setImportModalOpen(true))}>
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
          <div className="trip-primary-row">
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
            <button className="icon-btn mobile-language-toggle" type="button" onClick={toggleLanguage} title={t('langSwitchTitle')} aria-label={t('langSwitchTitle')}>
              {t('langSwitch')}
            </button>
          </div>
          <div className="trip-actions">
            {hasInitializedPlans && (
              <button
                className="icon-btn ai-replan-btn"
                type="button"
                onClick={() => openAiPlanner('replan')}
                aria-label={t('aiReplan')}
                title={t('aiReplan')}
              >
                <Icon name="sparkles" />
              </button>
            )}
            <button className="icon-btn checklist-btn" type="button" onClick={openChecklist} aria-label={t('checklistTitle')} title={t('checklistTitle')}>
              <Icon name="listChecks" />
            </button>
            <button
              className="icon-btn lodging-shortcut-btn"
              type="button"
              disabled={activeTripDisplay.isEmpty}
              onClick={openLodgingEditor}
              aria-label={activeTripDisplay.isEmpty ? t('createOrImportFirst') : t('lodgingSection')}
              title={activeTripDisplay.isEmpty ? t('createOrImportFirst') : t('lodgingSection')}
            >
              <Icon name="home" />
            </button>
            {driveFeatureEnabled && driveStorage && (
              <button className="icon-btn drive-sync-btn" type="button" onClick={() => startUiTransition(() => setDrivePanelOpen(true))} aria-label={t('driveSync')} title={t('driveSync')}>
                <Icon name="cloud" />
              </button>
            )}
            <button
              className="icon-btn trip-edit-btn"
              type="button"
              disabled={activeTripDisplay.isEmpty}
              onClick={() => {
                startUiTransition(() => {
                  setTripMenuOpen(false);
                  setEditorPlanId(null);
                  setEditorTab('itinerary');
                  setEditorOpen(true);
                });
              }}
              aria-label={activeTripDisplay.isEmpty ? t('noEditablePlan') : t('editPlan')}
              title={activeTripDisplay.isEmpty ? t('createOrImportFirst') : t('editPlan')}
            >
              <Icon name="pencil" />
            </button>
            <button className="icon-btn" type="button" onClick={createNewTrip} aria-label={t('createTrip')}>
              <Icon name="plus" />
            </button>
          </div>
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

          <div className="day-list" aria-label={t('dateList')}>
            {tripDates.map((date) => {
              const entry = schedule[date.id];
              const plan = entry ? plansById.get(entry.planId) : null;
              const selected = selectedDate?.id === date.id;
              const insight = getDayInsight(plan, date.id, schedule, plansById, weatherData, language);
              return (
                <Fragment key={date.id}>
                  <button
                    className={`day-tile ${selected ? 'is-selected' : ''} ${plan ? 'has-plan' : ''} ${plan ? `priority-${plan.priority}` : ''} status-${insight.level}`}
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
                    <span className="day-weather">
                      <WeatherIcon condition={insight.weatherCondition} level={insight.level} />
                      <span>{insight.weatherText}</span>
                    </span>
                    {insight.riskText && <span className={`day-risk ${insight.riskTone}`}>{insight.riskText}</span>}
                  </button>
                  {selected && (
                    <div className="current-plan selected-day-plan" data-current-plan-card="true">
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

          <div className="current-plan" data-current-plan-card="true">
            {renderCurrentPlanBody()}
            {renderCurrentPlanActions()}
          </div>

          <div className="section-title">
            <h2>{t('switchablePlans')}</h2>
            <span>{t('available', { count: availableCandidateCount })}</span>
          </div>

          {renderCandidateGroups()}
        </section>

        <aside className="side-panel status-panel">
          <div className="panel-header">
            <h2>{t('warnings')}</h2>
          </div>

          <div className="risk-list">
            {riskGroups.length === 0 && <div className="empty-state">{t('noBlockingRisks')}</div>}
            {riskGroups.slice(0, 8).map(renderRiskGroup)}
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
            {Object.entries(weatherData).length === 0 ? (
              <p className="weather-source-empty">{t('noWeather')}</p>
            ) : (
              <details className="weather-source-panel">
                <summary>
                  <span>{t('weatherSourcesCount', { count: Object.entries(weatherData).length })}</span>
                  <span className="weather-source-toggle">
                    <span className="details-closed">{t('viewWeatherSources')}</span>
                    <span className="details-open">{t('hideWeatherSources')}</span>
                    <span className="details-chevron" aria-hidden="true" />
                  </span>
                </summary>
                <div className="weather-source-list">
                  {Object.entries(weatherData).map(([key, value]) => (
                    <span key={key}>{value.label || key}</span>
                  ))}
                </div>
              </details>
            )}
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
                <Icon name="x" />
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
                ref={aiPlannerQuestionRef}
                placeholder={aiReplanText.placeholder}
              />
            </label>

            <label>
              <span>{t('aiResult')}</span>
              <textarea
                className="textarea ai-result"
                ref={aiPlannerResultRef}
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
          <div
            className={`modal trip-editor-modal ${editorPlanId ? 'is-plan-detail' : 'is-trip-detail'}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-header">
              <div>
                <p className="eyebrow">{t('planSetup')}</p>
                <h2>{editorPlanId ? (isCreatingPlan ? t('addPlan') : t('editSinglePlan')) : t('editPlan')}</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => setEditorOpen(false)} aria-label={t('closeEditor')}>
                <Icon name="x" />
              </button>
            </div>

            {!editorPlanId && (
              <div className="trip-editor-top">
                <div className="trip-editor-grid">
                  <BufferedTripNameField key={`${activeTripId}-${tripName}`} value={tripName} t={t} onCommit={setTripName} />
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

                <div className="editor-tabs" role="tablist" aria-label={t('editPlan')}>
                  <button
                    className={editorTab === 'itinerary' ? 'is-active' : ''}
                    type="button"
                    role="tab"
                    aria-selected={editorTab === 'itinerary'}
                    onClick={() => startUiTransition(() => setEditorTab('itinerary'))}
                  >
                    {t('itinerary')}
                  </button>
                  <button
                    className={editorTab === 'lodging' ? 'is-active' : ''}
                    type="button"
                    role="tab"
                    aria-selected={editorTab === 'lodging'}
                    onClick={() => startUiTransition(() => setEditorTab('lodging'))}
                  >
                    {t('lodgingSection')}
                  </button>
                </div>
              </div>
            )}

            <div className="trip-editor-body">
              {editorPlanId ? (
                <PlanEditorDetail
                  key={editorPlanId}
                  isCreatingPlan={isCreatingPlan}
                  editorPlan={editorPlan}
                  initialDraftJson={getPlanEditorDraftJson(editorPlanId)}
                  t={t}
                  onBack={closePlanEditor}
                  onCopyPrompt={copyPlanAiPrompt}
                  onApplyDraft={applyPlanEditDraft}
                  renderPlanStops={renderPlanStops}
                  renderPlanBookings={renderPlanBookings}
                  renderPlanNotes={renderPlanNotes}
                />
              ) : editorTab === 'lodging' ? (
                <div className="editor-section" ref={lodgingSectionRef}>
                  <LodgingEditor
                    lodgings={lodgings}
                    startDateStr={startDateStr}
                    endDateStr={endDateStr}
                    t={t}
                    onSave={saveLodgings}
                  />
                </div>
              ) : (
                <>
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
                          startUiTransition(() => {
                            setEditorPlanId(null);
                            setEditorTab('itinerary');
                            setAiPlannerMode('generate');
                            setBatchAiOpen((current) => !current);
                          });
                        }}
                        title={t('aiPlanPoolTitle')}
                      >
                        <span>{t('aiGenerateShort')}</span>
                        <span className="toggle-chevron" aria-hidden="true" />
                      </button>
                      <button className="btn btn-outline" type="button" onClick={loadExampleTrip} title={t('loadFullExample')}>
                        {t('viewExample')}
                      </button>
                      <button className="btn btn-outline" type="button" onClick={() => startUiTransition(() => setImportModalOpen(true))} title={t('importJsonTitle')}>
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
                            ref={aiPlannerQuestionRef}
                            placeholder={aiGenerateText.placeholder}
                          />
                        </label>

                        <label>
                          <span>{t('aiResult')}</span>
                          <textarea
                            className="textarea ai-result"
                            ref={aiPlannerResultRef}
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
                                <Icon name="pencil" />
                              </button>
                              <button
                                className="icon-btn compact-icon-btn danger-icon-btn"
                                type="button"
                                onClick={() => removePlan(plan.id)}
                                aria-label={`${t('delete')} ${plan.name}`}
                                title={t('delete')}
                              >
                                <Icon name="trash" />
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
                    {renderArchivedTripRows()}
                  </div>
                </>
              )}
            </div>

            {!editorPlanId && (
              <div className="trip-editor-footer">
                <div className="trip-lifecycle-actions">
                  <button className="btn btn-outline" type="button" onClick={archiveCurrentTrip}>
                    {t('archive')}
                  </button>
                  <button className="btn btn-danger" type="button" onClick={deleteCurrentTrip}>
                    {t('delete')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {driveFeatureEnabled && drivePanelOpen && driveStorage && (
        <div className="modal-overlay" onClick={() => setDrivePanelOpen(false)}>
          <div className="modal drive-sync-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">{t('driveSync')}</p>
                <h2>{t('driveSync')}</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => setDrivePanelOpen(false)} aria-label={t('close')}>
                <Icon name="x" />
              </button>
            </div>
            {renderDriveSyncPanel()}
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
                <Icon name="x" />
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

            <div className="checklist-scroll">
              {checklistEditing ? (
                <div className="checklist-editor">
                  <p className="helper-text">{t('checklistFormatHint')}</p>
                  <label>
                    <span>{t('checklistTextLabel')}</span>
                    <textarea
                      key={checklistText}
                      className="textarea checklist-textarea"
                      ref={checklistDraftRef}
                      defaultValue={checklistText}
                    />
                  </label>
                </div>
              ) : (
                renderChecklistItems()
              )}
            </div>

            <div className="modal-actions checklist-actions">
              {checklistEditing ? (
                <>
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() => {
                      setChecklistEditing(false);
                    }}
                  >
                    {t('cancel')}
                  </button>
                  <button className="btn btn-primary" type="button" onClick={saveChecklistText}>
                    {t('checklistSave')}
                  </button>
                </>
              ) : (
                <>
                {checklistStats.total === 0 && (
                  <button className="btn btn-outline" type="button" onClick={loadChecklistExample}>
                    {t('checklistUseExample')}
                  </button>
                )}
                <button className="btn btn-outline" type="button" onClick={() => startUiTransition(() => setChecklistEditing(true))}>
                  {t('checklistEdit')}
                </button>
                <button className="btn btn-outline" type="button" onClick={openChecklistImport}>
                  {t('checklistImport')}
                </button>
                <button className="btn btn-outline" type="button" onClick={handleExportChecklist}>
                  {t('checklistExport')}
                </button>
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={resetChecklistState}
                  disabled={checklistStats.done === 0 && checklistStats.skipped === 0}
                >
                  {t('checklistResetState')}
                </button>
                </>
              )}
            </div>
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
                  <Icon name="x" />
                </button>
              </div>
            </div>

            {renderArchivedTripView(archivedViewTrip)}
          </div>
        </div>
      )}

      {checklistImportOpen && (
        <div className="modal-overlay" onClick={closeChecklistImport}>
          <div className="modal checklist-import-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">{t('checklist')}</p>
                <h2>{t('checklistImportTitle')}</h2>
              </div>
              <button className="icon-btn" type="button" onClick={closeChecklistImport} aria-label={t('close')}>
                <Icon name="x" />
              </button>
            </div>

            <p className="helper-text">{t('checklistImportHelp')}</p>
            <div className="import-file-row">
              <label className="btn btn-outline file-import-btn">
                {t('importFile')}
                <input type="file" accept=".json,application/json,text/plain" onChange={handleChecklistImportFile} />
              </label>
            </div>
            <textarea
              className="textarea checklist-textarea"
              value={checklistImportText}
              onChange={(event) => {
                setChecklistImportText(event.target.value);
                setChecklistImportConflicts([]);
              }}
              placeholder={t('checklistImportPlaceholder')}
            />

            {checklistImportConflicts.length > 0 && (
              <div className="checklist-conflicts">
                <strong>{t('checklistMergeConflicts', { count: checklistImportConflicts.length })}</strong>
                <p>{t('checklistMergeConflictHelp')}</p>
                <div className="checklist-conflict-list">
                  {checklistImportConflicts.slice(0, 8).map((conflict, index) => (
                    <div className="checklist-conflict-row" key={`${conflict.type}-${conflict.text}-${index}`}>
                      <span>{getChecklistConflictLabel(conflict.type)}</span>
                      <strong>{conflict.text}</strong>
                      <em>
                        {conflict.currentGroup || '-'} → {conflict.incomingGroup || '-'}
                        {conflict.currentStatus || conflict.incomingStatus
                          ? ` · ${getChecklistStatusLabel(conflict.currentStatus)} / ${getChecklistStatusLabel(conflict.incomingStatus)}`
                          : ''}
                      </em>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-outline" type="button" onClick={closeChecklistImport}>
                {t('cancel')}
              </button>
              <button className="btn btn-outline" type="button" onClick={mergeChecklistFromImport}>
                {t('checklistMerge')}
              </button>
              <button className="btn btn-primary" type="button" onClick={replaceChecklistFromImport}>
                {t('checklistReplace')}
              </button>
            </div>
          </div>
        </div>
      )}

      {importModalOpen && (
        <div className="modal-overlay" onClick={() => setImportModalOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2>{t('importJsonTitle')}</h2>
              <button className="icon-btn" type="button" onClick={() => setImportModalOpen(false)} aria-label={t('close')}>
                <Icon name="x" />
              </button>
            </div>
            <div className="import-file-row">
              <label className="btn btn-outline file-import-btn">
                {t('importFile')}
                <input type="file" accept=".json,application/json" onChange={handleTripImportFile} />
              </label>
            </div>
            <textarea
              className="textarea"
              rows={12}
              ref={importTextRef}
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

      {pendingAssignment && (() => {
        const movedItems = pendingAssignment.clears.filter((item) => item.reason === '同一计划被移动');
        const clearedItems = pendingAssignment.clears.filter((item) => item.reason !== '同一计划被移动');

        return (
        <div className="modal-overlay" onClick={() => setPendingAssignment(null)}>
          <div className="modal impact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2>{t('impactPreview')}</h2>
              <button className="icon-btn" type="button" onClick={() => setPendingAssignment(null)} aria-label={t('close')}>
                <Icon name="x" />
              </button>
            </div>

            <div className="impact-summary">
              <strong>{pendingAssignment.targetPlan.name}</strong>
              <span>{t('assignToDate', { date: pendingAssignment.dateId })}</span>
            </div>

            {movedItems.length > 0 && (
              <div className="impact-section">
                <h3>{t('datesToMove')}</h3>
                {movedItems.map((item) => (
                  <div className="impact-row is-move" key={`${item.dateId}-${item.plan.id}`}>
                    <span>{item.dateId}</span>
                    <strong>{item.plan.name}</strong>
                    <em>{translateIssue(item.reason, language)}</em>
                  </div>
                ))}
              </div>
            )}

            {clearedItems.length > 0 && (
              <div className="impact-section">
                <h3>{t('datesToClear')}</h3>
                {clearedItems.map((item) => (
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
        );
      })()}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;

# 行程扭蛋 / Plan Gacha

[中文](#中文) · [English](#english)

![Plan Gacha Banner](docs/banner.png)

## 中文

行程扭蛋是一个面向旅行途中的动态计划切换工具。它适合那种已经准备了 `n + m` 个候选行程，但每天还要根据天气、闭馆、预约、体力和临时变化重新决定去哪儿的场景。

数据默认保存在浏览器 `localStorage`。当前版本是纯前端应用，不依赖后端服务。

### 适合解决什么

- 出发前先建立计划池：正式行程、备用方案、雨天方案、跨城方案都放在一起。
- 旅行中按天切换：看到明天天气后，快速换成更合适的安排。
- 避免计划崩掉：切换前提示日期限制、天气不合适、必去项未安排、预约订票未完成等问题。
- 给 AI 一个可执行格式：让 AI 生成、补充或重排行程，再把 JSON 粘贴回应用。

### 核心能力

- 多旅行计划管理：可以新建、删除、归档、恢复、导入、下载 JSON，也可以从示例快速体验完整能力。
- 每日行程视图：移动端提供日期导航，桌面端提供左侧日期列表和中间详情。
- 候选计划池：每个计划可以包含多个地点、多个时间点、跨城市安排、提醒、tips 和预约订票信息。
- 天气联动：按计划中的城市、区县或坐标自动查询 Open-Meteo 天气，并基于计划规则判断是否适合。
- 约束判断：支持可去日期、不可用日期、天气黑名单、推荐天气、必去标记和已安排日期。
- 冲突提示：选择某个计划前会评估它是否会影响后续安排，并把需要调整的天数留给用户重新决定。
- 预约订票：可以记录预约/门票状态、地址、链接和退改链接，状态由用户手动更新。
- 旅行清单：作为独立的长期清单维护，默认空白，可手动编辑、填入示例或导入 JSON，支持勾选完成、本次不需要和一键重置本次状态。
- 归档只读：已归档旅行可以在编辑界面查看，不参与顶部计划切换，适合保留历史行程。
- 多语言：支持中文和英文，可通过 `?lang=zh` 或 `?lang=en` 切换。

### 使用方式

1. 新建旅行计划，设置出发日期和天数。
2. 从 `AI 生成计划池`、导入 JSON 或完整示例开始建立候选计划。
3. 出发前把必去、备用、雨天、跨城、预约订票、提醒和 tips 都放进计划池。
4. 旅行中打开当天页面，按天气、日期限制和已安排状态选择方案。
5. 如果选择会移动或清空已有安排，应用会先展示影响预览，再由用户确认。

候选计划会分成三组：

- `可直接选择`：当前日期可用，且还没有安排在别天。
- `已安排，可移动`：已经排在其他日期，可以主动移动过来。
- `不可选`：日期不适合或当天不可用/闭馆等硬限制。

天气不合适不再阻止选择。对于临场判断可接受的情况，按钮会用风险颜色提示，但用户仍然可以强制选择；日期限制和闭馆仍然是硬限制。

### AI 工作流

应用不直接接入通用 AI API，也不会把数据自动发送到第三方。旅行计划通常需要 AI 产品侧的一整套工具支持，例如地图、搜索和位置理解；如果只接入裸模型 API，效果反而容易变差。作为计划工具，行程扭蛋也没有必要内建一套复杂的 AI 周边体系。

当前 AI 相关功能采用「复制提示词 -> 外部 AI 生成 -> 粘贴 JSON」的方式：

- `AI 生成计划池`：适合从空计划开始生成完整计划，或给已有行程补充候选方案。
- `AI 编辑单项`：适合新增或修改一个具体计划。
- `AI 重排`：适合旅行途中根据剩余天数、天气和已去项目重新安排。

提示词会尽量只提供 AI 真正需要的信息：

- 初始/增量规划：提供计划池 JSON 结构、已有计划 ID 和用户补充需求。
- 单项编辑：只提供当前单个计划或已有计划 ID，要求 AI 输出单个计划 JSON 对象。
- 重排行程：提供固定日期、可调整日期、剩余计划、天气和预警，让 AI 输出可导入结果。

未来更自然的方向，可能是把行程扭蛋作为服务能力提供给 AI 侧，让用户直接从 AI 产品中使用。

### 天气数据

天气查询使用免费的 [Open-Meteo](https://open-meteo.com/) 接口。应用会按地点和日期做本地缓存，避免短时间内重复请求同一个城市/区县的天气。

为了提升成功率，计划里的地点建议包含城市、区县或坐标；展示时可以只显示具体地点，但天气查询会优先使用更稳定的查询位置。

天气判断会结合天气类型、降水概率和计划的室内/室外属性：

- `31-50%` 降水概率：室外计划通常标为天气一般。
- `51%+` 降水概率：主打室外的计划标为天气不合适。
- `70%+` 降水概率：即使天气代码不明确，也会补进雨天风险判断。
- 大雨、雷雨：室外计划直接视为高风险；室内计划通常不受影响。

天气查询会优先使用 `location.weather_location`、城市、区县或坐标；如果只有景点名，查询可能失败或不稳定。

### 数据与导入导出

- 数据默认保存在浏览器 `localStorage`，没有账号系统或云同步。
- `127.0.0.1:5173` 和 `localhost:5173` 是不同浏览器 origin，数据不会互通。
- 旅行计划导出会直接下载 JSON，包含计划池、日程和天气缓存，不包含旅行清单；导入支持粘贴 JSON 或选择本地 JSON 文件。
- 旅行清单是全局独立数据，可以单独下载 JSON，之后可通过粘贴或选择文件导入，并选择替换或合并。
- 合并清单时，同分类同文本视为同一项；同文本不同分类会迁移可确定的状态，并提示冲突。
- 同文本多次出现或状态不一致时，不会自动覆盖当前清单，会提示用户整理后再导入。
- 当前同步文件 schema 为 `appSchemaVersion: "1.0"`；兼容字段新增、UI 调整和同步策略变化不升级 schema，只有破坏性数据结构变化才升级。

### 可选远端同步适配

应用本身不绑定具体远端存储服务。部署环境可以注入一个最小 `driveStorage` 适配器，让应用把完整工作区快照同步到宿主提供的远端 JSON 文件。

默认构建只在 URL 带 `?sync=1`，或本地已经记录过同步文件时启用同步入口；同时宿主必须实际提供 `driveStorage` API，否则入口不会展示。部署时可通过环境变量彻底关闭：

```bash
VITE_DRIVE_STORAGE_EXPOSURE=url   # 默认：URL 参数，或本地已有同步文件
VITE_DRIVE_STORAGE_EXPOSURE=off   # 完全禁用
```

宿主需要提供 `window.driveStorage`，或让 `/drive-storage/driveStorage.js` 加载后提供它。应用侧会用 `name + appProperties.appId` 定位同步文件；如果定位到多个文件，宿主应抛出 `DriveStorageAmbiguousFileError`。最小接口如下：

```ts
type DriveStorageApi = {
  status(): { configured?: boolean; connected?: boolean };
  isConfigured?(): boolean;
  connect(options?: { prompt?: '' | 'consent' | 'select_account' }): Promise<unknown>;
  disconnect?(options?: { revoke?: boolean }): Promise<unknown>;
  getFile(fileIdOrLocator: string | DriveFileLocator): Promise<DriveFileRecord>;
  findFile(locator: DriveFileLocator): Promise<DriveFileRecord | null>;
  createFile(options: DriveCreateFileOptions): Promise<DriveFileRecord>;
  readJson<T = unknown>(fileIdOrLocator: string | DriveFileLocator): Promise<T>;
  writeJson(fileIdOrLocator: string | DriveFileLocator, data: unknown, options?: { space?: number; mimeType?: string; appProperties?: Record<string, string> }): Promise<DriveFileRecord>;
  DriveStorageConflictError?: new (message: string, details?: { remote?: unknown; local?: unknown }) => Error;
};

type DriveFileLocator = {
  id?: string;
  name?: string;
  mimeType?: string;
  appProperties?: Record<string, string>;
};

type DriveFileRecord = {
  id: string;
  name: string | null;
  mimeType: string | null;
  modifiedTime: string | null;
  version: string | null;
  appProperties: Record<string, string>;
  webViewLink: string | null;
  canEdit: boolean | null;
};

type DriveCreateFileOptions = {
  name: string;
  mimeType?: string;
  appProperties?: Record<string, string>;
  content?: string | Blob | ArrayBuffer;
};
```

首次同步会按 `name = "plan-gacha.state.json"` 和 `appProperties.appId = "plan-gacha"` 查找远端文件。本地为空时会直接拉取远端；本地已有内容时会进入确认流程；找不到远端文件才会创建新文件。

保存前会用本地记录的 Drive `version` 和当前远端 `version` 做粗略冲突判断。由于 `driveStorage` 不再提供内容级指纹，内容是否相同只在首次定位远端文件时通过稳定 JSON 对比判断。

发生冲突时，界面提供三种处理：拉取远端覆盖本地、用本地覆盖远端、或尝试自动合并。自动合并只处理当前 `appSchemaVersion` 的完整同步文件；schema 不匹配、远端格式不完整、同一个 trip/plan/date/checklist 项两边都改过时，会拒绝合并并提示原因。

### 本地开发

```bash
npm install
npm run dev
```

默认开发地址：

```text
http://127.0.0.1:5173/
```

### 校验与构建

```bash
npm run lint
npm run build
```

## English

Plan Gacha is a lightweight tool for switching travel plans dynamically during a trip. It is designed for trips where you prepare `n + m` candidate plans in advance, then decide each day based on weather, closures, reservations, energy level and last-minute changes.

Data is stored in browser `localStorage` by default. The current version is a frontend-only app with no backend dependency.

### What It Solves

- Build a plan pool before departure: main plans, backups, rainy-day options and cross-city routes live together.
- Switch plans during the trip: after checking tomorrow's weather, pick a better-fit plan quickly.
- Avoid broken itineraries: before switching, the app warns about date limits, bad weather, unscheduled must-go plans and incomplete bookings.
- Give AI an executable format: let AI generate, supplement or replan the itinerary, then paste JSON back into the app.

### Core Features

- Multi-trip management: create, delete, archive, restore, import and download JSON exports, or load an example to explore the full feature set.
- Daily itinerary view: mobile has compact date navigation; desktop has a left date list and central detail view.
- Candidate plan pool: each plan can include multiple places, timed stops, cross-city routes, reminders, tips, reservations and tickets.
- Weather linkage: automatically checks Open-Meteo weather by city, district or coordinates, then evaluates plan suitability.
- Constraint checks: supports allowed dates, unavailable dates, weather blocks, preferred weather, must-go flags and assigned dates.
- Conflict preview: before selecting a plan, the app checks whether it affects later days and leaves impacted dates for the user to replan.
- Booking and tickets: record status, address, links and cancellation/change links; status updates remain manual.
- Trip checklist: maintain a standalone long-term checklist. It starts empty, can be edited manually, filled from an example or imported from JSON, and supports done/skipped status plus one-click status reset.
- Read-only archive: archived trips can be viewed from the editor, stay out of the top trip switcher and work well for keeping travel history.
- Multilingual UI: supports Chinese and English through `?lang=zh` or `?lang=en`.

### How To Use

1. Create a trip and set the start date and number of days.
2. Build the candidate pool from `AI Generate Plan Pool`, imported JSON or the full example.
3. Before departure, add must-go plans, backups, rainy-day options, cross-city routes, bookings, reminders and tips.
4. During the trip, open the current day and choose a plan based on weather, date limits and assigned status.
5. If a choice moves or clears existing assignments, the app shows an impact preview before applying it.

Candidates are grouped into three sections:

- `Ready to select`: available for the current date and not assigned elsewhere.
- `Scheduled elsewhere`: already assigned to another date, but can be moved here.
- `Unavailable`: blocked by hard limits such as date restrictions or closures.

Weather-unsuitable plans are still selectable. The app uses a risk-colored button so users can make a local judgment, while hard date limits and closures remain disabled.

### AI Workflow

The app does not directly call a general-purpose AI API, and it does not automatically send data to third parties. Travel planning usually depends on the broader tool stack inside AI products, such as maps, search and location understanding. Connecting only a bare model API can produce a weaker result, while rebuilding that surrounding system is unnecessary for a planning tool.

Current AI features use a copy-prompt, external-AI, paste-JSON workflow:

- `AI Generate Plan Pool`: create a full plan from an empty trip, or add candidates to an existing trip.
- `AI Edit Single Plan`: add or modify one concrete plan.
- `AI Replan`: rearrange the remaining trip based on remaining days, weather and completed plans.

Prompts are scoped to the task:

- Initial/incremental planning: includes the plan-pool JSON structure, existing plan IDs and the user's extra request.
- Single-plan editing: includes only the current plan or existing plan IDs, and asks AI to output one plan JSON object.
- Replanning: includes fixed dates, adjustable dates, remaining plans, weather and warnings, then asks AI for an importable result.

A more natural future direction may be to expose Plan Gacha as a service that users can access directly from AI products.

### Weather Data

Weather lookup uses the free [Open-Meteo](https://open-meteo.com/) API. The app caches weather locally by location and date range to avoid repeated short-interval requests for the same city or district.

For better lookup reliability, each plan should include a city, district or coordinates. The UI can still display the specific place, while weather lookup uses the more stable location metadata.

Weather evaluation combines weather type, precipitation probability and whether a plan is mainly indoor or outdoor:

- `31-50%` precipitation probability: outdoor plans are usually marked as weather-is-okay / not ideal.
- `51%+` precipitation probability: primarily outdoor plans are marked weather-unsuitable.
- `70%+` precipitation probability: rain risk is considered even when the weather code is ambiguous.
- Heavy rain or storms: outdoor plans are high risk; indoor plans are usually unaffected.

Weather lookup prioritizes `location.weather_location`, city, district or coordinates. Scenic spot names can fail or be unstable.

### Data And Import/Export

- Data is stored in browser `localStorage`; there is no account system or cloud sync.
- `127.0.0.1:5173` and `localhost:5173` are different browser origins, so their local data is separate.
- Trip export downloads a JSON file containing the plan pool, schedule and weather cache. It does not include the trip checklist; import supports pasted JSON or a local JSON file.
- The checklist is global standalone data. It can be downloaded separately as JSON, then imported by pasting or choosing a file, with replace or merge behavior.
- During checklist merge, same category plus same text is treated as the same item. Same text in a different category migrates clear status matches and reports a conflict.
- Repeated same-text items or status disagreements do not overwrite the current checklist automatically; the app reports them for cleanup before re-importing.
- The current sync-file schema is `appSchemaVersion: "1.0"`; compatible field additions, UI changes and sync-strategy changes do not bump the schema. Only breaking data-shape changes should.

### Optional Remote Sync Adapter

The app does not bind to a specific remote storage provider. A host can inject a minimal `driveStorage` adapter so the app can sync the full workspace snapshot to a remote JSON file owned by that host.

By default, the sync entry is enabled when the URL includes `?sync=1`, or when the browser already remembers a synced file; the host must also provide the `driveStorage` API, otherwise the entry stays hidden. Deployments can disable it completely with an environment variable:

```bash
VITE_DRIVE_STORAGE_EXPOSURE=url   # default: URL parameter, or a remembered sync file
VITE_DRIVE_STORAGE_EXPOSURE=off   # disable completely
```

The host should provide `window.driveStorage`, or make `/drive-storage/driveStorage.js` provide it after loading. The app locates the sync file by `name + appProperties.appId`; if multiple files match, the host should throw `DriveStorageAmbiguousFileError`. Minimal interface:

```ts
type DriveStorageApi = {
  status(): { configured?: boolean; connected?: boolean };
  isConfigured?(): boolean;
  connect(options?: { prompt?: '' | 'consent' | 'select_account' }): Promise<unknown>;
  disconnect?(options?: { revoke?: boolean }): Promise<unknown>;
  getFile(fileIdOrLocator: string | DriveFileLocator): Promise<DriveFileRecord>;
  findFile(locator: DriveFileLocator): Promise<DriveFileRecord | null>;
  createFile(options: DriveCreateFileOptions): Promise<DriveFileRecord>;
  readJson<T = unknown>(fileIdOrLocator: string | DriveFileLocator): Promise<T>;
  writeJson(fileIdOrLocator: string | DriveFileLocator, data: unknown, options?: { space?: number; mimeType?: string; appProperties?: Record<string, string> }): Promise<DriveFileRecord>;
  DriveStorageConflictError?: new (message: string, details?: { remote?: unknown; local?: unknown }) => Error;
};

type DriveFileLocator = {
  id?: string;
  name?: string;
  mimeType?: string;
  appProperties?: Record<string, string>;
};

type DriveFileRecord = {
  id: string;
  name: string | null;
  mimeType: string | null;
  modifiedTime: string | null;
  version: string | null;
  appProperties: Record<string, string>;
  webViewLink: string | null;
  canEdit: boolean | null;
};

type DriveCreateFileOptions = {
  name: string;
  mimeType?: string;
  appProperties?: Record<string, string>;
  content?: string | Blob | ArrayBuffer;
};
```

On first sync, the app searches for a remote file with `name = "plan-gacha.state.json"` and `appProperties.appId = "plan-gacha"`. Empty local state pulls remote automatically; non-empty local state asks for confirmation; a new file is created only when no remote file is found.

Before saving, the app compares the locally remembered Drive `version` with the current remote `version` as a coarse conflict check. Since `driveStorage` no longer provides a content fingerprint, content equality is checked only when first locating an existing remote file, using stable JSON comparison.

On conflict, the UI offers three actions: pull remote over local, overwrite remote with local, or try automatic merge. Automatic merge only supports complete sync files for the current `appSchemaVersion`; schema mismatch, incomplete remote format, or two-sided edits to the same trip/plan/date/checklist item cause merge to fail with a reason.

### Local Development

```bash
npm install
npm run dev
```

Default dev URL:

```text
http://127.0.0.1:5173/
```

### Validate And Build

```bash
npm run lint
npm run build
```

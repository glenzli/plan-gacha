# 行程扭蛋 / Plan Gacha

[中文](#中文) · [English](#english)

![行程扭蛋](docs/banner.png)

---

<a id="中文"></a>

## 中文

> **开发预览。** 当前数据格式和交互仍可能调整。数据默认保存在当前浏览器，请为重要行程保留 JSON 备份。

行程扭蛋是一个旅行日程工具。出发前可以准备正式、备用、雨天或跨城计划；旅行中再根据日期、天气、预约和实际执行情况调整每天的安排。

网页是可独立使用的前端应用；仓库同时提供共用规划核心、离线操作员 CLI/library 和四个无状态 MCP 工具。没有内置账号或远端写入服务，部署环境可提供可选的远端 JSON 存储适配器。

### AI 操作员入口

聊天中的 AI 可通过 `tripctl` 读取权威行程、检查约束、排序、生成变更预览，再由既有存储流程保存。新增 `schema`、结构化 stdin 和 `context` 入口；按日关闭/重开会影响现有规则，旧证据不能覆盖较新的日期状态。原计划、当前安排与实际执行分别保存。决策事项可明确完成、撤回或重开；完成后停止待办/截止提示，重开会恢复，旧证据不能覆盖较新状态。事项完成不等于订单退款已核实。条件方案现按明确的计划/日期关联共用排除与完成规则：受阻方案保留在历史，无法关联的旧文字单列待评估；旧日期排除不会禁用同地点的新日期，持票也不代表景区开放。候选排序不等于可直接应用，截止时间也不会自动创建提醒或取消订单。

具体分工、可重复合成演示和未解决边界见 [操作员流程](docs/operator-flow.md)、[CLI 文档](docs/tripctl.md) 和 [操作员 skill](skills/plan-gacha-operator/SKILL.md)。父层助手可以代用户处理 JSON，但浏览器数据仍需明确交接；工具不会自动读取网页 localStorage，也未新增地图权限、天气服务权限或有状态 MCP。

助手收到目的地意向或当天/次日安排后，应在同轮主动核查开放、票价分项、是否预约、当天能否购买，以及必须提前办理的时间和截止时间。每项明确回答“需要 / 不需要 / 尚未核实”，附来源与查询时间；硬期限优先告知，未知不说成无需。已有票也要核对开放与预约。这是操作员执行流程，查询依赖宿主现有工具，不会自动购票或新建定时任务，见 [主动信息核查契约](docs/agent-linkage.md#意向立即触发信息核查)。

历史保留以当前安排、明确实际报告、地点住宿、体验和关键变更/否决理由为主。`history-maintenance` 已可只读展示“旧普通调整合并摘要 + 最近20笔完整恢复”的效果；本轮不删历史、不写真实记录、不增加备份，见 [整理预览](docs/history-maintenance.md)。

### 经验复盘与攻略草稿

助手可以把亲历观察、调整理由、实际结果和用户评价关联到已有 facts/history，在以后规划时按主题或关键词检索明确提供的旧行程。外部攻略与亲历分开，天气、节日排队、预约等会提示重新核查，不自动变成永久偏好。攻略草稿只采用单独撰写的经验摘要，默认省略原始订单、联系方式和私密住宿信息，仍需用户审阅；导出不会公开分享。见 [复盘闭环与边界](docs/experience-review.md)。

历史归档可用专用 `import_history` 将旧每日评价、节点结果、地点反馈和总结导入经验索引，原始字段和来源完整保留，归档和计划保护不变，重复导入不重复记录。日本当地日期时刻先保留 `Asia/Tokyo` 原样，不转为上海时间；typed itinerary 仍限上海时区。攻略明确 `anonymized:false`，可提供只读 `lessonDrafts`，仍需用户审阅。见 [历史导入契约](docs/history-import.md)。

### 当前能力

- **行程与日程**：管理多个旅行、住宿、每日安排和候选计划；移动端与桌面端使用不同的日程布局。
- **计划调整**：按可用日期、闭馆或不可用日期、天气、必去项和已有安排给出提示；移动或清空其他日期前会展示影响。
- **天气**：通过 [Open-Meteo](https://open-meteo.com/) 查询计划地点的天气，并在浏览器中缓存结果。天气风险用于提示，不代替用户决定。
- **地图链接**：中国大陆默认高德，可在设置中改用百度；其他地区和地区不明使用 Google。路线图标按 `preferred_route_mode`（`walking`、`transit`、`driving`）打开所选地图，菜单可选中国大陆另一家地图。高德需要前后站的精确地点坐标；百度可按名称规划。驾车路段可提供必经点，高德链接支持 1 个，Google 链接支持最多 3 个；百度调起链接不支持必经点时不会生成忽略必经点的路线。住宿可按名称和地址打开地图搜索。地图跳转无需 API Key。
- **旅行记录**：记录未去的日期或地点、地点黑名单、每日评价和归档摘要；已归档旅行可继续补写每日评价、旅行总结和开销，行程安排保持只读，也可恢复。
- **清单与 JSON**：维护独立旅行清单，一键切换全部或仅看仍需处理的未完成项，排除“本次不需要”；旅行和清单分别支持 JSON 导入、导出，清单导入可以替换或合并。
- **外部 AI 配合**：根据当前行程生成提示词，供用户复制到外部 AI；AI 返回的 JSON 仍由用户粘贴并确认应用。应用本身不调用通用 AI API。
- **旅途编辑**：直接修改节点时间、地点、交通和备注，调整节点顺序；行程内容与安排限制共用草稿并统一保存。单计划 AI 结果先预览再保存，关闭未保存的编辑会提醒。
- **界面**：提供中文和英文界面，并包含 PWA `standalone` 安装信息。

### 当前边界

- 本地数据保存在 `localStorage`。不同浏览器、设备和 origin（例如 `127.0.0.1` 与 `localhost`）之间不会自动共享。
- 旅行导出包含行程、计划、住宿和旅行记录，不包含独立旅行清单与天气缓存；清单需要单独导出。
- 天气查询依赖地点信息与 Open-Meteo 服务。地点不明确或网络不可用时，查询可能失败。
- 地图服务偏好只保存在当前浏览器，不包含在旅行导出或远端同步中。`location.map_point` 可明确标记为 `GCJ-02` 或 `WGS84`；中国大陆显式 WGS84 地点坐标会在本地近似转换为高德坐标，天气区域坐标不会被转换为导航地点。地图搜索不会自动确认 POI 或回填坐标。高德和百度网页都可能要求滑块验证；高德手机端链接会尝试调起 App。
- 远端同步不是默认后端能力；只有部署宿主提供兼容的 `driveStorage` API 后才可使用。
- PWA 当前只提供可安装的 `standalone` 展示，没有 Service Worker 或离线缓存。

### 基本使用

1. 新建旅行，设置出发日期和天数。
2. 手工导入 JSON、载入示例，或把应用生成的提示词交给外部 AI，建立候选计划。
3. 填写住宿、预约和日期限制，再把计划安排到具体日期。
4. 旅行中根据天气和实际情况调整安排，并在结束后记录结果或归档。

### 可选远端存储

默认构建只会在 URL 带 `?sync=1`，或浏览器已经记录过同步文件时尝试显示同步入口。宿主还必须实际提供 `driveStorage` API，否则入口不会出现。

```bash
VITE_DRIVE_STORAGE_EXPOSURE=url  # 默认行为
VITE_DRIVE_STORAGE_EXPOSURE=off  # 完全关闭入口
```

适配器负责连接远端存储，并创建、查找、读取和写入 JSON 文件。类型约定见 [`src/types/driveStorage.ts`](src/types/driveStorage.ts)。天气缓存不会写入远端同步文件。

同步服务未加载或宿主未配置时，可以重新检测、重新加载站点或导出完整本地工作区备份，无需清除浏览器数据。宿主缺少配置需要由站点维护者修复；重新检测只检查服务状态，不会登录或写入远端文件。工作区备份包含所有旅行和独立清单，使用完整同步快照格式，与单独的旅行/清单导出不同。

### 本地开发

```bash
npm install
npm run dev
```

默认开发地址是 `http://127.0.0.1:5173/`。可安装 PWA 需要 HTTPS；浏览器通常也允许在 `localhost` 下安装。

提交前可运行：

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

---

<a id="english"></a>

## English

> **Development preview.** Data formats and interactions may still change. Data is stored in the current browser by default, so keep JSON backups of important trips.

Plan Gacha is a travel itinerary tool. You can prepare primary, backup, rainy-day, or cross-city plans before departure, then adjust each day according to dates, weather, reservations, and what actually happened.

The browser is a standalone frontend. This repository also provides its shared planning core, an offline operator CLI/library and four stateless MCP tools. There is no built-in account system or remote write service; a deployment host may provide an optional JSON storage adapter.

An assistant can discover schemas, pass JSON over stdin, inspect compact context and preview dated closures/reopenings before guarded persistence. Decision matters have explicit completion, withdrawal and reopening: closed matters stop prompting, reopening restores applicable deadlines, and older evidence is refused. Matter completion never certifies an order cancellation or refund. Conditional options now share dated plan and completion constraints through explicit bindings: blocked branches stay in history, unbound legacy prose stays unassessed, and excluding one date does not ban later dates at the same place. A held ticket does not prove opening. Baseline/current/actual remain separate; candidate ranking does not establish application permission or real-world feasibility. See [operator flow](docs/operator-flow.md) for the reproducible synthetic demo and tool/skill/data/storage/notification boundaries. Browser data still needs an explicit handoff; this adds no map permissions, stateful MCP or automatic reminder service.

On a destination intent or a new arrangement, the operator immediately checks opening, itemized prices, reservations, same-day sales and advance/cutoff requirements. It explicitly reports required, not required or unverified for every item, cites sources and lookup times, and puts hard deadlines first. These are host research steps; no ticket purchase or new scheduled task is automatic. [The operator contract](docs/agent-linkage.md#意向立即触发信息核查) maps results and unknowns to existing evidence, facts, issues and decision deadlines.

`history-maintenance` previews keeping current arrangements, explicit actual reports, place/lodging identity, experiences and key reasons, grouping older routine adjustments while retaining the latest 20 full changes for recovery. It is a read-only dry-run: no history is removed and no extra backups are created. See [retention rules](docs/history-maintenance.md).

The optional [experience-review loop](docs/experience-review.md) links observations, adjustment history and reported outcomes in existing facts. Read-only search uses explicitly supplied journeys; external guides remain distinct from firsthand reports and temporary conditions require rechecking. Dedicated guide lessons can be exported for user review with private fields omitted by default. Export does not publish or share.

### Available in the current build

- **Trips and schedules**: manage multiple trips, lodgings, daily assignments, and candidate plans, with layouts for both mobile and desktop.
- **Schedule changes**: show notices for allowed or unavailable dates, closures, weather, must-go items, and existing assignments; preview affected dates before moving or clearing plans.
- **Weather**: query plan locations through [Open-Meteo](https://open-meteo.com/) and cache results in the browser. Weather risk is advisory and does not replace user decisions.
- **Map links**: AMap is the default in mainland China, with Baidu Maps as an option; other and unknown regions use Google Maps. Route links use the planned transport mode. AMap requires exact place coordinates, while Baidu can route by place name. Driving transfers can specify a required waypoint: AMap URLs support one and Google Maps URLs support up to three; unsupported links are withheld rather than dropping required waypoints. Map links need no API key.
- **Trip records**: record skipped days or stops, place blacklists, daily reviews, and archive summaries; archived trips allow later edits to reviews, summaries, and expenses while the itinerary stays read-only, and can be restored.
- **Checklist and JSON**: maintain a separate travel checklist and switch between all items and items still to do, excluding skipped items; trips and checklists have separate JSON import and export flows, and checklist import can replace or merge data.
- **External AI workflow**: generate prompts from the current trip for use with an external AI, then paste and confirm the returned JSON. The application does not call a general-purpose AI API itself.
- **Editing on the trip**: edit stop times, places, transport, notes, and order directly. Itinerary content and constraints share one draft and save together. Single-plan AI responses are previewed before saving, with a reminder before leaving unsaved edits.
- **Interface**: provide Chinese and English UI, together with PWA `standalone` installation metadata.

### Current boundaries

- Local data is stored in `localStorage`. Browsers, devices, and origins such as `127.0.0.1` and `localhost` do not share it automatically.
- Trip exports include itineraries, plans, lodgings, and trip records. They exclude the standalone checklist and weather cache; export the checklist separately.
- Weather lookup depends on location data and the Open-Meteo service. It can fail when a location is ambiguous or the network is unavailable.
- Map preferences stay in this browser and are not included in trip export or remote sync. `location.map_point` accepts explicitly labeled `GCJ-02` or `WGS84` place points. Explicit mainland WGS84 place points receive an approximate local conversion for AMap; weather-area coordinates are never treated as navigation points. Map searches do not confirm an exact POI or fill in coordinates. AMap and Baidu websites may require slider verification, while AMap mobile links try to open its app.
- Remote sync is not a built-in backend. It is available only when the deployment host provides a compatible `driveStorage` API.
- The PWA currently provides installable `standalone` presentation only. It has no Service Worker or offline cache.

### Basic use

1. Create a trip and set its start date and duration.
2. Import JSON, load the example, or send an application-generated prompt to an external AI to create candidate plans.
3. Add lodgings, reservations, and date limits, then assign plans to dates.
4. Adjust the schedule during the trip, record outcomes, and archive the trip when it is complete.

### Optional remote storage

The default build attempts to show the sync entry only when the URL includes `?sync=1`, or when the browser already remembers a sync file. The host must also provide the `driveStorage` API; otherwise the entry remains hidden.

```bash
VITE_DRIVE_STORAGE_EXPOSURE=url  # default behavior
VITE_DRIVE_STORAGE_EXPOSURE=off  # disable the entry
```

The adapter connects to remote storage and creates, finds, reads, and writes JSON files. See [`src/types/driveStorage.ts`](src/types/driveStorage.ts) for the type contract. Weather cache data is not included in remote sync files.

If the service fails to load or the host is not configured, you can check again, reload the site, or export a complete local workspace backup without clearing browser data. Missing host configuration needs a site maintainer to fix it. Checking again only checks service status; it does not sign in or write remote files. Workspace backups include every trip and the separate checklist in the full sync snapshot format, which differs from individual trip/checklist exports.

### Local development

```bash
npm install
npm run dev
```

The default development URL is `http://127.0.0.1:5173/`. PWA installation requires HTTPS, although browsers generally allow installation from `localhost` during development.

Run the repository checks before submitting changes:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## AI 操作员工具 / AI operator tool

可移植 `tripctl` 让 AI 读取同一旅程、校验并预览修改、保存版本、记录问题与依据、查看历史和撤销。`npm run tripctl:build` 生成无需安装依赖的 Node 运行包；`npm run tripctl:verify` 用合成行程验证跨进程保存、并发版本冲突、幂等和恢复。参见 [运行及持久备份说明](docs/tripctl.md)。临时云目录只作工作副本，持久源需由父操作员实际完成带版本守卫的备份；成功前不声称改好。

The portable `tripctl` shares the planning core and keeps explicit journey memory, issues, revisions and undo history. Build with `npm run tripctl:build`, then run its dependency-free Node verifier with `npm run tripctl:verify`. See [operator and durable-backup instructions](docs/tripctl.md). A temporary cloud filesystem needs an acknowledged persistent backup before reporting a saved change. The optional stateless [MCP and web handoff](docs/planning-tools.md) remain available.

### Archived feedback import

Explicit `import_history` indexes the four legacy review categories into existing facts while retaining source JSON, timezone and archived planning guards. Reimports deduplicate stable source identities. Japanese dates/times remain Asia/Tokyo legacy values, unconverted; typed itinerary still supports Shanghai only. Request-only guide `lessonDrafts` never publish or save, and `anonymized:false` explicitly requires user review. See [the history import contract](docs/history-import.md).

Agent 联动原型 v10：外部证据→影响/问题/版本化预览，提醒 intent/readback 对账（无真实发送），私有只读按日投影及显式旧数据绑定。见 [契约与合成演示](docs/agent-linkage.md)。

当日路线可用 `set_day_route` 按稳定活动引用确认顺序、actual/planned/skipped 与住宿 nightDate；独立 planningEstimate 保存交通/观景区间及来源，未知实际时刻不妨碍保留规划。agent 每次新消息应规整有效路线和反馈，见联动契约。

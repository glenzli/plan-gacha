# 行程扭蛋 / Plan Gacha

[中文](#中文) · [English](#english)

![行程扭蛋](docs/banner.png)

---

<a id="中文"></a>

## 中文

> **开发预览。** 当前数据格式和交互仍可能调整。数据默认保存在当前浏览器，请为重要行程保留 JSON 备份。

行程扭蛋是一个旅行日程工具。出发前可以准备正式、备用、雨天或跨城计划；旅行中再根据日期、天气、预约和实际执行情况调整每天的安排。

当前版本是纯前端应用，不包含账号和后端服务。它可以独立使用，也可以由部署环境提供可选的远端 JSON 存储适配器。

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

The current version is a frontend-only application with no account system or backend service. It can run on its own, while a deployment host may provide an optional remote JSON storage adapter.

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

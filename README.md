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
- **旅行记录**：记录未去的日期或地点、地点黑名单、每日评价和归档摘要；已归档旅行可以只读查看或恢复。
- **清单与 JSON**：维护独立旅行清单；旅行和清单分别支持 JSON 导入、导出，清单导入可以替换或合并。
- **外部 AI 配合**：根据当前行程生成提示词，供用户复制到外部 AI；AI 返回的 JSON 仍由用户粘贴并确认应用。应用本身不调用通用 AI API。
- **界面**：提供中文和英文界面，并包含 PWA `standalone` 安装信息。

### 当前边界

- 本地数据保存在 `localStorage`。不同浏览器、设备和 origin（例如 `127.0.0.1` 与 `localhost`）之间不会自动共享。
- 旅行导出包含行程、计划、住宿和旅行记录，不包含独立旅行清单与天气缓存；清单需要单独导出。
- 天气查询依赖地点信息与 Open-Meteo 服务。地点不明确或网络不可用时，查询可能失败。
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
- **Trip records**: record skipped days or stops, place blacklists, daily reviews, and archive summaries; archived trips can be viewed read-only or restored.
- **Checklist and JSON**: maintain a separate travel checklist; trips and checklists have separate JSON import and export flows, and checklist import can replace or merge data.
- **External AI workflow**: generate prompts from the current trip for use with an external AI, then paste and confirm the returned JSON. The application does not call a general-purpose AI API itself.
- **Interface**: provide Chinese and English UI, together with PWA `standalone` installation metadata.

### Current boundaries

- Local data is stored in `localStorage`. Browsers, devices, and origins such as `127.0.0.1` and `localhost` do not share it automatically.
- Trip exports include itineraries, plans, lodgings, and trip records. They exclude the standalone checklist and weather cache; export the checklist separately.
- Weather lookup depends on location data and the Open-Meteo service. It can fail when a location is ambiguous or the network is unavailable.
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

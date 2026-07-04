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

- 多旅行计划管理：可以新建、删除、导入、导出，也可以从示例快速体验完整能力。
- 每日行程视图：移动端提供日期导航，桌面端提供左侧日期列表和中间详情。
- 候选计划池：每个计划可以包含多个地点、多个时间点、跨城市安排、提醒、tips 和预约订票信息。
- 天气联动：按计划中的城市、区县或坐标自动查询 Open-Meteo 天气，并基于计划规则判断是否适合。
- 约束判断：支持可去日期、不可用日期、天气黑名单、推荐天气、必去标记和已安排日期。
- 冲突提示：选择某个计划前会评估它是否会影响后续安排，并把需要调整的天数留给用户重新决定。
- 预约订票：可以记录预约/门票状态、地址、链接和退改链接，状态由用户手动更新。
- 多语言：支持中文和英文，可通过 `?lang=zh` 或 `?lang=en` 切换。

### AI 工作流

应用不直接接入通用 AI API，也不会把数据自动发送到第三方。旅行计划通常需要 AI 产品侧的一整套工具支持，例如地图、搜索和位置理解；如果只接入裸模型 API，效果反而容易变差。作为计划工具，行程扭蛋也没有必要内建一套复杂的 AI 周边体系。

当前 AI 相关功能采用「复制提示词 -> 外部 AI 生成 -> 粘贴 JSON」的方式：

- `AI 生成计划池`：适合从空计划开始生成完整计划，或给已有行程补充候选方案。
- `AI 编辑单项`：适合新增或修改一个具体计划。
- `AI 重排`：适合旅行途中根据剩余天数、天气和已去项目重新安排。

未来更自然的方向，可能是把行程扭蛋作为服务能力提供给 AI 侧，让用户直接从 AI 产品中使用。

### 天气数据

天气查询使用免费的 [Open-Meteo](https://open-meteo.com/) 接口。应用会按地点和日期做本地缓存，避免短时间内重复请求同一个城市/区县的天气。

为了提升成功率，计划里的地点建议包含城市、区县或坐标；展示时可以只显示具体地点，但天气查询会优先使用更稳定的查询位置。

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

- Multi-trip management: create, delete, import and export trips, or load an example to explore the full feature set.
- Daily itinerary view: mobile has compact date navigation; desktop has a left date list and central detail view.
- Candidate plan pool: each plan can include multiple places, timed stops, cross-city routes, reminders, tips, reservations and tickets.
- Weather linkage: automatically checks Open-Meteo weather by city, district or coordinates, then evaluates plan suitability.
- Constraint checks: supports allowed dates, unavailable dates, weather blocks, preferred weather, must-go flags and assigned dates.
- Conflict preview: before selecting a plan, the app checks whether it affects later days and leaves impacted dates for the user to replan.
- Booking and tickets: record status, address, links and cancellation/change links; status updates remain manual.
- Multilingual UI: supports Chinese and English through `?lang=zh` or `?lang=en`.

### AI Workflow

The app does not directly call a general-purpose AI API, and it does not automatically send data to third parties. Travel planning usually depends on the broader tool stack inside AI products, such as maps, search and location understanding. Connecting only a bare model API can produce a weaker result, while rebuilding that surrounding system is unnecessary for a planning tool.

Current AI features use a copy-prompt, external-AI, paste-JSON workflow:

- `AI Generate Plan Pool`: create a full plan from an empty trip, or add candidates to an existing trip.
- `AI Edit Single Plan`: add or modify one concrete plan.
- `AI Replan`: rearrange the remaining trip based on remaining days, weather and completed plans.

A more natural future direction may be to expose Plan Gacha as a service that users can access directly from AI products.

### Weather Data

Weather lookup uses the free [Open-Meteo](https://open-meteo.com/) API. The app caches weather locally by location and date range to avoid repeated short-interval requests for the same city or district.

For better lookup reliability, each plan should include a city, district or coordinates. The UI can still display the specific place, while weather lookup uses the more stable location metadata.

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

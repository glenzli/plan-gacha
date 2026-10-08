# 行程扭蛋 / Plan Gacha

[中文](#中文) · [English](#english)

![行程扭蛋](docs/banner.png)

---

<a id="中文"></a>

## 中文

Plan Gacha 是以 AI 为操作主体的旅行规划与记录组件。AI 助手在对话中理解出行意图、核查信息、提出调整并解释结果；组件提供行程状态、规则校验、变更预览、保存与历史恢复。

### 从 App 到 Component

**改造声明 · 2026-10-08**

早期的主要形态是独立旅行 App：用户在网页中准备候选计划、分配日期、查看天气和调整安排，AI 主要辅助生成可导入的 JSON。现在，旅行工作流主要由对话中的 AI 助手组织。用户表达意图、补充条件和报告变化，助手读取行程、核查信息、调用组件完成授权范围内的修改，并解释结果与未解决问题。

项目继续维护和演进，重心转向可被 AI 调用的行程状态、规则与操作。需要持续保留的约束、承诺、证据、决定、变更理由和实际反馈保存在同一行程中，为之后的调整和复盘提供依据。

现有独立网页版随此次改造退役，不再作为当前产品入口或独立产品继续演进。原网页版以 `legacy-web-final` 留档，网页源码与专属依赖从 `main` 移除。组件继续提供只读展示接口，由宿主页面或报告呈现权威行程的衍生视图；数据交接与保存由相应宿主处理。

### 运作方式

| 部分 | 职责 |
| --- | --- |
| AI 助手与宿主 | 理解用户意图，核查外部信息，选择操作，解释取舍；通过宿主已有工具访问私有数据、外部服务和存储。 |
| 行程核心 | 校验结构化输入、日期与约束，分析候选和影响，生成变更预览，维护版本、来源与历史。 |
| 权威存储 | 本地行程文件使用锁和版本校验保存；Library 等外部存储由宿主对同一文件执行版本校验替换，并读回确认。 |
| 宿主展示接口 | 输出带来源版本的行程、历史路线与住宿展示数据；由宿主呈现结果和确认流程。 |

一次行程操作通常按以下流程完成：

1. 宿主读取同一权威行程的最新版本，AI 查看当前安排、已做决定、实际报告与未解决问题。
2. 收到目的地意向或新的安排时，AI 主动核查开放、分项价格、预约、当天售票、提前办理与截止时间，附来源和查询时间；未核实的项目明确保留为未知。
3. AI 将意图转为明确的操作，调用核心分析和预览，查看受影响的活动、预约、住宿、约束和备选。
4. 在用户授权范围内保存：本地文件使用 `apply`；外部存储使用 `stage` 生成候选，由宿主完成同一文件的版本校验替换。保存后读回核对。
5. 向用户说明结果和仍需处理的问题；旅行中的反馈与实际变化继续进入同一行程，供后续调整和复盘使用。

组件不内置通用 AI 模型。自然语言理解、研究和工具编排由宿主中的 AI 助手承担，规则与状态由代码处理。具体流程见 [操作员契约](docs/operator-flow.md)。

### 组件提供什么

- **结构化行程**：分别保存原始计划 `baseline`、当前安排 `current` 和用户报告的实际执行 `actual`；支持活动增删、移动、重排及时间和地点修改。旧数据需要显式导入或关联。
- **约束与受保护修改**：共用日期、闭馆、冲突、天气和候选规则；保护已订、锁定、已确认或已完成的安排。条件方案按明确的计划与日期关联评估，未知项和失效方案保留原因。
- **有来源的记录**：保存事实、偏好、外部观测、承诺、决定和未解决问题，区分预测、正式信息与实际报告；外部观测按日期、地点、内容关联及有效期检查。
- **历史与恢复**：修改带版本、预览标识、幂等回执和理由；支持最新修改的撤销、存储格式迁移，以及显式采用可恢复的历史 checkpoint。整理报告本身只读，更早的完整状态可能需要先前版本。
- **经验复盘**：将亲历观察、调整理由、结果和评价关联到原行程与历史，在明确提供的旧行程中按主题或关键词检索，并生成需要审阅的攻略草稿。
- **只读展示**：从同一行程派生按日组织的内容、有效与历史路线、按住宿夜晚组织的安排及旅行摘要，供宿主页面或报告使用。

### 接入与运行

| 入口 | 当前用途 |
| --- | --- |
| `tripctl` CLI | AI 操作员的完整行程入口，支持 schema 发现、读取、分析、预览、保存和恢复。 |
| `tripctl-lib.mjs` / [`src/tripctl/index.ts`](src/tripctl/index.ts) | 直接调用同一核心、schema、文件存储与展示接口。 |
| [操作员 skill](skills/plan-gacha-operator/SKILL.md) | 约定意图解释、主动核查、来源与不确定性、保存和读回流程。 |
| stdio MCP | 四个无状态 snapshot 工具：`get_context`、`evaluate_plan`、`rank_candidates`、`preview_changes`。调用者提供数据，工具返回分析或候选，不写入行程。 |

源码调用需要 Node.js >=22.13。以下示例使用仓库中的合成数据，在新的临时目录创建演示行程：

```bash
npm install
npm run tripctl -- schema

TRIP_DEMO_DIR=$(mktemp -d)
npm run tripctl -- init --store "$TRIP_DEMO_DIR/journey.json" --input fixtures/planning-tools.snapshot.json
npm run tripctl -- context --store "$TRIP_DEMO_DIR/journey.json" --as-of 2026-10-10T08:00:00+08:00 --date 2026-10-11
npm run tripctl -- verify --store "$TRIP_DEMO_DIR/journey.json"
```

构建便携 CLI/library：

```bash
npm run tripctl:build
node dist/tripctl/tripctl.mjs schema
```

`dist/tripctl` 包含运行文件、操作员 skill、契约文档和合成示例，运行时无需安装依赖。具体操作与保存流程见 [CLI 文档](docs/tripctl.md)。无状态 MCP 可用 `npm run mcp` 启动，接口说明见 [规划工具](docs/planning-tools.md)。

### 旧网页版退役与数据迁移

原 React 网页已退役。`legacy-web-final` 指向移除前的完整版本，包含网页源码、JSON 导入导出、浏览器存储与旧同步适配器。`main` 保留 AI 操作员、`tripctl` CLI/library、无状态 MCP 和共享行程规则。本次改造不调整现有部署。

旧数据默认保存在原浏览器与 origin 的 `localStorage` 中，CLI/MCP 不会自动读取。迁移前应在原环境导出旅行、独立清单或完整工作区备份。旅行导出不含独立清单与天气缓存；完整工作区备份包含所有旅行与清单。

将旧数据转入组件需要按实际 schema 显式准备输入、预览并保存，原始备份应保留。留档中的 `driveStorage` 适配器属于网页历史同步实现，与操作员的外部版本校验存储流程不同。

需要检查或运行旧网页时，可在独立目录检出留档：

```bash
git worktree add --detach ../plan-gacha-legacy-web legacy-web-final
cd ../plan-gacha-legacy-web
npm ci
npm run dev
```

新检出的网页不会自动读取原浏览器与 origin 的数据。`main` 的 `npm run build` 构建便携组件，`npm run tripctl:build` 是同一构建入口。

### 当前边界

- 外部信息查询依赖宿主已有工具和权限；核心离线运行，不隐式访问地图、天气、账户或订单。
- 规则分析和交通估计用于发现已知冲突及未知项，不能证明现实中的行程可行性。已有门票不代表景区开放，预约或计划记录不代表实际完成。
- 决策期限与提醒对账输出建议或操作描述；通知、购票、预订、取消及退款由宿主另行执行和核实。
- `stage` 只生成候选，不能据此声称外部保存成功。宿主展示是衍生视图，刷新与权威存储保存由宿主分别处理。
- 经验检索只处理明确提供的行程。攻略草稿不自动匿名化或公开发布，复用时仍需核对新的出行条件和易变信息。
- 数据格式与接口仍在演进；迁移、历史整理和旧数据关联需要显式操作，读取不会自动改写原数据。

### 进一步阅读

| 文档 | 内容 |
| --- | --- |
| [结构化行程](docs/itinerary-core.md) | 原计划、当前安排、实际报告、约束与证据。 |
| [Agent 联动](docs/agent-linkage.md) | 主动核查、外部观测、提醒对账与宿主保存流程。 |
| [展示契约](docs/presentation-contract.md) | 当前与历史视图、路线、住宿夜晚及来源版本。 |
| [经验复盘](docs/experience-review.md) / [历史导入](docs/history-import.md) | 亲历与外部攻略、旧评价导入和检索边界。 |
| [历史存储](docs/history-storage.md) / [整理与恢复](docs/history-maintenance.md) | 存储格式、容量、checkpoint 与恢复范围。 |
| [兼容演进记录](docs/planning-evolution.md) | 早期的设计选择与约束；涉及原网页扩展的选项保留为历史记录。 |

### 组件开发

仓库验证入口：

```bash
npm run typecheck
npm run lint
npm test
npm run tripctl:build
npm run tripctl:verify
```


---

<a id="english"></a>

## English

Plan Gacha is a component for travel planning and records, operated by an AI assistant. The assistant interprets travel intent, researches information, proposes changes and explains results in conversation. The component provides journey state, rule checks, change previews, persistence and history recovery.

### From App to Component

**Transition statement · 2026-10-08**

The earlier form was a standalone travel app: users prepared candidate plans, assigned dates, checked weather and adjusted schedules in the browser, with AI mainly helping generate JSON for import. The conversational assistant now organizes the travel workflow. Users express intent, supply conditions and report changes; the assistant reads the journey, researches information, invokes the component to make authorized changes, and explains results and open issues.

Development and maintenance continue, with the focus moving to journey state, rules and operations that AI can use. Constraints, commitments, evidence, decisions, change reasons and actual feedback stay in the same journey as a basis for later adjustment and review.

The standalone browser app is retired as part of this transition and will no longer evolve as the current product entry point or an independent product. It is archived at `legacy-web-final`; browser source and its dedicated dependencies are removed from `main`. The component continues to provide read-only views derived from the authoritative journey for host pages or reports. The corresponding host handles data handoff and persistence.

### How it works

| Part | Responsibility |
| --- | --- |
| AI assistant and host | Interpret intent, research external information, select operations and explain tradeoffs; use the host's existing tools to access private data, services and storage. |
| Journey core | Validate structured inputs, dates and constraints; assess candidates and effects; produce previews and maintain versions, sources and history. |
| Authoritative storage | Save local journey files with locking and version checks; let the host replace the same external Library file with a native version check and confirm the result by reading it back. |
| Host presentation interfaces | Supply journey, historical route and lodging views with source versions; let the host present results and handle confirmation. |

A typical operation follows this flow:

1. The host reads the latest version of the same authoritative journey. The assistant reviews current arrangements, decisions, actual reports and open issues.
2. A destination intent or new arrangement triggers research into opening, itemized prices, reservations, same-day sales, advance requirements and cutoffs, with sources and lookup times. Unverified items remain unknown.
3. The assistant creates an explicit operation, invokes analysis and preview, and reviews affected activities, reservations, lodging, constraints and alternatives.
4. Within the user's authorization, local files are saved through `apply`. For external storage, `stage` creates a candidate and the host performs a version-checked replacement of the same file. The result is read back and verified.
5. The assistant reports the result and remaining issues. Travel feedback and reported changes stay in the same journey for later adjustment and review.

The component does not embed a general AI model. The host's assistant handles language, research and orchestration; code handles rules and state. See the [operator contract](docs/operator-flow.md).

### What the component provides

- **Structured journeys**: separate the original `baseline`, planned `current` schedule and user-reported `actual` events; support activity insertion, removal, moves, reordering and time/location edits. Legacy data requires explicit import or binding.
- **Constraints and protected changes**: share date, closure, conflict, weather and candidate rules; protect booked, locked, confirmed or completed arrangements. Conditional options use explicit plan/date associations, with reasons retained for unknown or inactive branches.
- **Sourced records**: retain facts, preferences, observations, commitments, decisions and open issues; distinguish forecasts, final information and actual reports. Assess observations against their dates, places, content bindings and expiry.
- **History and recovery**: record versions, preview tokens, idempotent receipts and reasons; support undo of the latest change, storage migration and explicit adoption of recoverable history checkpoints. Maintenance reports are read-only; older full states may require a prior version.
- **Experience review**: link firsthand observations, change reasons, outcomes and evaluations to the original journey and history; search explicitly supplied journeys by topic or term and create guide drafts for review.
- **Read-only presentation**: derive daily content, effective and historical routes, night-dated lodging arrangements and trip summaries from the same journey for host pages or reports.

### Integration and use

| Entry point | Current role |
| --- | --- |
| `tripctl` CLI | The full journey interface for an AI operator: schema discovery, reading, analysis, preview, persistence and recovery. |
| `tripctl-lib.mjs` / [`src/tripctl/index.ts`](src/tripctl/index.ts) | Direct access to the same core, schemas, file store and presentation interfaces. |
| [Operator skill](skills/plan-gacha-operator/SKILL.md) | Intent handling, proactive research, sources, uncertainty, persistence and readback workflow. |
| stdio MCP | Four stateless snapshot tools: `get_context`, `evaluate_plan`, `rank_candidates`, `preview_changes`. The caller supplies data; tools return analysis or candidates without saving a journey. |

Source usage requires Node.js >=22.13. This example uses synthetic repository data and creates a demo journey in a new temporary directory:

```bash
npm install
npm run tripctl -- schema

TRIP_DEMO_DIR=$(mktemp -d)
npm run tripctl -- init --store "$TRIP_DEMO_DIR/journey.json" --input fixtures/planning-tools.snapshot.json
npm run tripctl -- context --store "$TRIP_DEMO_DIR/journey.json" --as-of 2026-10-10T08:00:00+08:00 --date 2026-10-11
npm run tripctl -- verify --store "$TRIP_DEMO_DIR/journey.json"
```

Build the portable CLI/library:

```bash
npm run tripctl:build
node dist/tripctl/tripctl.mjs schema
```

`dist/tripctl` includes the runtime files, operator skill, contracts and synthetic examples. Running it requires no dependency installation. See the [CLI documentation](docs/tripctl.md) for operations and persistence. Start the stateless MCP server with `npm run mcp`; its interfaces are documented in [planning tools](docs/planning-tools.md).

### Retired browser app and data migration

The React app is retired. `legacy-web-final` points to the complete version before removal, including browser source, JSON import/export, browser storage and legacy sync adapters. `main` retains the AI operator, `tripctl` CLI/library, stateless MCP and shared journey rules. This transition leaves the existing deployment unchanged.

Legacy data defaults to `localStorage` in the original browser and origin. CLI/MCP cannot read it automatically. Before migration, export trips, the separate checklist or a full workspace backup from that environment. Trip exports omit the checklist and weather cache; a workspace backup includes all trips and checklists.

Moving legacy data into the component requires explicitly preparing inputs against the actual schemas, previewing and saving them. Keep the original backup. The archived `driveStorage` adapter belongs to the browser's historical sync implementation and differs from the operator's external version-checked persistence flow.

To inspect or run the old browser app, check out the archive in a separate directory:

```bash
git worktree add --detach ../plan-gacha-legacy-web legacy-web-final
cd ../plan-gacha-legacy-web
npm ci
npm run dev
```

A fresh checkout cannot automatically access data from the original browser and origin. On `main`, `npm run build` produces the portable component; `npm run tripctl:build` invokes the same build.

### Current boundaries

- External research depends on the host's existing tools and permissions. The core runs offline without implicit access to maps, weather, accounts or orders.
- Rule analysis and transport estimates expose known conflicts and unknowns; they do not prove real-world feasibility. A ticket does not establish opening, and a reservation or plan record does not establish actual completion.
- Decision deadlines and reminder reconciliation return advisories or action descriptors. Notifications, purchases, reservations, cancellations and refunds require separate host execution and verification.
- `stage` creates a candidate; it does not establish successful external persistence. Host presentations are derived views; the host handles their refresh separately from authoritative persistence.
- Experience search processes explicitly supplied journeys only. Guide drafts are not automatically anonymized or published; reuse still requires checking new travel conditions and changing information.
- Formats and interfaces continue to evolve. Migration, history maintenance and legacy bindings require explicit operations; reading does not automatically rewrite existing data.

### Further reading

| Document | Content |
| --- | --- |
| [Structured itinerary](docs/itinerary-core.md) | Baseline, current schedule, actual reports, constraints and evidence. |
| [Agent linkage](docs/agent-linkage.md) | Proactive research, observations, reminder reconciliation and host persistence. |
| [Presentation contract](docs/presentation-contract.md) | Current/historical views, routes, lodging nights and source versions. |
| [Experience review](docs/experience-review.md) / [History import](docs/history-import.md) | Firsthand and external guidance, legacy feedback and retrieval limits. |
| [History storage](docs/history-storage.md) / [Maintenance and recovery](docs/history-maintenance.md) | Formats, capacity, checkpoints and recovery scope. |
| [Evolution record](docs/planning-evolution.md) | Earlier design choices and constraints; extensions of the original browser remain historical options. |

### Component development

Repository validation commands:

```bash
npm run typecheck
npm run lint
npm test
npm run tripctl:build
npm run tripctl:verify
```

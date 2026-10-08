# Agent 联动契约（core v10）

本模块在同一权威 journey 中追加 linkage 数据，提供无副作用分析、可审查变更和提醒对账描述。它不会查询天气、开放或交通提供方，不会创建真实提醒、修改票/酒店，也不会发布 Site。来源真实性、账号授权、地点匹配仍由宿主核实；不可把合成 fixture 当作实际观测。原 React 网页、本地离线存储与 Drive 同步实现已退役，留档于 `legacy-web-final`；本次不调整现有部署。旧 Drive 适配器不是原子 CAS 协同后端。

## 意向立即触发信息核查

收到目的地意向、备选或某日安排，就在同轮主动核查，不等用户另外问价格或预约。先依据当前上下文确定地点、当地日期和票种；能核的立即核，只有影响可靠答案的身份歧义才询问。日期或目的地变动后重查受影响项。这是宿主agent的研究流程；核心本身不会访问售票平台，也不会自动购票或创建新定时任务。

逐项向用户回答“需要 / 不需要 / 尚未核实”，不能漏项：

1. 开放、末班/最后入园、相关交通与区域限制。
2. 门票/成人价及优惠条件；观光车、游船、索道等分项价、套票包含和不包含项。未核价格不猜数字。
3. 是否必须预约、官方办理渠道；已有票或免费入园也不自动免预约。
4. 当天能否购买、配额或余票是否已核；允许当天销售不保证到达时仍有票。
5. 必须提前多久、开始售卖时间、预约/购票/付款/入园截止，明确当地时区；“建议提前”与“必须提前”分开。
6. 每项来源URL/reference、查询时间、已知发布/适用时间、适用地点/日期/票种；缺失、过期、冲突、工具失败等未核原因明确保留。

硬期限最先查询、最先告知，先说明何时之前必须做什么，再给简洁清单和下一步动作。查询无结果不等于无需预约，不把用户传闻、合成fixture或模型推测写成官方事实。本轮只在对话中主动告知；不借此购买、预约、创建reminder intent或派发新的任务。原已授权提醒仍走既有流程。

已有数据可承载，不新增业务模型：

| 核查结果 | 现有保存方式与边界 |
| --- | --- |
| 精确日期/地点的开放信息 | `record_observation` 的opening claim、scope/token、source.observedAt、publishedAt、expiresAt与unknown；只有有效明确整区官方关闭才可另行预览apply_observation，不能从票务规则推闭馆 |
| 分项价格、预约/当天售票/提前办理规则 | `fact` 的原文text + certainty + source，使用 `bind_context` 绑定日期与计划/活动；当前无结构化金额/票种/提前天数字段，也不会自动计价或验证库存 |
| 尚未核实或来源冲突 | `issue` 保持open并关联计划、需要时bind_context；保存查询失败/未核状态，不造已核事实或“无需预约” |
| 已核必须处理的截止 | `itinerary_decision_point` 的deadline + text/source，可关联条件option；`context`/`itinerary`给advisory，宿主把硬期限优先展示。它不会自动创建提醒、订单或购票 |
| 真实预约/订单和实际游玩 | 仅另据明确来源写commitment/booking或record_actual；规则查询不是已预约、支付、到达或完成的证据 |

source只有kind/reference/observedAt，发布/适用条件与票价分项放事实原文；opening观测另有publishedAt/expiry。不要向严格schema塞入不存在的price/bookingRequired字段。通过 `schema --operation TYPE` 发现入口，按正常preview/stage/同身份CAS/读回流程保存；没有写入授权时仅返回核查结果。缺核查仍应保持已有离线行程可读，不把候选称为已准备就绪。

## 最短可重复演示

便携包只需 Node >=22.13，无需安装依赖：
```sh
node verify.mjs
node tripctl.mjs schema
node tripctl.mjs schema --operation record_observation
node tripctl.mjs schema --operation bind_context
```
包内 agent-linkage-scenario.json、LINKAGE-DEMO.json、READONLY-DEMO.json 完全合成。verify.mjs 会用独立 CLI 进程演示 init → import/record → preview → stage（saved:false）→ apply → read/verify，并检查纯分析不改文件、预测不成为关闭、未知提醒不重发和只读投影来源版本。既有四个真实 stdio MCP 工具继续使用同一规划规则；这些新增有版本状态的操作通过 portable CLI/库调用，未声称已加入 MCP 或 browser WebMCP。

宿主逐轮流程：
1. materialize 唯一 current journey，记录其原生 Library 身份/版本及读取时间；不要另建权威副本。
2. `context --store journey.json --as-of ISO`，`schema --operation TYPE`。
3. 构造 operation；`preview --store journey.json --input operation.json --revision N`。
4. 用预览的 operation/revision/previewToken，加唯一 idempotencyKey、actor、reason、at 构造 mutation。
5. `stage --store journey.json --input mutation.json --output candidate.json` 仅生成候选，不证明远端保存。
6. 宿主经明确授权以同一 Library 身份和 expected native version 替换，读回验证 revision/hash/receipt。冲突重新读、重新预览；不得覆盖。只在本地文件是权威时使用 apply 的本地 CAS。
7. 所有外部提供方动作另走已授权适配器；本核心不执行。原生日志与发信/任务提供方不是一个事务。

## 外部观测

`record_observation` 需要稳定 id、publisherId、messageId、streamId；source.observedAt 是捕获时间，publishedAt 是来源发布时刻（未知填 null）。必须给 exact dateId、planId、标准化 planToken、place provider/ID/identity、whole_plan 或 part、expiry、confidence、basis、status、claim。若绑定活动，activityId/token 必须一起给出。先用 `observation-token --store journey.json --input {"planId":"..."}` 获取当前 token（CLI 的 --input 需文件或 -）。

同一 publisher/message/scope 重放不追加；更改同一消息内容报 observation_identity_conflict。stream 只绑定同一来源与精确日期/地点/活动。乱序按 publishedAt（缺失才用 observedAt）排序；同时间冲突为 unknown。纠正/撤回必须指明 supersedesId；旧记录保留，失败、过期和撤回都不会回退使用旧成功或自动重开已保存闭馆。

`evidence-impact --store journey.json --input query.json`，query=`{"asOf":"2033-10-03T18:01:00+08:00"}`。输出受影响日程、约束、备选、问题和 proposal。只有高置信、明确匹配、仍新鲜的 whole_plan official_final closure 可提出 apply_observation；预测、局部关闭、天气、交通仅供审查，不能自动推导整区关闭/分钟级可行性。apply_observation 与 set_plan_dates 共用单一闭馆数据和历史时间水位，保留日程及订单，保存时重查有效期。

例：前日17:52:50发布的“明日全区暂停预测”和“后日仅山顶车辆暂停、北区下部不受影响”是两个 exact-date scope。不能合并日期，不能将 prediction 改称 final，不能把局部停运扩成北区关闭。地点、团集合/结束时间、酒店身份未知时输出待补问题。

## 一次性提醒对账

v1 只支持既有 decisionPoint 的 decision_needed：选项选择有效后、事项完成/撤回或截止时间已过，不再创建催决策任务；这不证明订单取消、退款或其他行政事项已完成。日期来自 decision.deadline 或显式 dueAtOverride。任意活动提醒和新一轮任务暂未自动化。

- set_reminder_intent：稳定 id、decisionPointId、provider、accountRef、expectedVersion、标题/内容、Asia/Shanghai、显式 source。改变日期继续同一逻辑 id。
- set_reminder_status：显式 paused/active/withdrawn；人工 pause 不被内容更新解除。
- record_reminder_readback：**journeyId**、intentId、provider/account、精确 providerTaskId、观测配置、source/expiry。首次查无匹配任务使用 taskId:null + status:absent + correlation:{kind:"lookup"}，必须来自实际已授权查找；缺工具应 unknown 或保留未读取。
- 首次收编已有任务使用 correlation:{kind:"authorized_existing",authorization:显式用户来源}，不能根据同标题猜认。以后读已绑定任务用 bound_task。
- 创建/更新/暂停/取消的确认读回使用 correlation:{kind:"attempt",attemptId,actionKey}；必须核实提供方的原请求关联。相同配置不等于本次成功，没有可核关联就保持 unknown。
- reminder-reconcile 输入 {asOf}，只输出 descriptor。新的 begin_reminder_action 保存 attemptId/actionKey 和原 desiredHash；其 asOf 必须等于 mutation.at，重新预览临近保存时间。**只有新 attempt 经权威保存并读回，且外部动作另获授权后，宿主才可派发一次。** stage、validate-request、已有 attempt 或 replayed:true 不授予再次派发。
- resolve_reminder_attempt：unknown、not_applied、applied。超时/断线不能记 not_applied。applied 必须引用同旅程、原 attempt/actionKey、正确 providerTaskID 和旧 desired 配置的读回，再按当前 desired 对账。
- unknown attempt 不受新截止时间、pause、完成/撤回影响：先查明原结果，再更新/取消。远端 disabled 尊重暂停；已消失的已绑定任务不会自动重新创建。明确人工 resume 才允许重新启用尚存在任务。
- 未知结果、无读取工具、历史/容量满、状态冲突均阻止发送。没有 exactly-once 保证，且本包没有外部派发适配器。
- 普通 undo 不可删除 linkage 的尝试、回执、观察或绑定审计；使用显式纠正操作。已归档 journey 不允许这些写入。

## 私有只读 Site 投影

`readonly-view --store journey.json --input view-request.json`：
```json
{"asOf":"2033-10-03T18:01:00+08:00","generatedAt":"2033-10-03T18:02:00+08:00","source":{"libraryFileId":"caller-supplied-owned-current-ID","libraryVersion":7,"retrievedAt":"2033-10-03T18:00:00+08:00"}}
```
来源元数据由宿主提供，不代表核心独立核验。source.revision/stateHash 对应确切输入；asOf、generatedAt、sourceRetrievedAt 各自独立，providerSyncAt:null、automaticRefresh:false。Site 仅是衍生缓存，刷新/权限/发布由另一个宿主执行，不能声称实时同步。

首选消费 **organized**（organizationSchemaVersion:1）：
- days 按 trip date 输出 primary.activityRefs、alternativeRefs、backupActivityRefs、票/承诺/酒店、weather/evidence、facts/preferences/exclusions、待定问题引用。
- catalog 是记录的唯一展示定义；按引用渲染，不在多个历史卡片重复票、酒店或同一事实。一次票的数量仍取其已知结构数据/原文，核心不从“四票”等文本编造订单。
- 当前 facts 依据稳定 id 和明确 supersedesFactId 去掉旧纠正版；不扫 history 当当前记录。跨类别的文本相似不会自动合并预约和承诺。
- 日期候选、明确当前备选和真正已排主日程分别带 dateMeaning/role/scheduleApplied。即使缺计划活动绑定，已知 option 仍展示；inactiveAlternativeRefs 单列已失效/撤回分支。
- 旧 experience.eventDateId 会直接归到该日；缺 plan/activity 的仍可见且 gaps:missing_typed_link。没有任何日期的进 unplaced。偏好仅显示已记录偏好；排除按 this_journey / journey_date 限定，不推导永久拉黑。
- 旧天气数据按自带日期组织，freshness:not_validated；地点绑定不明不猜。当前观测按精确 scope 与 source/expiry展示。
- 不解析 source.currentPlanningState 或自由文本猜唯一状态，不隐藏已知备选。flat 字段保留兼容，UI 应选 organized 单一展示路径。

补旧数据关联用 **bind_context**，同样 preview/stage/CAS/readback：
```json
{"type":"bind_context","record":{"id":"explicit-backup-link","subjectType":"option","subjectId":"walking-backup","dateIds":["2033-10-05"],"planId":"walking-tour","role":"backup","source":{"kind":"synthetic","reference":"synthetic:explicit-user-backup-choice","observedAt":"2033-10-03T18:01:00+08:00"}}}
```
subjectType 可为 fact/preference/option/issue；activityId 需属于 plan。修正用新的 binding id 与更晚来源，保留旧绑定审计。这是显示关联，不改 option 原有可执行日期/requirements，不代表激活分支，也不补造集合时间或酒店身份。显示绑定的历史活动不会锁住当前活动编辑/删除；历史目标仍保留在目录并标 historical_activity_reference。显式新绑定作为整组关联，不混入旧 plan/activity 字段。无 typed itinerary 的旧 snapshot 备选也保留在 catalog.plans 和 unplaced.backupPlanRefs，不猜日期。复合引用逐段编码，合法冒号 ID 不碰撞。旧 v5–v9 状态无 linkage 字段仍原样可读，未自动迁移真实数据。

## 验证与边界

定向回归覆盖同输入同输出、来源消息重放、乱序/并列冲突、失败/过期/撤回、双向日期水位、未知 ID/地点内容更改、提醒跨旅程/账户/任务身份、未知派发结果和晚到成功、无期限暂停、已选分支失效、只读来源版本、备选不隐藏、旧事实按日期关联、显式绑定纠正、历史容量前置阻断。

提醒描述仍需要真正的宿主适配器和原生提供方关联查询。组织投影无法把旧自由文本自动变成可信订单或活动身份；需明确绑定。预测不会自动变成规则，天气/交通也未扩成通用交通约束求解器。

## 实际变更优先的有效日视图

`itinerary.current` 是最新保存的计划表，可能还未根据自然语言 actual 报告调整；不能据此称它为已经发生的安排。organized.days[].primary 是供显示的有效视图，其 basis 明示来源：

1. 结构化 skipped(activityId/dateId) 直接把对应旧活动放入 priorPlannedActivityRefs。
2. 已有 changed_plan/skipped 报告可用 `link_actual_change` 显式关联 previousActivityIds 和 replacementActivities；新活动用稳定新 ID、明确用户来源，未知时刻填 timing:{}。这是实际报告的结构化关联，不是重写全表，不产生重复 fact、不取消订单、不证明到达/完成。
3. 只有文字、还没有活动关联的 changed_plan 必须优先显示原始报告；basis=reported_change_needs_binding，旧计划置于 priorPlannedActivityRefs 作为待核历史，不自动从文字猜替代地点或时间。
4. 没有实际变更时 basis=current_planned_schedule，仍只代表计划。原 current/baseline、订单与历史完整保留。

`link_actual_change` record 包含 id、actualId、exact dateId、previousActivityIds、replacementActivities（空数组表示跳过）、source。来源需明确用户确认；旧活动必须属于该日的当前或历史计划。对同一 actualId 的关联纠正用新 id 和更晚 source，旧版本留审计；多个报告同时争用同一旧活动时投影保留待核，不任意取胜。

匿名 fixture 展示：旧 current 仍有 lake；actual 说下午改去 memorial。关联后 primary 仅引用 reported-memorial，lake 只出现在旧计划引用；纪念地 timing:{}，未推断到达/结束时间。Site 应消费 organized 有效视图，不再把 flat current 表无条件置顶。

带明确 activityId 的 changed_plan 只把该节点降为待核，不能隐藏同日其他已知安排；只有未指明活动的广义变更才保守折叠整张旧计划。primary.actualReportRefs 保留 started/finished/note 等全部当天已知实际报告。替代活动不凭数组位置推断时间顺序：activityRefsOrder=reported_order_unknown，reportedActivityRefs 单列，未知时刻仍为空。最小版实际替代路线只接受明确端点label，不接受未经行程校验的跨活动route IDs。

## 确认有序 daily route，而不是展示聊天记录

每次收到新消息，agent 应读取权威 journey → 抽取对路线/反馈的明确增量 → 查询可用地图交通证据 → 提出/更新结构化当日路线 → 走 preview/stage/CAS/readback。不要把所有信息堆入 note 后继续展示 baseline。保留原有游玩意图：景观公路是 route_scenery，需要交通时间再加观景/停留区间，不能当纯赶路。能先估的用显式 planning_assumption 区间，真正影响选择的起终点、集合/结束时间或酒店身份才形成具体问题。

`set_day_route` 仅更新一个 dateId 的有序条目，不重建全程。record={id,dateId,entries,source}；修正时读取最新记录、只调整受影响条目/顺序，保留其他条目，以新 id 和更晚 source 保存。

每个 entry：稳定 id；activity 引用 `{kind:"planned",planId,activityId}` 或 `{kind:"reported",actualId,activityId}`；status 为 actual/planned/skipped；purpose 为 default/scenic_route。核心保存来源活动快照，回溯不受未来标题/计划修改影响。新目的地/餐饮可先用 link_actual_change 建立结构活动；也可用原有 edit_itinerary 插入计划活动后引用。实际报告不需要复制成 fact。反馈用结构化 experience + bind_context；绑定实际新增节点可用 reportedActualId+activityId（与 planId 二选一）。

`timing` 是明确提供的时刻。实际条目缺它就 timing:{}，绝不能把旧计划时刻变成实际。`planningEstimate` 单列 `{durationMinutes:{min,max},travelMinutes?,stopMinutes?,method,source,asOf,expiresAt?,evidenceRefs,rationale}`：method=provider/user/planning_assumption；provider 需真实提供方来源和已保存证据引用，不能把模型假设冒充地图结果。若 travel 与 stop 同时给出，duration 的上下界分别等于两者相加。未知实际时刻不妨碍保留规划估计。地图读取失败要保留失败/unknown证据，可先用有解释的规划区间，不能伪造观测。

`evidenceRefs` 引用已有 map_fact / itinerary_evidence / observation 稳定 ID；每次使用核对路线绑定、日期、来源时刻与有效期。输出 estimateStatus 明示 missing/future/stale/planning_assumption/user_estimate/current_transport_estimate/unusable，不把估计当执行保证。缺交通区间会产生具体路线查询问题，缺酒店身份会指出对应晚次；别把“无数据”当作停止代理工作的理由。

住宿 entry 必须 nightDate===route.dateId；可带 canonical lodgingId。明确 checkIn/checkOut 或有效 reservations 控制酒店归属，次晚酒店不能因旧 schedule 指向而挂前日。冲突显式报 lodging_night_assignment_conflict。身份未知的住宿也可作为有序节点保留，具体询问酒店以便补最后一段车程。

Site 消费 days[].route.entryRefs → catalog.routeEntries；skippedEntryRefs 只进历史/跳过区域。每条有 position/type/status/timing/timingBasis/planningEstimate；路线赏景、meal、visit、lodging 按确认顺序显示，未知距离/时刻不臆造。旧计划在 priorPlannedActivityRefs，不再压过确认路线。新 actual 晚于确认路线时 needsReview:true/pendingActualReportRefs，保持路线可见，提示 agent 立即规整受影响节点。

fixture 的当前有效路线为景观自驾（含观景停留）→东北菜午餐→纪念地→当晚城市酒店；旧湖被明确 skipped。所有地点、估计区间、时间和住宿均为合成，仅用于验证结构契约，未调用真实地图。

provider估计仅在最新且唯一、匹配本日活动与当前内容token、live且成功未过期的transport证据支持下可用；最新失败不回退旧成功，fixture与开放公告不作交通时长来源。walking map_fact还核对精确起终点活动及内容绑定。交通范围必须与来源范围一致；观景stop始终标为explicit_planning_allowance。scenic缺少独立travel/stop区间会提出具体补估问题。住宿条目保留保存时的lodgingSnapshot并验证当晚，以便后来酒店资料修改仍可保留历史路线。

## 正式展示出口

`presentation-view` 提供schema可发现、运行时验证的presentationCatalog、historicalDailyRouteProjections和nightDatedLodgingArrangements，并区分当前权威文件与所选历史revision。父Site可直接消费这三个规范字段，完整领域详情继续用相同ref读取readonly-view。current仍等于baseline时，actual替代及确认路线也会优先；详见 [presentation-contract.md](presentation-contract.md)（便携PRESENTATION-CONTRACT.md），不再依赖未校验的source-adapter对象。


## v11：显式规整酒店、历史节点与旅行显示索引

`schema --operation reconcile_journey_context` 是一次受管、可预览的复合操作。可选组件按 displayMetadata → lodgings → routeActivities → dayRoutes 顺序在克隆内容中校验，全部成功才产生一个 history event。任一失败零写入。它不执行任意嵌套 operation、订单操作或远端派发。`validate-request` 返回**候选**的精确 writer 字节数与剩余容量；仍须 stage 成功后由宿主同 identity CAS、原生读回。16MiB/200 次上限未改变；接近上限时不要反复追加试验事件。

- `upsert_lodging_arrangements` 显式给 hotel ID、完整原始对象的 `expectedLodgingToken`（新建用 null）、名称/地点补丁、稳定 reservation ID、checkIn/checkOut、pending/booked/cancelled、原 commitmentIds 和来源。用导出的 `lodgingToken(rawHotel)` 或 CLI read 的原始对象计算 hash。按 [checkIn, checkOut) 展开晚次；状态仅为来源报告，付款/实际入住仍未知。原 commitment 文本不变；从不解析“Hotel A”这类自由文本自动建酒店。未提及的酒店/预订和 loose 扩展保留。日期/状态纠正须 reason 和更新的原始来源；酒店/预订来源历史水印在 undo 后仍生效。预订 ID 不能换酒店。已有精确坐标的局部地址变更拒绝，需另行解决完整地点绑定，避免旧坐标搭配新地址。
- `set_trip_display_metadata` 保存 versioned displayName/aliases/year/month/knownWindowStart/knownWindowEnd/source，expectedVersion 首次为 0。未知年月/窗口用 null。`trip-display` 导出一条对应 tripId 的命名记录，供宿主显式合并跨旅行索引。它不改 snapshot.trip.name、日程或稳定 ID；归档旅行也可独立修正及撤销显示元数据。
- `record_route_activity` 的 reported_activity 必须指向同日原 actualReportId（允许原 kind=note）；planned_target 只表示用户明确的计划目标。两者可以绑定过去日期和没有 typed day 的日期，独立 activity ID 不进入 current/baseline/registeredActivityIds。纠正用新 record ID + supersedesId，稳定 activity/day/role/report 不变。它不能替代 link_actual_change，也不能把 note 伪装成 changed_plan、skip 或完成。
- `set_day_route` 可引用 `{kind:"context",contextId,activityId}`；reported_activity 只能 status=reported，planned_target 只能 status=planned。未知实际钟点保持空；不能把估算当实际。后来的 context 纠正保留旧路线快照并标 needsReview，新路线须引用最新 context record。

`presentation-view` 默认仍返回严格 v1；输入 `contractVersion:2` 才附加 tripDisplayMetadata、reservationCommitmentCoverage、routeActivityContexts 和 adapterReplacement。v2 对酒店/预订/晚次、原报告、旅行身份和 projected revision/hash 交叉校验。unmapped reservation commitment 原文仍显示并产生核对项；它可能是门票，不能推断成酒店。`presentationCatalog.items` 始终是**单旅行实体摘要**，不是宿主 `presentationCatalog.entries` 跨旅行索引的替代品。后者由宿主用 trip-display 逐条合并。

旧 source adapters 在逐字段等价核对完成前继续保留，包括未知扩展、旧原文和来源。核心不读取、不迁移、不删除任意宿主 adapter；fixture 的 unknownAdapterField 用来证明投影没有隐式改变输入，并不声称已经完成真实 adapter 等价迁移。

可复现演示：`arrangement-scenario.json` → importOperation/preparationOperations → preview(operation) → validate-request → stage → verify → presentation-view(contractVersion:2)。ARRANGEMENT-DEMO.json 展示三家酒店、Oct2 原 note 餐饮、Oct3 没有 typed day 的酒店报告、Oct4 没有 typed day 的景观公路计划目标；ARRANGEMENT-HISTORY-DEMO.json 展示补录前仍未映射的原文。verify.mjs 使用真实独立 CLI 进程执行这条链路，stage 后原 store 字节不变。

coreVersion=11 会拒绝 v5–v10 未提交的旧 preview token，必须重新预览；原状态/hash/history 与已提交 idempotency receipt 仍兼容。journey schemaVersion 仍为 1。四个原始 stateless MCP 工具未扩展；新增受管操作通过 CLI/library 使用。

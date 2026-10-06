# 正式只读展示接口（presentation contract 1 / core v12）

`presentation-view` 已实现，输入/输出由 `presentationInputSchema`、`presentationOutputSchema` 验证；`schema` 返回可发现的 JSON Schema。它只读取同一权威 journey，不保存 catalog/历史投影/住宿展示缓存，不引入第二个写入口。旧 `readonly-view` 保留完整领域详情与兼容字段。

```sh
node tripctl.mjs schema
node tripctl.mjs presentation-view --store journey.json --input request.json
```

request：
```json
{"view":{"basis":"corrected_as_of"},"asOf":"2033-10-03T18:01:00+08:00","generatedAt":"2033-10-03T18:02:00+08:00","source":{"libraryFileId":"synthetic-current","libraryVersion":9,"retrievedAt":"2033-10-03T18:01:00+08:00"}}
```

source可省略；提供时三字段必须完整。它是宿主声明的来源，不是核心的身份认证。历史请求改为 `"view":{"basis":"as_recorded","revision":1}`。未知字段、未知revision、时间冲突被拒绝。输出 `saved:false/readOnly:true/derived:true/audience:private_owner`。

## 三个已发布字段

- **presentationCatalog**：`version:1`，`items` 是严格类型的展示摘要，包含ref/category/id/title/summary/dateIds/status/source，以及计划的结构化dateRestrictions、观测的basis/精确scope/claim/有效期/assessment。`unplacedRefs` 与 `inactiveAlternativeRefs` 保留缺日期关联的已知内容和失效分支。完整领域详情仍从同一输入的 `readonly-view.organized.catalog` 按相同ref读取；摘要不是新的业务事实。
- **historicalDailyRouteProjections**：覆盖旅程每一天，含viewBasis/sourceRevision/sourceStateHash、确认routeId、basis/orderStatus、有序entries/skippedEntries、旧计划/actual/备选/问题/证据/预约/住宿夜晚引用及needsReview。默认是当前已保存知识下的有效路线；选as_recorded时则是该revision的历史路线。每个entry明确activityRef、类型、actual/planned/skipped/reported、timing/timingBasis、独立planningEstimate/estimateStatus、nightDate/lodgingId。completionVerified始终false，不从预订或记录存在推导已完成。
- **nightDatedLodgingArrangements**：按精确nightDate呈现酒店、reservationId、routeEntryRef、timezone、来源revision/hash。status区分planned/reservation_reported/cancelled/unknown；liveStatusVerified始终false。取消行active:false，不会经酒店旧checkIn/out重新激活。只有明确route夜晚、尚无预订/酒店日期时仍产explicit_route_night；身份未定也保留该晚并提出具体问题。

字段采用上述规范大小写。父source adapter旧名 `historicaldailyRouteProjections`、`nightdatedlodgingArrangements` 应显式映射到规范字段；接口**不接收或自动迁移这些任意source对象**。输入仍只有权威state及查询。已有真实adapter资料需要父单writer用正式operation保存；不能把展示投影当source再次导入。

## 有效路线：baseline / current / actual

current代表最新保存的计划，可能仍等于baseline。展示优先顺序为：显式set_day_route → link_actual_change/结构化skip → 仍未关联的actual报告及待核旧计划 → 当前计划。不会为了展示而改写baseline/current或订单。

- 已有关联时，替代活动进入有效路线，被替代节点只在priorPlannedRefs/skippedEntries；尚未确认相对顺序时orderStatus=reported_order_unknown、position:null，不从数组位置编造先后。
- 广义changed_plan尚缺关联时，原始actualReportRefs优先可见，needsReview及pendingQuestions指出缺项；已知局部变更只作用于对应活动。
- set_day_route确认后，景观自驾→餐饮→新景点→当晚酒店按明确顺序显示。实际clock未知保持 `{}`；交通/观景估计单列，不能变成实际时间。旧湖可明确skipped而不再占主路线。
- 新actual或link_actual_change纠正晚于路线确认时，已知路线保留并标needsReview。若纠正移除了旧route所引用的reported活动，catalog保留其历史快照引用，不因找不到latest activity使整个展示失败。agent须据新来源重新整理路线；接口不会自行推测替代项。

## 历史时点与来源身份

输出分别提供 `source.authorityRevision/authorityStateHash`（实际读取的当前文件）和 `projectedRevision/projectedStateHash`（所选视图）。Library identity/version指前者，不把current文件的native version冒充历史revision的独立文件版本。hashScope 在 format1 为 canonical-format-1-state，format2 为 content-and-audit-head-v2；后者绑定当前内容及完整审计 head，不等于容器摘要。

未压缩的codec1或format1中，as_recorded从完整审计prefix重建：revision0取最早before，其他revision取对应after，保留全部此前history，再走正式parseState。禁止拿current内容拼rev0/history[]，不混入后来的纠正。此过程只读，不创建或保存另一个权威journey。

`knownAt` 是选定prefix提交时间及typed memory/itinerary/linkage来源捕获时间的最大值；asOf早于knownAt会拒绝 `future_projection_revision`。`freshness.knowledgeBasis=selected_revision`，asOf仅在选定知识已经可用之后评估证据新鲜度，**不是按任意时刻过滤当前revision的隐式时间旅行**。需要较早知识就明确选历史revision。generatedAt不得早于asOf/来源读取时间。automaticRefresh:false、providerSyncAt:null。

## 引用和缺项

输出schema细化校验会拒绝跨revision/hash的日或住宿条目、重复/未知catalog引用、错夜引用、重复route entry、活跃cancelled预订。所有复合ref逐段编码；不以标题、数组位置或自由文本猜身份。catalog/路线/住宿来自同一次选定state。

pendingQuestions包含精确日期/地点的最终公告确认、备选集合/结束时间、路线交通证据、酒店身份、未绑定actual、新报告后的路线复核、取消预订仍在路线中的确认。gaps保留结构缺口。输出问题不等于自动提问或外部查询；宿主应先查询已有授权工具，向用户只追问影响决策且无法查得的缺项。

## 真实可运行链条与边界

已实现：record_observation → evidence-impact（预测/局部/过期不会硬关全区）→ 显式preview/apply或stage/CAS → 共享日期限制；record_actual/link_actual_change/set_day_route → 有效展示；reminder intents/readback/begin/resolve → reminder-reconcile描述与unknown禁止重试；presentation-view → 严格结构的私有展示输入。

仍由宿主执行：真实地图/天气读取、明确授权的提醒派发和原生关联读回、同一Library文件CAS、私有Site渲染/刷新。此接口不操作订单、不取消预订、不自动发布、不获取浏览器内存。存储format2已由core12显式迁移接口实现；本展示接口仍不迁移真实历史。format1保持16MiB/200边界，format2物理上限仍16MiB，日志/回放另有预算，详见history-storage.md。

便携 `verify.mjs` 通过真实独立CLI进程验证上述链条；PRESENTATION-DEMO.json展示current仍等于baseline但有效路线已变化，PRESENTATION-HISTORY-DEMO.json展示revision1的旧计划。PRESENTATION-SCHEMA.json供宿主验证/生成适配代码。所有演示与测试都是合成资料。


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


确认路线的报告处理判定：changed_plan 若有有效 link_actual_change，或同一报告的所有最新 routeActivities 节点均被同日确认路线按精确 context/activity ID 引用、且来源不晚于路线确认，则不再是 unlinked。仅有新路线时间、无关节点、未引用的 context 或只引用部分节点都不足以消除提示；后续报告/纠正仍触发复核。只读 organized.route 是 needsReview 和 pendingActualReportRefs 的唯一判定来源，presentation 原样使用；未处理报告同时产生 unlinked_actual_change 核对项。此规则解释展示路线，不修改原报告、基线、计划或订单，也不补造 link_actual_change。此项仅修复投影，coreVersion 维持 11，既有预览 token 仍有效。


core12 的 read/verify/context/capacity 和只读摘要明确标明 storageFormat/stateHashScope；trip-display 同样标明 sourceStateHash 的作用域，presentation.source.hashScope涵盖所选revision，迁移不改变领域revision。宿主应使用该作用域比对，不能以容器摘要或旧格式全状态摘要替代。旧有as-recorded接口及稳定ref保持；纯JSON/structuredClone的format2 history保存差异，历史prefix由selectRevision受管重建。


显式 codec2 checkpoint 后，as_recorded 只支持保留窗口起点到当前 revision；更早返回 history_compacted，不能以摘要拼造完整历史。source/projected 的 revision/hash 仍分别表达实际读取文件与所选窗口状态；旧 metadata、水印、原日期证据和按 revision 截止的实体引用保持。checkpoint.createdAt 不会替代原业务已知时间。

# 正式只读展示接口（presentation contract 1 / core v10）

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

输出分别提供 `source.authorityRevision/authorityStateHash`（实际读取的当前文件）和 `projectedRevision/projectedStateHash`（所选视图）。Library identity/version指前者，不把current文件的native version冒充历史revision的独立文件版本。hashScope为canonical-format-1-state。

as_recorded从完整审计prefix重建：revision0取最早before，其他revision取对应after，保留全部此前history，再走正式parseState。禁止拿current内容拼rev0/history[]，不混入后来的纠正。此过程只读，不创建或保存另一个权威journey。

`knownAt` 是选定prefix提交时间及typed memory/itinerary/linkage来源捕获时间的最大值；asOf早于knownAt会拒绝 `future_projection_revision`。`freshness.knowledgeBasis=selected_revision`，asOf仅在选定知识已经可用之后评估证据新鲜度，**不是按任意时刻过滤当前revision的隐式时间旅行**。需要较早知识就明确选历史revision。generatedAt不得早于asOf/来源读取时间。automaticRefresh:false、providerSyncAt:null。

## 引用和缺项

输出schema细化校验会拒绝跨revision/hash的日或住宿条目、重复/未知catalog引用、错夜引用、重复route entry、活跃cancelled预订。所有复合ref逐段编码；不以标题、数组位置或自由文本猜身份。catalog/路线/住宿来自同一次选定state。

pendingQuestions包含精确日期/地点的最终公告确认、备选集合/结束时间、路线交通证据、酒店身份、未绑定actual、新报告后的路线复核、取消预订仍在路线中的确认。gaps保留结构缺口。输出问题不等于自动提问或外部查询；宿主应先查询已有授权工具，向用户只追问影响决策且无法查得的缺项。

## 真实可运行链条与边界

已实现：record_observation → evidence-impact（预测/局部/过期不会硬关全区）→ 显式preview/apply或stage/CAS → 共享日期限制；record_actual/link_actual_change/set_day_route → 有效展示；reminder intents/readback/begin/resolve → reminder-reconcile描述与unknown禁止重试；presentation-view → 严格结构的私有展示输入。

仍由宿主执行：真实地图/天气读取、明确授权的提醒派发和原生关联读回、同一Library文件CAS、私有Site渲染/刷新。此接口不操作订单、不取消预订、不自动发布、不获取浏览器内存。存储v2仍为另一个待实现增量；本接口不迁移真实历史、不改变16MiB/200边界。

便携 `verify.mjs` 通过真实独立CLI进程验证上述链条；PRESENTATION-DEMO.json展示current仍等于baseline但有效路线已变化，PRESENTATION-HISTORY-DEMO.json展示revision1的旧计划。PRESENTATION-SCHEMA.json供宿主验证/生成适配代码。所有演示与测试都是合成资料。

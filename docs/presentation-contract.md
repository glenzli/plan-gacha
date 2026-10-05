# 日程展示契约：权威记录与衍生投影

状态：这是下一版正式 schema 的约束设计，**当前运行时没有名为 `presentationCatalog`、`historicaldailyRouteProjections` 或 `nightdatedlodgingArrangements` 的新存储字段/操作**。父宿主的同名适配字段仍属于 source adapter，不能宣称已经由 v10 schema 验证。当前可用的规范来源是 `readonly-view.organized`、`linkage.dayRoutes` 与已有 itinerary/住宿记录；两层不能互相覆盖或形成第二权威源。迁移真实适配字段需先取得其精确结构并以合成样例建立 adapter 映射，本轮没有读取或复制真实数据。

## 所有投影的共同 envelope

拟定 `presentationContractVersion:1` 独立于 journey schema、core版本和外层 Library version。每次导出必带：

- `readOnly:true, derived:true, saved:false, audience:'private_owner'`。
- `source:{journeyId, revision, stateHash, hashScope, libraryFileId?, libraryVersion?, retrievedAt?}`；Library三项要么完整提供，要么明确未提供。native metadata 是宿主传入、未经核心独立认证。未来存储2使用有版本的 container/content/audit hash，不暗中复用 hash 名称。
- `asOf, generatedAt, sourceTimeZone, automaticRefresh:false`；同一次投影中的目录、路线、住宿夜晚必须来自同一源 revision/hash。历史报告与现代估计以源事实时间各自标识，不能拿generatedAt当数据更新时间。
- `gaps:[{code,refs,detail}]`：缺ID、缺日期、源冲突、未评估、旧分支、未知顺序均可见；不从自由文本猜出确定性关联、clock或完成状态。

所有引用都用稳定业务ID及编码后的组合键，不用显示标题、数组位置或时间猜身份。相同 source revision + asOf + request → 相同语义投影。projection 缓存可以重建，不进入 business content，也不作为可写事实导入。

## presentationCatalog → 正规目录

定义：`{version:1, entities:{plans,activities,reportedActivities,options,bookings,commitments,lodgings,facts,preferences,evidence,issues}, entityRefs, gaps}`。每个 entity 有 `{ref, entityType, id, journeyId, sourceRefs, payload}`；同一 ref 只解析到一个业务实体。payload 复用对应核心 schema，不把 source adapter 任意对象视为合格 payload。组合实体同时保留 planId/actualId，不靠字符串反解。

与当前实现的映射：`readonly-view.organized.catalog` 是只读基础。旧snapshot备用plan、尚未typed的活动仍保留并给出缺口；显式 `bind_context` 负责事实/偏好/option/issue的日程关联。对反馈去重只接受明确 `supersedesFactId` 或同一规范来源key，不能因文本相似删掉历史。

**不会新增 `set_presentation_catalog` 之类的写操作。** 确认的新事实仍通过既有fact/preference/itinerary操作保存，展示目录从当前权威记录派生。这样不会每次反馈都把全目录再写入content与history。

## historicaldailyRouteProjections → 带时点的历史路线

拟定规范名称 `historicalDailyRouteProjections`；旧适配字段需要显式一对一映射和来源报告，不能静默改名覆盖。每条 `{journeyId,dateId,viewBasis,sourceRevision,sourceHash,knownAt,routeId,entryRefs,skippedEntryRefs,priorPlannedRefs,pendingActualReportRefs,needsReview}`：

- `viewBasis:'as_recorded'|'corrected_as_of'` 必填。前者按指定历史revision重建当时已知状态，不把后来的更正塞回过去；后者使用当前权威状态中截至asOf的明确纠正，并链接原报告/被替代路线。两者显示标签不同。
- 路线 entry 引用同一次导出的catalog，明确 `position,status:actual|planned|skipped,purpose,activityRef,sourceRefs,timing?,planningEstimate?`。实际clock未知就缺省，估计不能填成实际time；景观自驾保留travel+viewing范围。新事实晚于路线确认时保留已知整条路，标needsReview与确切待处理报告。
- `set_day_route` 已存在，当前是带来源的整条单日 route 声明；`link_actual_change` 记录实际替代关联。当前无“历史展示缓存写回”操作。历史快照及衍生投影只读导出，不能为渲染历史再append一条业务event。
- 下一版若需频繁修改单个entry，应设计小范围 `amend_day_route(routeId,entryId,expectedRouteToken,patch,source)`；这是拟定操作，尚未实现。通过同一preview/CAS后只记录该项差异与显式顺序变更，保留旧route/entry IDs及来源。不能提前让宿主调用不存在的operation。

v10 `readonly-view` 只导出当前确认路线，尚无通用的任意历史revision投影CLI。后续需要受限、可核证的历史读取器，不能通过手工拼造rev0/history[]得到“过去状态”。

## nightdatedlodgingArrangements → 精确住宿夜晚

拟定规范名称 `nightDatedLodgingArrangements`；不是整个酒店catalog的复制。每条至少：`{journeyId,nightDate,timeZone,lodgingId?,reservationRef?,routeEntryRef?,status,sourceRefs,nightBasis,liveStatusVerified:false}`。

- 酒店入住日期覆盖 `[checkIn,checkOut)`，前后连续日期按明确timezone解释。只有日期的住宿夜晚不擅自补checkin时刻。明确住宿nightDate优先于旧schedule误归日；冲突展示为gap，不能把次晚酒店归到前一天。
- status区分 `planned|reservation_reported|cancelled|unknown`；需要当前有效reservation记录与来源才能归为reservation_reported。ticket/booking的done仍只是手续完成，不能推导已入住；route actual也不能证明平台订房状态。取消的记录保留审计但不生成活跃住宿夜晚。
- 身份/夜晚来源独立：仅知道“市内住宿”时lodgingId未知、nightDate可已知；仍显示该夜并提出具体酒店身份缺口，不转为已订或删除整天路线。
- 当前来源为snapshot lodging明确checkIn/checkOut、非cancelled reservations及 `set_day_route.entries[].nightDate/lodgingId`。当前 projection 对“所有reservation均取消但旧酒店级checkIn/out仍存在”的边界需要专项确认；设计要求不得静默重新激活已取消预订。
- 后续如需宿主修正住宿安排，正式操作应只修改指定lodging/reservation/night关联，带expected token和source，继续保护已确认预订与未核实订单。**不新增每轮整体替换 `lodgingArrangements` 的大对象操作，不操作真实订房平台。**

## 接入与版本验收

当前宿主可立即消费v10 organized数据，但不能把这份设计当已发布schema。后续正式实现需：可发现输入/输出JSON Schema和状态细化校验；源适配合成fixtures；未知field/未知ID/错night/取消记录/时区/更正/跨revision混合拒绝；旧分支与缺口可见；导出零写入；同输入同输出；新操作只含小范围业务变化；过去视图不改变当前权威状态。导出后由宿主单独刷新私有Site，显示来源revision/hash/生成时间。此过程不是实时同步，也不自动获取浏览器数据。

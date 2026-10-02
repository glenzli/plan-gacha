# Laplace 操作者场景：最小兼容演进选择

本轮已实现已订／锁定日计划保护、覆盖风险、逐项显式变更预览与回归。其余语义需要明确选择；下面均是设计建议，不是已实现能力。旧 snapshot 和 memory 来源保持，既有 CLI/网页离线流程、Library 外层 CAS、Drive 同步不变。

| 场景 | 当前边界 | 建议的最小兼容方案 | 取舍／需选定的语义 |
|---|---|---|---|
| 18:30 已订晚餐 | `done` 表示预约流程完成。无独立日期时只能关联当前整日计划，不能据标题推断唯一 stop | 已实现保守日计划保护；可选 `booking.dateId`，逐项 `commitmentChanges` 记录原日期／plan／理由；覆盖缺失仍 warning | 会阻止只想换下午的整日替换；明确授权仅修改行程，不证明已改订或取消订单 |
| 只换下午、保留晚餐 | `assign` 替换一个日计划；目前没有局部 stop 编辑 operation | 下一步增加显式 `edit_stops`／局部 patch：固定 plan 和 date、稳定 stop ID、列出移除／新增／重排；预约通过显式 `booking.stopIds` 关联；未关联时继续整日保护 | 需要选择哪些 stop 可动；不能将“孩子累”自动解释为可删晚餐。影响路腿、预约的变更须独立预览；本轮不自动迁移关联 |
| 孩子累、少走路 | free-text preference 可读且有来源，但当前确定性评分不消费它 | 先让操作者提出结构化软偏好（如 `walking_effort:lower`）并确认；只对有适用、可信证据的候选提供单独评分项／证据和未知提示 | 软偏好不是硬距离上限；不猜 500 米，不从景点名猜步行量。有无证据须可比较，缺证据不能当零步行 |
| 路线事实过期 | mapFact 保存 provider、坐标系、模式、观察／失效时间和估计，但没有 stop/date 路腿关联，rank 不消费 | 增加只读分析的显式 `asOf` 时间及确定性 freshness 报告；失效或缺少行程关联的事实不能参与推荐评分。随后关联 from/to stop ID、date、mode 和端点摘要 | 旧观测不自动覆盖为“当前路线”。坐标系、起终点、模式、行程日期须一致；先提示未知，再由获准 transport 补查 |
| 天气新鲜度 | dailyByDate 有预报内容，fetchedAt 可缺省，没有可靠 source/expiry 策略 | 兼容添加来源／观察／失效 metadata 和显式 `asOf`；缺 metadata 为 unknown，过期为 stale；风险与评分逐项披露证据状态 | 需选择 provider 的合理 TTL；不能用 snapshot.todayId 替代当前精确时间，也不能把模型生成值当官方实时天气 |
| 锁晚餐与锁整日 | memory.confirmed 保护 plan/date；新 `planLocked` 也是整日锁，`lodgingLocked` 只锁酒店 | 未来 stop-level commitment 与 plan-level lock 分开；保留全日默认语义，新关联经用户确认 | 不能把一个 confirmed decision 自动降成只锁晚餐；需要明确解锁／改范围依据 |

建议下一步选“局部 stop patch + 显式预约 stop 关联”，先跑固定 fixture 的下午替换，再加入只读 freshness 报告。结构化少走路评分在路腿证据可关联后接入，避免用缺失数据制造确定性。

snapshotToken 是内容身份，journey revision 是本地领域版本，Library version 是外层存储 CAS；这三者没有合并。无状态 MCP 不自动读取浏览器数据。父操作者的已验证 CLI + 同一 Library 文件 CAS 是当前跨轮状态链路；Mac 本轮没有修改该合成 Library journey。

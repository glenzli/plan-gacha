# Laplace 操作者场景：最小兼容演进选择

已实现整日已订／锁定保护，以及“显式关联晚餐预约 → 固定时间编辑下午活动 → 预览／保存／撤销”的最小闭环。原 snapshot／memory／history 格式兼容；Library 外层 CAS、网页离线和 Drive 同步保持原链路。其余能力仍是下面的设计选择。

| 场景 | 当前能力与边界 | 下一步的最小兼容选择 | 取舍／尚需选定的语义 |
|---|---|---|---|
| 18:30 已订晚餐 | `done` 表示预约流程完成，整日替换默认保护；`booking.dateId` 和逐项 `commitmentChanges` 已实现 | 已实现 `booking.stopIds` + `stopLinkSource`，由显式 `link_booking_activities` 关联稳定活动 ID | 不从标题／时间推断关联；不能改已确认关联，不能据此声称已改订／取消订单／实际完成 |
| 只换下午、保留晚餐 | 已实现 `edit_activity`：固定日期／plan／stop ID，仅标题、备注、文本地点、天气相关性；保留 ID、时刻、顺序、预约与酒店 | 先验证此窄操作。新增／删除／重排／时间变化仍不接受，未来另定 operations 和影响预览 | 无稳定 ID 的旧活动拒绝自动迁移；未关联完成预约继续整日保护；已有整日 confirmed／planLocked 不会降级为只锁晚餐 |
| 改地点后路线 | 清除改动活动与下一个活动的旧入站 transfer；营业时间／精确坐标不沿用。预览列出改动与重查提示；memory mapFacts 保留但不作为关联路线证据 | 已实现可选路线 binding、相邻活动 ID／内容 token／GCJ02 坐标和观察／失效时间，以及独立只读步行 transport；旧无关联记录为 unknown | ID 相同但地点改动仍使路线失效。未关联／端点或模式不一致为 unknown；不把“估计 20 分钟”解释成到达保证，不自动调用 provider |
| 孩子累、少走路 | 来源明确的 free-text preference 保留，确定性评分尚不消费 | 先确认结构化软偏好 `walking_effort:lower`；仅在路腿证据适用时给独立评分项、证据和未知说明 | 这是软偏好，不猜 500 米硬上限。若用户明确上限，须定义距离／连续路腿／总量与证据覆盖；缺证据不能算零步行 |
| 路线与天气新鲜度 | 已实现显式 asOf 的路线 freshness／身份核查；天气可能缺 fetchedAt，仍未接 freshness 或推荐评分 | 只读分析显式接收 `asOf`，返回 fresh／stale／unknown／unavailable 及理由；缺 metadata 为 unknown，过期不得贡献确定推荐分 | 不拿 todayId 替代精确时刻。路线／天气 TTL、未来出行适用窗口和 provider 语义尚待选择；不默设通用有效期，不把模型生成值当官方天气 |
| 编辑与数据共享 | 新局部操作接在 CLI/library engine，同一 revision/token、原子保存、审计和撤销已复用；网页归一化／导出保留关联 metadata | MCP／网页活动操作是下一层薄适配，须使用同一纯编辑核心和对应确认流程 | 当前四个无状态 MCP 工具仍处理整日分配；它们不自动获取浏览器数据，不能宣称免复制或已经接通局部网页保存 |

固定 fixture 验证保留上午、14:00 原时刻、18:30 晚餐与锁定酒店，未伪造 progress 或丢失未完成问题。地点改动涉及晚餐的相邻路线时，只清除派生路线供重查，不改变预约内容。当前不是分钟级交通／预约约束求解器，也不证明新下午活动赶得上晚餐。

snapshotToken 是内容身份，journey revision 是领域版本，Library version 是外层存储 CAS，schemaVersion 是格式。父操作者已验证 CLI + 同一 Library 文件 CAS；Mac 未修改父操作者的合成或真实 Library journey，未推送／部署。已验证一次严格 TLS 的真实只读公共 POI 查询；本轮步行请求的结果另见 walking-route-evidence.json，不能据 POI 成功声称 JS SDK 或路线已集成。

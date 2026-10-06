# 简洁保留与历史整理（只读预览，contract 1 / core12）

长期记住当前安排、用户明确报告的实际行程、地点/住宿身份、体验，以及为什么改变或否决方案。普通行程调整不需要永久逐笔原样保留。format2 是现有技术基础，本轮实现 `history-maintenance` 整理预览，先供宿主审阅规则与结果。

最小规则：

- 当前业务内容保持：当前计划与路线、实际报告、原地点与住宿身份/别名、事实与体验、明确偏好/否决理由、未完成事项和未知结果。计划移除或改动不证明去过、没去、取消或完成。
- 最近20笔保留完整变化，供短期恢复；这不放宽现有 undo 或提醒保护。
- 更早的普通调整按旅程、日期、活动、酒店或决策点合并为摘要卡。卡片保留次数、起止时间、原始变更理由和来源；相同理由、作者、来源才合并计数。不同理由不改写为模型猜测。旧 fact/actual/否决等业务记录以及体验显式关联的 changeCommitId 保留为独立记忆。
- 地点/活动按稳定身份保留名称变体。跨计划同名/同ID的旧活动带父身份；不靠标题猜合并。未知扩展仍留在当前内容，本轮不筛掉它们。
- 去重与旧提交receipt保留薄索引（id/revision/requestHash），来源新旧顺序水印和历史实体引用必须带入未来checkpoint。未完成提醒和未知派发结果保留，不改写为已执行。
- 后续落盘采用一个可替换的恢复checkpoint，确认新候选和同身份CAS/读回后再轮换。这里不增加逐次备份，也不承诺完整技术历史永远保留。薄索引和业务数组继续受现有容量预算约束。

```sh
node tripctl.mjs verify --store journey.json
node tripctl.mjs history-maintenance --store journey.json --input maintenance-request.json
```

输入：

```json
{"asOf":"2032-06-04T20:00:00Z","expectedRevision":65,"expectedStateHash":"sha256:<fresh-verify-hash>"}
```

使用实际刚读到的revision/hash和明确的asOf；示例不是用户真实guard。未知字段、陈旧guard、早于输入中提交的asOf被拒绝。输出基于同一snapshot，附sourceFileHash与maintenanceToken；重复输入得同一结果。

输出直接告诉宿主：多少旧调整可合并为多少张摘要，哪些20笔作为近期恢复，以及保留的事实/体验/否决/住宿数量、理由与地点身份。只读报告不写authority、不加revision、不建备份；deletedEvents/reclaimedStorageBytes均为0。不能将报告当journey保存，也没有 compact/apply 命令。

本轮先把“记什么”与合成效果交给宿主判断。下一步才是在原format2上实现带checkpoint起点、薄receipt、水印与实体引用的明确存储候选，验证回执、去重、历史引用、恢复与下一笔修改后，由宿主对同一真实authority执行CAS。原格式的revision/history约束意味着不能直接slice数组实现整理。当前as-recorded任意旧revision仍可用；未来整理后只能承诺保留窗口内精确回放，更早显示语义摘要，需在能力契约中明确变化。

可重复合成演示：`node history-maintenance.verify.mjs .`。包含明确否决、未知体验、未完事项、实际note与60笔普通调整。全部业务内容、字节、hash与receipt保持；旧调整在报告里合并，结果不会声称已去或已完成。

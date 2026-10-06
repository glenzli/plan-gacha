# 简洁保留与可恢复历史 checkpoint（core12）

`history-maintenance` 仍是确定性的只读整理报告。新增 `prepare-maintenance` 会生成可实际保存的 format2/codec2 候选；`commit-maintenance` 显式采用本地候选。两者不操作 Library、订单、提醒或真实行程。当前业务内容和领域 revision 保持不变。

这版采用保守的第一步：移除最近20笔之前的技术 forward/reverse 差异，保留全部原事件 metadata。普通调整的完整 operation、嵌套预订变更原因、actor、时间、id/revision/requestHash 仍在 archive，重要业务事件也全部保留。摘要卡用于简洁展示，不能替代原业务理由或伪装完整历史快照。不会硬清旧 fact、actual、否决、体验或未完成记录。

保留契约：

- 当前计划、路线、实际报告、事实与体验、明确偏好/否决、未完成事项和未知结果保持原样。改计划不证明去过、没去、取消或完成。
- 原始关键理由保留正文及来源。`assign.commitmentChanges` 的理由带其自己的 planId/dateId，不能错记为新分配目标的日期；外层通用 reason 不覆盖它。
- 最近20笔事件及窗口起点保留完整内容，共21个可精确恢复的 revision。更早的 `contentAt`、`selectRevision`、`presentation-view as_recorded` 返回 `history_compacted`，需读取确实包含该 revision 的先前版本。摘要不能重建旧的完整状态。
- 旧原始计划、typed 活动和住宿版本保留为标记的 `historical_identity`，包含原始字段与未知扩展；它们只供稳定引用及隐私过滤，不能当完整历史 TripContent。
- 所有原提交回执、未来体验可引用的 commitId、原 `apply_observation` 当时采用的完整证据和来源水印保留。checkpoint 创建时间不会变成业务的“已知时间”。
- 全局 revision 不重编号。压缩后 auditHeadHash/stateHash 改变，未提交 preview 必须刷新；已提交回执仍能重放。codec1 的 core12 hash/preview 契约保持，普通读取不自动压缩。
- archive 与完整后缀合计仍受2048事件限制，文件仍受16MiB约束；历史身份和重放均受预算约束。这不是无限日志，也不保证每个输入都缩小，报告给出实测字节变化（可以为负）。

```sh
node tripctl.mjs verify --store journey.json
node tripctl.mjs history-maintenance --store journey.json --input maintenance-query.json
node tripctl.mjs prepare-maintenance --store journey.json --input checkpoint-request.json --output candidate.json
node tripctl.mjs verify --store candidate.json
```

只读查询输入为 `{asOf,expectedRevision,expectedStateHash}`。checkpoint 请求使用刚读到的四项 guard，并明确维护的作者、原因和时间：

```json
{
  "asOf":"2034-10-04T20:00:00Z",
  "expectedJourneyId":"synthetic-journey",
  "expectedRevision":66,
  "expectedStateHash":"sha256:<fresh-verify-hash>",
  "expectedFileHash":"sha256:<fresh-exact-file-hash>",
  "actor":"synthetic",
  "reason":"Explicit reviewed historical checkpoint",
  "sourceLibrary":{
    "libraryFileId":"<same-authority-ID>",
    "expectedCurrentVersion":3,
    "retrievedAt":"2034-10-04T20:00:00Z"
  }
}
```

以上是示例，不是真实 guard。sourceLibrary 可省略，是宿主声明的原生版本信息；core 不验证它的真实性、授权或可恢复性。未知字段、陈旧四项 guard、早于已有提交的 asOf 被拒绝。

prepare 持有本地源锁，生成 `candidate.json.maintenance.json` 报告，再生成候选，均为 exclusive 新文件；读回核验全部 metadata、当前内容、21个完整状态、历史实体和日期来源。输入源及其精确字节不变，不创建恢复文件，返回 `saved:false`。失败可能留下完整报告；保留现场，检查错误并使用新的候选路径。

仅针对本地权威文件，明确采用审阅过的报告：

```sh
node tripctl.mjs commit-maintenance --store journey.json --input candidate.json.maintenance.json
```

commit 重读报告、四项源 guard、候选字节及逻辑 identity，并从原源重建候选、复核实际效果与 proof。成功替换前，将**精确原文件** fsync 保存并读回到唯一的 `journey.json.recovery-checkpoint.json`，再原子替换源并读回。重复采用返回 replayed；后续整理轮换同一个恢复点，先前维护不会每次新增另一份外部备份。普通业务 `apply` 原有本地 revision 备份行为保持。

恢复点只保证上一次维护前的精确文件。再次维护前的文件可能已经压缩，因此它不保证最早 revision 永远可回放；更早完整状态需读取正常 Library 历史中确实包含它的版本。已有后续业务修改时，不能直接覆盖回旧文件。若出现 `save_outcome_unknown`，核对同一源的 fileHash 和恢复点，不能盲目重写或删锁。

对于 Library 权威，宿主审阅报告并确认所需先前原生版本可读取，再以刚读到的 native expected version 对**同一 Library ID**做 CAS，读回确认版本与字节。仅填写 sourceLibrary 不证明恢复已验证；core 的 `recoveryExternallyVerified` 始终为 false。本机实现不写真实 authority、不删除 Library 版本、不建第二权威文件。

未压缩 codec1 可完整导出 format1（仍受旧200事件/16MiB限制）；codec2 缺旧完整技术状态，`export-format1` 明确返回 `downgrade_unrepresentable`。旧仅支持 codec1 的 core12 运行包也不能读取 codec2；使用 schema 声明支持 codec2 的新运行包，不能只看 coreVersion。

可重复验证：

```sh
node history-maintenance.verify.mjs .
node history-compaction.verify.mjs .
node verify.mjs
```

全部使用合成临时文件。第一项只展示合成摘要分组，比例不能代表真实旅程；第二项用独立 CLI 进程验证实际候选、本地采用、单恢复点轮换、回执/体验关联及跨日预订原因，报告实测字节效果。它不代表真实 authority 已压缩或旧 Library 恢复已验证。

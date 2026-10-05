# 历史容量：当前诊断与下一版无损存储方案

状态：`capacity` 是可调用的 v10 只读命令。下述存储 v2 是设计，验证脚本中的 patch codec 是合成实验，**尚非生产读写格式**。没有迁移、压缩、清理或读取真实用户 journey；没有提高任何限额。

```sh
node tripctl.mjs capacity --store journey.json
node history-capacity.verify.mjs /absolute/path/to/tripctl-runtime
```

容量命令只接收已有 store 路径；返回 `saved:false`，与 writer 相同的 UTF-8 `JSON.stringify(parseState(state), null, 2) + '\n'` 字节数、compact JSON 分项、剩余字节、history 计数及上限。它不预留容量，不预测可用天数。原文件若使用不同空白格式，磁盘字节数可以不同；这里测的是下一次本地完整写出格式。CLI 的原有 16 MiB 读取上限仍生效；直接调用纯 `analyseCapacity(parsedState)` 可以报告结构有效但序列化后超限的对象，不为它执行保存。

## 已确认的风险

- `store.ts` 在 `loadState` 与 `atomicWrite` 检查 16×1024×1024 = **16,777,216 bytes**；CLI stdin 也有同限额。文件形式的其他 JSON 输入读取不因此具备统一限额。
- `schema.ts` 限制 history 至 200 条；`engine.apply` 在新增提交前另行拒绝第 201 条。重复的已提交请求先走原收据回放，不增加历史。
- `apply`/`validate-request` 是领域内存操作；成功并不能证明序列化后的候选小于 16 MiB。`stage` 写出候选时才检查字节上限。外层 Library CAS 还必须成功并回读，才能称为已保存。
- memory facts/preferences/decisions/progress/issues 各有 500 条、mapFacts 100 条；linkage 也有各自数组上限。它们与 history、文件大小独立；存储升级不能假装已经解决所有长期容量边界。
- 按父操作者报告的 **11,549,282 bytes / revision 87**，离字节上限尚余 **5,227,934 bytes（31.16%）**，提交计数尚余 **113 个名额**。未读取该真实文件，未验证其序列化格式；不能据此保证还能成功写入 113 次或推算剩余天数。

每个 event 保存完整 `before` 与 `after`，顶层另存 `content`。n 次提交有 2n+1 个完整内容出现位置。记内容 C0…Cn 的字节数为 c0…cn，纯内容部分是 `c0 + 2*sum(c1…cn)`；相邻事件的 `after`/`before` 和最后的 current 重复。若内容恒定，文件随提交数线性增长；若每次净增 g，近似为 `(2n+1)c0 + g(n²+n)`，再加 operation/actor/reason 等事件元数据和格式空白。不是所有业务操作都具有固定 g，也不能假定未来净增恒定。

新增 `set_day_route` 等操作虽然只描述当天变化，现存 engine 仍会复制整个 content；一个小反馈也会重复之前所有事实、路线和观察。local `commitStore` 还保存每个完整 `.rev-N.json`，在持续增量模型下本地累计备份体积可近似三次增长；Library 每个 native version 的底层保留方式由服务决定，本工具没有测量或更改其保留策略。

`parseState` 每次校验所有事件及 before/after 内容，preview 又把整个 state 计入 token；历史身份、日期水印、经验来源、路线/住宿快照验证也遍历历史。仅压缩磁盘 JSON 不会消除这些 CPU/内存成本。

## 最小分期方案

1. **当前交付：诊断与设计。** 保持格式1、原 token/hash、200/16MiB 边界；每轮先读 capacity，保存前保留 exact staged candidate 的容量验证。只读投影不要写回 journey，避免把完整 catalog/整段历史展示缓存再次复制进每个 event。尚未实现批量业务写入，不把多条现有 operation 偷合为一个审计事件。
2. **单独下一增量：存储格式2 + 同一权威文件。** 明确 codec 版本、领域 schema 版本，保留初始 content anchor、完整事件 metadata、可逆结构差异及一份 current。每条仍保留原 commit ID、revision、operation、actor、reason、at、requestHash，新增 before/after 内容 hash 和前一事件链 hash。差异表达 append/splice/set/remove；删除值保存在 inverse 中，所有历史都可精确重建。旧 operation 只作审计，绝不能用新版规则重执行旧操作生成“历史”。无损不是删掉旧记录或改写原始语义。
3. **同时移除全量历史热路径。** 建立可重建索引：commitID→receipt/requestHash；历史 plan/activity/lodging 身份；日期规则水印；最近事件 before；linkage/experience 来源。新业务提交只计算、校验新事件和受影响实体，不能先展开成完整格式1再运行全部历史校验。打开/verify 时流式核验链及索引来源，未知或损坏索引重建/拒绝，不能默认历史可信。
4. **有界生产资源设计。** 200 限额不再直接等同生产日志容量，改为经压测的编码字节、单事件大小、解码工作量及访问预算；具体值待目标环境压测，不在本轮武断提高。格式2可先保留原16MiB物理容器限额来降低上线风险，但这只是更久的余量。单一 Library file replacement 仍需传整个逐渐增长的容器；真正长期无限追加需要后续只增历史分片/对象与同一 head manifest 的发布协议，不能假称本方案已消除网络全量替换。

不优先引入数据库、第二个远端写入口或跨文件事务。单文件 v2 足以先消除每条事件的完整 before/after 复制。普通 append-only 小记录的编码总量接近 `anchor + current + sum(delta + metadata)`；**大型 import、数组大范围重排或替换仍可能产生大差异，不能承诺任意工作负载线性增长**。实验 splice 对公共前后缀做裁剪，至少避免 append 每次又存整数组。压缩或清除 JSON 空白可作传输优化，但不能替代该结构改造。

## 身份、hash、CAS 与 undo 契约

- journey ID、所有 plan/activity/fact/commit ID、领域 revision 不因格式迁移而变化；不重建新 journey 或把 revision 清零。完整操作内容与请求 hash 必须原样保留，已提交旧请求仍回放原 committedRevision。
- 区分 `containerHash`（编码容器）、`contentHash`（当前内容）、`auditHeadHash`（完整事件链）、`legacyStateHash`（迁移验收时精确重建旧逻辑 state 的 hash）。不能把新物理 hash 冒充旧 `stateHash`。输出需带 hash 算法/作用域版本；宿主必须同步升级这些字段的使用方式。
- 链 hash 覆盖 priorHash、revision、完整 metadata、before/after hash、forward/inverse patch。它检测损坏与缺段；整包内容连同自带 hash 都被替换时，它并不认证来源。权威文件身份、版本与宿主授权仍是信任边界。
- 迁移只改变存储表示，不新增业务 revision，但会新增 native Library version。下一版 core 明确换 preview epoch/token；迁移前未提交 preview 全部重预览，不能拿旧内容 token 跳过新的状态读取。已提交旧 requestHash 的幂等回放继续有效。
- 新 preview 绑定 core/领域格式版本、journey ID、revision、contentHash、auditHeadHash 和完整 operation；历史决定的保护也包含在所绑定的审计链中。写入需在同一本地锁内核对，外层仍以同一 Library ID + expected native version CAS，冲突不得降级为无条件写。
- storage inverse 用来恢复字节内容，不是业务授权。用户 undo 仍只能撤销最新允许撤销的业务提交，作为**新的**单调 revision，继续执行当前 `linkage_undo_forbidden` 等保护。提醒 unknown attempt 不得靠逆补丁消失；不能把格式回滚当作重新派发授权。

## 迁移、回滚与失败恢复

真实迁移必须单独明确执行，不从 read/capacity/新 operation 隐式触发。候选生成可以自动，但只有源文件 native 版本固定且完整验证后才可提议替换：

1. 固定源 native version、journey revision、原始文件 SHA 与 logical state hash，保留原字节备份；不只依赖格式化再输出的“差不多相同”副本。
2. `migrate --output candidate`（拟定，**当前没有该 CLI**）创建新格式候选与迁移报告，返回 saved:false；检查所有历史事件 ID/metadata、逐个 before/after、当前内容、旧 hash、已提交收据完全相同。metadata 里的旧 operation 不能通过新规则重新规范化或丢字段。
3. 对候选做流式解码/资源上限验证、undo/idempotency/历史来源校验。迁移报告单列 base native version/hash；原始文件发生变化则候选作废。
4. 经明确迁移授权后，宿主使用同一文件身份及 expected_current_version CAS 替换；回读新 native version 和 hash 后再接受后续业务写入。未知结果先回读判断表示和原业务 revision，不能重复迁移或派发提醒。
5. 新业务尚未写入时，可在保留候选/报告并校验最新 native version 后，以原字节作新的受管版本回退表示；native version仍递增。新增业务后，不能直接恢复旧 native 版本丢掉新历史。应无损导出**最新**逻辑状态，再证明原格式/运行时全部限额都满足；否则明确拒绝旧格式降级，保持兼容读者、原历史与 v2 文件可恢复。
6. 不能永久删史、截断到最近200条、把计数归零、换journey ID，或用“压缩成功”掩盖旧运行时无法读取 >16MiB/>200 的状态。大规模分片与保留策略属于后续显式方案。

## 合成验收与范围

`scripts/history-capacity.verify.mjs`（便携包同名）先用真实核心执行64次带稳定ID的合成追加操作；对实验编码无损往返，逐事件比较 before/after、metadata和canonical hash，检查已提交收据、冲突key、陈旧revision及通过正式engine的undo。另以2048次持续追加记录验证实验codec的forward/inverse、数组删除重排、编码大小增长、篡改/漏段/乱序拒绝，并通过真实CLI验证capacity零写入。脚本不读用户文件、不调用外部服务、不实现迁移命令。**超过200的部分只证明codec，不证明生产engine/存储/Library已支持2048次提交。**

生产格式2上线前还需独立覆盖：旧v5–v10实包迁移；各种历史身份与水印；未决提醒和业务undo保护；崩溃/磁盘满/损坏索引；并发CAS/未知保存结果；完整有限额回滚；目标环境长时间CPU/内存/I/O与分片阈值压测。当前测试不能替代这些上线门槛。

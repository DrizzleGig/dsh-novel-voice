# Changelog

## 0.2.0 — 2026-11-21（开发版，G2–G4 待验收）

**主题：看得见的风格**——来源可追、对照可验、版本可回看。本版不新增文风算法，重点是把已有档案变成可核对的工作台。

### 新增

- **来源地图**：规则证据保留 `workId / chapter / quote / hash`；面板新增「来源与证据」与证据 sheet，按作品显示证据条数（条形按证据条数，不冒充作者权重）。旧证据没有 `workId` 时标「未匹配」，不补猜。
- **对照镜**：只读对照档案的六项 L2 区间（句长、句长变化、段长、对话比、抽象词、解释连接词）与四类命中；不调用 `rank()`，返回结构**没有 score/total/percent**；每条 finding 必须能追到规则，找不到标「未匹配」；绑定 `textHash + profileRevision`，过期标 stale。
- **档案时间线**：`state.json` 单调 revision；档案补 `revision/parentRevision/action/reason/at/restoredFrom`；面板可看版本、变更与回滚来源；回滚建新 revision，不再重号。
- **排字房 UI**：420px 右栏重做——暖纸/墨字/衬线标题/细线；书架 / 档案 / 学习三 tab；简报、证据、时间线、对照镜、导入五个 sheet；深浅色跟随宿主；去掉旧的图表式仪表盘。
- **服务契约**：`identity()` 可调用并声明 `voice.brief/status/revision`；`getStatus/getRevision/getBrief` 统一 `cwd`（兼容旧 `dir`）；`getBrief` 补 `revision/generated_at/tokens`；`voice_check` 补 `status/pass/revision`；`onDidChange` 接真实变更事件。

### 修正

- **voice → fanfic 断链**：先读 `.dsh-novel-fanfic/<project>/project.json`，再兼容旧的 `book.json`；显式 project 不存在时返回 `no-project`，不串书。
- **回滚重号**：从 v1.0 回滚不再写回 v1.1；用当前版本 +1 建新版本，`restoredFrom` 指向被恢复的 revision。
- **面板证据丢 `workId`**：`remote.js` 的证据透传补齐 `workId/chapter/hash`。

### 兼容

- `profile.json` 仍 `schemaVersion:1`；新增字段全部可选。
- 旧档案无 revision → 读时按 `audit.jsonl` 行数兜底，显示「未知」；第一次写盘后从当前数起算。
- 旧规则里的 `supporting_evidence` 读时映射为 legacy 证据，不批量写回。
- 七个工具名、`/voice` 开关、右栏 tab kind、数据目录、服务 key 不变。

### 测试

- `node --test`：58 → **62**（服务契约、fanfic 断链、revision/历史/回滚、对照镜无评分/stale）。
- `npm run check`：7 工具 / 18 remote（新增 `mirror`）。

### 已知限制（发布阻断）

- **G2 召回、G3 盲选、G4 零编造尚未跑**；0.2.0 只是开发版，不对外宣称「可核对」。发布前必须按方案 §9 完成三条真实验收。
- 证据 hash 的「回查原文」目前只展示 hash；面板内的自动回查留到 0.2.1。
- 完整导入向导、学习批处理、≥520px 两列留到 0.2.1。

## 0.1.0 — 2026-11-17

首个可安装版本：**创作风格 / 风格工作室**。默认关闭，`/voice on` 启用。

### 新增

- **书架**：导入参考作品与作者旧稿（`reference` / `own`），UTF-8 / GB18030 / UTF-16 编码探测，sha256 去重，容量上限（20 部 / 2000 万字 / 单文件 20 MB），分章与手动修正；面板内可「选文件夹」「选文件」「输入路径」，逐本「移除」（二次确认，删本地目录并摘出索引）。
- **统计**：六组确定性统计（句法/段落/对话/叙述/修辞/节奏），全本地、零模型、同输入同输出；六类场景切分。
- **档案**：L1–L4 四层结构、区间画像（p25–p75 + 最小半宽 + `provisional`）、模式与场景权重、模板技法、版本快照、回滚、规则状态、`regenerate` 重建锚点/样段；`assignModeRules()` 把规则挂到模式。
- **Style Compiler**：≤600 字简报 + 有旧稿时 ≤400 字样段；3–5 条规则、≤8 条禁语、1 条参考锚点、硬约束永不裁剪；**L2 节奏规则**（句子可以长/短、段落可以长/短）从区间生成，不带数字。
- **检查**：12 个检测器——套话密度、否定-修正句、段末升华、抽象情绪直述、20 字重合（block）、契约禁忌、重复，以及句法/段落/对话/抽象/解释的画像偏离；**没有分数**，只给位置 + 原句 + 理由。
- **定点改写**：只改命中窗口，五道校验（长度、事实、保留度、新习惯、重合），失败回退并标 `needs-author`；默认 `dryRun`，必须 `fix:true`。
- **反馈**：append-only 事件、按事件 id 去重的候选聚合（同 scope ≥2 次才进待确认）、确认/忽略、本书禁语标黑。
- **面板**：入口「创作风格」→「风格工作室」；书架 / 风格 / 学习三 tab；导入后自动统计、逐本「统计 / 移除」、权重可拖可存、场景主模式切换、技法卡展开看证据（模板卡带标记）、「从作品提取」带引文的技法卡（落为候选，在「学习」确认）、一键用模板建档案、生成简报；420px 主题 token。
- **文案**：市场简介与 README 按作者提供的定位重写（支持融合参考作品与自己原创作品，形成专属文风）。
- **工具**：7 个（`voice_import` / `voice_learn` / `voice_profile` / `voice_brief` / `voice_check` / `voice_polish` / `voice_feedback`）；只读服务 `novelVoice`；`/voice on|off|status`。
- **评估脚本**：`scripts/eval-deslop.mjs`（夹具）、`scripts/eval-corpus.mjs`（真实语料 G1）。

### 修正

- 面板「选文件」原来按 UTF-8 读文本，GBK 小说会整本乱码；改为送 base64 原始字节、由主机探测编码，并加乱码闸（U+FFFD 比例过高拒收）。
- 空行只出现在章节之间的 TXT，会把整章算成一段；`splitParagraphs` 在段长中位数 > 400 字时退回按行分。
- 参考锚点会抓到「内容简介」和「第7章 ……」这种非正文句子；现在只从正文取，且 ≤60 字。
- 简报的总则不再留「待作者确认」占位符：默认给自动画像（句子/段落/对话），作者可用 `voice_profile update` 覆盖。
- L2 节奏规则（句子可以长 / 段落可以长）在 5 条上限里曾被模板挤掉；现在按层给保底名额。
- Typert remote 装饰器改为普通 JS 复刻（`lib/typert-bind.js`），可单测；运行时 `fiberPhase: active` 已验证。

### 已知限制

- 真实验收 G2（召回）/ G3（盲选）/ G4（零编造）不在本版完成，作为 **v0.2.0 发布门槛**；本版只完成 G1（人工正文误报 0.10 处/千字）与正控。
- 多作品自动聚类、候选规则半自动升级、完整证据分页、成套图标、≥520px 两列：v0.2。
- 人物声线：v0.3。
- 同人契约只读 `book.json` 里的禁忌数组，不是完整契约编译器。

### 升级须知

- 0.1.0 之前用「选文件」导入过的 GBK 作品可能是乱码：请从书架移除后，用「选文件夹」或「输入路径」重新导入。

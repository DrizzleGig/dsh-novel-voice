## 0.4.1 — 2026-11-27 · 项目绑定与写回路径（本地版，未发布）

- **多项目不串契约**：`loadContract` 在 `.dsh-novel-fanfic` 下有多个项目且调用方未显式传 `project` 时返回 `ambiguous-project`，不再默认取第一个项目；`voice_check`/`voice_polish` schema 新增可选 `project`，remote 面板同样支持。
- **写回路径限制**：`voice_polish(write:true)` 只允许改工作区内已存在的普通文件；拒绝越界、符号链接逃逸与目录，外部文件字节不变。
- 新增多项目歧义与越界写测试；`npm test` 86/86。

## 0.4.0 — 2026-11-26

> 合并发布 0.3.0 风格底座、0.3.1 人物画像、0.3.2 A/B/C 与只读服务、0.4.0 读者偏好；0.3.x 未单独发布。npm 包 0.4.0。

- 新增 `voice_rating`（第 8 个工具）：读者引用原文段落 + like/dislike + 1–5 强度；默认关，作者 confirm 后才进 brief；不训练模型、不给作品总分。
- 新增 `lib/ratings.js` + `.dsh-novel-voice/<book>/ratings.jsonl` + `reader.json`；`voice_brief` 的 `【写法】` 增加“读者偏好（仅建议）”一行；beat 通过既有 `getBrief` 读取，不需要改 beat 代码。
- 新增 `zh-slop-core` 规则包（humanizer-lint MIT 子集，25 条，默认关）+ `zh-fiction`（qu-ai-wei/sepia 派生，17 条，默认关）+ `zh-narrative`（sepia 派生，12 条，默认关）+ `lib/rules/engine.js` + `voice_profile action=packs/set-packs`；`voice_check` 返回 `ruleFindings`/`ruleSummary`/`rulePacks`，默认空。
- 新增 `lib/fingerprint.js`；`voice_check` 返回 `fingerprint`（同输入同 hash，无评分）；`profile.stylometry` 在建档/重建时生成，`voice_brief` 在【硬约束】后附 2 行【指纹】，预算不足时先删指纹。
- 档案面板“规则包”sheet 可在面板内启用/关闭规则包；来源、许可、条数、默认关状态可见。
- 新增 `voice_persona`（0.3.1 预览，第 9 个工具）：`extract` 分批读作品、模型只提案、证据逐条回查；`propose` 接收手工/模型提案；默认 candidate，作者 `confirm` 后才生效；全部对白证据不能确认；写 `.dsh-novel-voice/<book>/personas/`。
- 新增只读 `getPersonaBrief`（0.3.2 预览）：只含 confirmed 卡，支持 `profile.characterStyles` 的 A/B/C 绑定与字段级冲突并列；无卡返回 `available:false`；不返回分数。
- beat 0.12.1 的 `loadVoiceGuidance` 可选读取 `getPersonaBrief`，以 `personaText` 随工具结果回传；只建议、250ms 超时、无 capability 降级。
- `voice_check action=rank` 的公共 `items[]` 移除内部 `score`，保留 `closest` 索引；补回归测试。
- 新增 `THIRD_PARTY_NOTICES.md`、`LICENSES/`、`vendor/manifest.json`、`npm run check:licenses`；`humanizer-lint` 的 zh-slop 规则按 MIT vendored；`check-surface` 的版本/工具数断言改为动态。
- 档案面板新增“人物卡”sheet：候选/已确认/已拒绝列表，面板内确认/拒绝；点卡可看主张/证据通道/反例；确认后才会进 `getPersonaBrief` 与 beat `personaText`。
- 档案面板新增“读者偏好”sheet：载入章节后从原文段落点选引用，五颗星 1–5，喜欢/不喜欢，读者可选；面板内开关与确认/拒绝；只有 confirmed 才进 brief/beat。
- 面板改为分段页签；新增底色选择（跟随宿主/纸白/白纸/墨黑，仅面板内覆盖变量）。
- 读者引用存 `workId / chapter / start / end / quote / quoteHash`，后端逐条回查原文；不存整章。
- 面板顶部增加 folio 统计行（WORKS / CHAPTERS / 万字 / REV）；Sheet 增加 dialog 语义、Escape 关闭、Tab/Shift+Tab 环绕与焦点归还。
- 修复：同一 `instruction` 的技法卡在简报里重复出现；`rankRules` 按 instruction 去重，补回归测试。
- 新增 `zh-punctuation` 规则包（5 条，默认关）：只提示省略号/破折号/括号/引号规范，不改正文。
- 真书测试：《斗罗大陆》GB18030 / 2,854,436 字 / 687 章；简报、规则包、指纹、rank、读者偏好链路通过，记录见 `docs/voice-斗罗真书风格测试-2026-11-25.md`。
- 修复（Codex 审查）：读者改强度/标签/备注后重置 pending，只有完全相同的重试才保留 confirmed；人物分批 `maxBatches=1` 不再发空正文，超长场景按 maxChars 切片，对白引用即使伪报 narration 也按 dialogue 处理，`characterStyles` 绑定也受 `cast` 过滤；读者/人物证据 `start` 错位直接拒绝，不再猜首处匹配；坏 regex 规则包在加载时拒绝；读者章节载入竞态与规则包并发开关已串行。
- 测试 85/85。

### 已知限制（0.4.0）

- 真书《斗罗大陆》2,854,436 字/687 章跑通链路，但原著章节的 20 字重合会 block，不是文风结论；作者新稿 block=0 对照未做。
- 真实 DSH 宿主浅/深色截图、键盘手工复测、空态/失败态验收后置。
- 人物 extract 真实模型效果未验收；测试用假 LLM。
- fade 不做适配（作者决定）；beat 适配主要在 beat 段。
- A/B/C 有数据与服务，无独立组合 UI。

## 0.2.2 — 2026-11-21

- 接管：`applyAgentMode` 改用 `effectiveOn`，订阅 `novel-conductor/drive` 重算本会话（含 deny restrict 的收放）。
- `/voice status` 增故事总控说明。
- 新增 `lib/tool-schema.mjs` + `test/tool-schema.test.mjs`（参数 schema 守卫）。



﻿# Changelog

## 0.2.0 — 2026-11-21（已发布；G2/G3 作者验收待补）

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

- `node --test`：58 → **63**（服务契约、fanfic 断链、revision/历史/回滚、对照镜无评分/stale、感官误报回归）。
- `npm run check`：7 工具 / 20 remote（新增 `mirror`、`chapterText`、`verifyEvidence`）。

### 章节验收（2026-11-21，斗罗同人第 1–12 章）

- **G1**：12 章 / 27,910 字，warn **0**、block **0**、info 5（repetition）；warn **0.000 处/千字**，全部 findings **0.179 处/千字**。
- **正控**：10 条植入 AI 味句，四类 L1 命中 **8/10（80%）**；这不是作者句级标注的正式 G2。
- **对照镜**：第 10–12 章六项区间与 findings 可读，无 score/total/percent；偏离来自「原著档案 vs 同人正文」的风格差，不是缺陷。
- **G4 管线**：第 6 章一个窗口受控改写，V1–V5 全过、窗外 diff=0、字数 2681→2680、1 处改动、0 拒绝。

### 已知限制（发布时写明）

- **G2 正式作者标注、G3 盲选、G4 真实模型 `fix:true` 尚未完成**；本次 0.2.0 是章节验收后的开发版，不对外宣称「全部验收通过」。
- 证据回查只做「原文包含 + hash 比对」，不做跨章定位；完整证据分页留到 0.2.1。
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



# `dsh-novel-voice` v0.1.0 · 发布检查

> 日期：2026-11-17
> 包：`dsh-novel-voice@0.1.0`
> 入口名：创作风格｜面板名：风格工作室

## 1. 发布物

| 项 | 值 |
|---|---|
| 包名 / 版本 | `dsh-novel-voice` / `0.1.0` |
| 安装方式 | `plugin_manager install_bundle` 指向 `D:\Novel-gate\dsh-novel-voice`（profile 记录为 `link:`） |
| bundle 行 | `novel-voice`（host）、`novel-voice-remote`（typert remote） |
| 数量 | 36 个文件 / 118.0 kB（unpacked 347.9 kB） |
| 工具 | 7 个 `voice_*`，默认隐藏，`/voice on` 后可见 |
| 面板 | 右栏 tab「创作风格」+ 会话头按钮 |

## 2. 自动检查（发布前必须全绿）

| 检查 | 命令 | 结果 |
|---|---|---|
| 单元 / 集成测试 | `npm test` | ✅ 58/58 |
| 表面检查（文件、工具数、命名、契约同步） | `npm run check` | ✅ 7 工具 / 17 remote |
| 夹具回归 | `npm run eval`（无夹具时只提示） | ✅ 脚手架就绪，待补夹具 |
| 真实语料 G1 | `node scripts/eval-corpus.mjs --human ... --ai ...` | 0.10 处/千字 ✅ |
| 打包内容 | `npm pack --dry-run` | ✅ 36 files / 118.0 kB |

## 3. 验收状态

| 门槛 | 状态 |
|---|---|
| G1 人工正文误报 ≤1 处/千字 | ✅ 0.10（斗罗大陆原著 24 章 / 96,463 字） |
| 正控（故意写满 AI 味） | ✅ 11.7 处/千字 |
| G2 召回 ≥70% | ⏳ v0.2.0（需要作者句级标注） |
| G3 盲选 ≥7/10 | ⏳ v0.2.0（需要作者盲选） |
| G4 零编造 | ⏳ v0.2.0（需要真跑 `fix:true`） |
| 安装 / host / remote active | ✅ `include:novel-voice` 与 `include:novel-voice-remote` 均 `fiberPhase: active` |
| 面板三 tab / 导入 / 建档案 / 简报 | ✅ 作者已验收（侧栏能开、导入可用） |

## 4. 发布前手工验收清单

1. 刷新页面 → 新会话 → `/voice on` → 七个工具可见。
2. 书架：导入 1 部参考作品（「选文件夹」或「输入路径」）；确认列表出现「已统计/待统计」。
3. 书架：点一本的「移除」→ 确认 → 列表少一本、目录已删。
4. 风格：「用模板建档案」→ v1.1 已确认；技法卡能展开证据。
5. 风格：拖权重 → 保存 → 版本 +1；生成简报，确认 ≤600 字、无百分比、【写法】顺序随权重变化。
6. 学习：`voice_feedback record` 两次同一条 → 待确认出现 1 条；确认后档案多一条规则。
7. `/voice off` → 工具消失；`/voice on` 恢复。

## 5. 回滚

- 代码回滚：`git`（若已提交）或恢复上一版目录。
- profile 回滚：Plugins 里关闭 `dsh-novel-voice`，或 `plugin_manager set_bundle enabled:false`。
- 数据回滚：`.dsh-novel-voice/` 是纯文件；删掉即回到"未使用"状态。
- 档案回滚：`voice_profile rollback`（每次确认/改权重/回滚都有快照）。

## 6. 已知限制（对外说明口径）

- 不承诺"保证检测器判不出"；只承诺"可定位、可编译、可回滚"。
- 面板不直接改稿：检查与改写走 `voice_check` / `voice_polish`。
- 浏览器上传单文件 ≤6 MB；更大的整本用「选文件夹」。
- 没有作者旧稿时，学到的只是"你喜欢的写法"，不是"你怎么写"——书架里会提示。

## 7. 发布后

1. 打 tag `v0.1.0`（若进入 git）。
2. 把 `docs/acceptance-douluo-2026-11-17.md` 与 `CHANGELOG.md` 一起归档。
3. 下一版（0.2.0）首先补 G2–G4，再谈"去 AI 味"的对外承诺。

## 8. 发布结果（2026-11-17）

| 渠道 | 状态 |
|---|---|
| GitHub 仓库 | [DrizzleGig/dsh-novel-voice](https://github.com/DrizzleGig/dsh-novel-voice)：`main` + `v0.1.0` tag |
| GitHub Release | [v0.1.0](https://github.com/DrizzleGig/dsh-novel-voice/releases/tag/v0.1.0) |
| npm | 已提交 `dsh-novel-voice@0.1.0`；新包首版走 npm 的 staged publishing 审核，registry 暂为 `0.0.0-stage` 占位包，审核通过后 `0.1.0` 上线 |

发布 commit：`release: v0.1.0 — 创作风格：导入作品学写法，写前简报，写后定点改 AI 味`（`Co-authored-by: MiyueWinter <mingyue_11129@qq.com>`）。

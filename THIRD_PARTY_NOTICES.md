# 第三方来源与许可（voice）

> 状态：2026-11-25。`humanizer-lint` 的 zh-slop 规则已按 MIT vendor；`qu-ai-wei` / `sepia` 的症状分类与检查思路已 ported 到 `zh-fiction`（规则与文案重写）；其余仍为计划。`npm run check:licenses` 必须通过；GPL/AGPL/UNLICENSED/NOASSERTION 不作为 vendored 项。

## 计划采用

| 项目 | 许可 | 采用方式 | 用到的部分 | 状态 |
|---|---|---|---|---|
| humanizer-lint 1.6.0 | MIT | 规则移植 + vendor | `lib/vendor/humanizer-lint/zh-slop.json`（原样，sha256 见 manifest）；`lib/rules/packs/zh-slop-core.json` 是过滤派生包 | **vendored** |
| patina 9.1.0 | MIT | 模块抽取/改写 | `patterns/zh-*.md`、`src/features/stylometry.js`、`personas/zh` 的思路 | planned |
| sloptrim 0.9.7 | Apache-2.0 | 规则移植 | `references/patterns.md` 的结构类 pattern；附 NOTICE | planned |
| qu-ai-wei | MIT | 改写为规则 | `references/pattern-catalog.md` 的中文症状分类与证据等级；`zh-fiction.json` 文案重写 | **ported** |
| sepia | MIT | 检查清单/提示改写 | 中文小说症状分类与检查思路；`zh-fiction.json` 文案重写 | **ported** |
| humanizer | MIT；上游文本基于 CC BY-SA 4.0 | 只借思路 | 结构分类；不复制原文 | idea-only |
| BookNLP | MIT | 设计参考 | 角色聚类/引语归属算法；不进运行时 | idea-only |
| Yorishiro | MIT | schema 参考 | 人物卡字段/证据边界；不复制代码 | idea-only |

## 不采用

- SillyTavern（AGPL-3.0）、RisuAI（GPL-3.0）、AINovelStudio（AGPL-3.0）：只借产品思路，不复制代码/文案/资源。
- character-card-spec-v2、Personet、RoleLLM 代码、JGAAP、pystyl：无 LICENSE 或 NOASSERTION，不复制。
- StyleLLM：仓库 Apache-2.0，但 6B 权重许可独立；不带模型、不下载、不调用。

## 合规动作

- MIT/BSD：保留原版权行与完整许可；修改过的文件标注“Modified by dsh-novel-voice”。
- Apache-2.0：保留 `NOTICE`、标注修改、遵守专利条款、不得暗示上游背书。
- 每次 `vendored` 变更更新 `vendor/manifest.json` 的 `files[].sha256` 与 `LICENSES/`。
- 发布前跑 `npm run check:licenses` 与 `npm pack --dry-run`，确认 `LICENSES/`、本文件、manifest 都在包里。

# LICENSES

第三方代码/规则的完整许可全文放在这里，与 `vendor/manifest.json` 的 `files[]` 一一对应。

当前已 vendored：`humanizer-lint` 的 `rules/zh-slop.json`（MIT，见 `LICENSES/humanizer-lint/LICENSE`）。其余项目仍是 `THIRD_PARTY_NOTICES.md` 里的计划登记。等 `manifest.json` 出现新的 `status: "vendored"` 时：

1. 按项目建子目录，如 `LICENSES/humanizer-lint/LICENSE`。
2. 复制上游许可全文；Apache-2.0 项目同时复制 `NOTICE`。
3. 文件头写 SPDX、来源 URL、commit/hash、是否修改。
4. 跑 `npm run check:licenses`。

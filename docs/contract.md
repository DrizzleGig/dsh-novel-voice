# `dsh-novel-voice` 只读服务契约（0.2.0）

> 服务 key：`novelVoice` ｜ 契约版本：`service_version: 1` ｜ 只读
> 用途：conductor / fade / 其他插件读取「创作风格」的状态、简报与版本；不提供写入入口。

## Identity

```js
ctx.get('novelVoice').identity()
// {
//   plugin: 'dsh-novel-voice',
//   version: '0.2.0',
//   service_version: 1,
//   capabilities: ['voice.brief', 'voice.status', 'voice.revision'],
//   dir: '.dsh-novel-voice',
//   readOnly: true
// }
```

## 方法

```js
getStatus({ cwd, book }) → {
  book, works, profiles, profile, revision, updatedAt,
  contract: { available, project, count }
}

getRevision({ cwd, book }) → { revision, updatedAt, revisionDrift }

getBrief({ cwd, book, chapter, scene, cast, task, budget, profileId }) → {
  ok, markdown, chars, tokens, tokensEstimate, budget, revision, generated_at,
  scene, modes, rules, anchors, sample, sources, warnings
}

getRules({ cwd, book, profileId }) → { ok, profile, rules }

getWatchlist({ cwd, book }) → { entries: [...] }

onDidChange(cb) → unsubscribe
// cb({ book, revision, at, kind })
```

## 约定

- `cwd` 必须是工作区根目录的绝对路径；旧 `dir` 兼容一个 minor。
- `revision` 是每本书单调递增的整数；`state.json` 缺失时按 `audit.jsonl` 行数兜底，不写盘。
- 服务只读：不写档案、不写书架、不改正文、不调用模型。
- `voice_check` 是工具，不是服务方法；它返回 `status: 'completed' | 'skipped' | 'failed'`、`pass`、`revision`。
  检查未通过时 `status` 仍可为 `completed`，`pass:false`；**执行成功与检查通过分开**。

## 系列协作

- voice 可选读 `.dsh-novel-fanfic/<project>/project.json`（旧 `book.json` 兼容）里的禁忌数组；没有 fanfic 时返回 `available:false`，不报错。
- conductor 可以用 `getBrief` 的 `revision/generated_at` 做收据，用 `voice_check` 的 `findings` 做 verify；voice 不依赖 conductor。
- 不新增对兄弟插件的硬依赖；不 import 兄弟插件。

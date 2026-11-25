# `dsh-novel-voice` 只读服务契约（0.4.0）

> 服务 key：`novelVoice` ｜ 契约版本：`service_version: 1` ｜ 只读
> 用途：conductor / fade / 其他插件读取「创作风格」的状态、简报与版本；不提供写入入口。

## Identity

```js
ctx.get('novelVoice').identity()
// {
//   plugin: 'dsh-novel-voice',
//   version: '0.4.0',
//   service_version: 1,
//   capabilities: ['voice.brief', 'voice.status', 'voice.revision', 'voice.readerSignals', 'voice.rules', 'voice.fingerprint', 'voice.personaBrief'],
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
  scene, modes, rules, reader, anchors, sample, sources, warnings
}

getReaderSignals({ cwd, book }) → {
  ok, available, enabled, reason, scope, count, likes, dislikes, updatedAt, revision, generated_at
}
// 只含作者已确认的读者评分；默认关返回 { available:false, enabled:false, reason:'reader-off', scope:'book' }。
// scope 固定为 book：读者偏好按书聚合，不按章/角色过滤；likes/dislikes 每项 { quote, strength(1–5), tags, chapter }；不返回作品总分/平均分/排名。

getPersonaBrief({ cwd, book, chapter, cast }) → {
  ok, available, reason, personas, conflicts, markdown, chars, revision, generated_at
}
// 只含 confirmed 人物卡；cast 非空时按姓名/别名过滤；无卡返回 { available:false, reason:'no-confirmed' }。
// personas[] 每项 { personaId, name, aliases, workId, revision, claims[] }；claims[] 带 field/label/text/situation/evidenceCount/counterCount。

getRules({ cwd, book, profileId }) → { ok, profile, rules, packs, enabledPacks }
// packs 是内置规则包摘要（来源/许可/条数）；enabledPacks 是本书 rules.json 的开关，默认空。

getWatchlist({ cwd, book }) → { entries: [...] }

onDidChange(cb) → unsubscribe
// cb({ book, revision, at, kind })
```

## 约定

- `cwd` 必须是工作区根目录的绝对路径；旧 `dir` 兼容一个 minor。
- `revision` 是每本书单调递增的整数；`state.json` 缺失时按 `audit.jsonl` 行数兜底，不写盘。
- 服务只读：不写档案、不写书架、不改正文、不调用模型。
- 规则包默认关（`<book>/rules.json` 的 `enabled:[]`）；`voice_check` 只有显式传 `packs` 或本书已 `set-packs` 时才带回 `ruleFindings`；返回 `fingerprint` 但不返回分数/总分/排名。
- `profile.stylometry` 可选；建档/重建时有源文就生成，`getBrief` 在【硬约束】后附 2 行【指纹】；没有基线时省略，不报错。
- 人物卡默认 candidate；只有作者 confirm 的卡才进 `getPersonaBrief`；全部对白证据不能确认；`personas/` 只写 voice 根，不写正文。
- 读者/人物确认是本地工具动作，调用者即当前会话作者；没有多用户鉴权，事件里的 `by:'author'` 只是本地语义，不冒充远端身份。
- 读者评分默认关（`<book>/reader.json` 的 `on:false`）；只有 `voice_rating` 的 `confirm` 之后才会进入 `getBrief`/`getReaderSignals`。读者强度是读者输入，不是作品质量分；服务不返回总分/平均分/排名。
- `voice_check` 是工具，不是服务方法；它返回 `status: 'completed' | 'skipped' | 'failed'`、`pass`、`revision`。
  检查未通过时 `status` 仍可为 `completed`，`pass:false`；**执行成功与检查通过分开**。

## 系列协作

- voice 可选读 `.dsh-novel-fanfic/<project>/project.json`（旧 `book.json` 兼容）里的禁忌数组；没有 fanfic 时返回 `available:false`，不报错。
- conductor 可以用 `getBrief` 的 `revision/generated_at` 做收据，用 `voice_check` 的 `findings` 做 verify；voice 不依赖 conductor。
- 不新增对兄弟插件的硬依赖；不 import 兄弟插件。

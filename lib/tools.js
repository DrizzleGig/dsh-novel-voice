// lib/tools.js — 七个工具。工具只在 /voice on 之后可见（由 index.js 的 when 控制）。

import fs from 'node:fs/promises'
import path from 'node:path'
import { LIMITS, SCENES } from './consts.js'
import { chapterBody, normalizeOverrides, splitChapters } from './chapters.js'
import { decodeBuffer, importTargets, readWorkSource } from './import.js'
import { analyzeWithModel, measureWork, sampleSegments } from './learn.js'
import {
  TEMPLATES, addRules, confirmProfile, createProfile, listProfiles, loadProfile,
  regenerateProfile, rollbackProfile, setWeights, summaryOf, templateRules, updateProfile,
} from './profile.js'
import { briefForProfile } from './compiler.js'
import { lint, rank } from './check.js'
import { addEntry, readWatchlist, removeEntry } from './watchlist.js'
import { buildOverlapIndex } from './overlap.js'
import { repairText, selectWindows } from './repair.js'
import {
  acceptCandidate, aggregateFeedback, pendingCandidates, recordFeedback, rejectCandidate,
} from './feedback.js'
import {
  aggregateRatings, decideRatings, listRatings, readReaderConfig, recordRating, setReaderOn,
} from './ratings.js'
import { applyRules } from './rules/engine.js'
import { packSummaries, readPackConfig, resolvePacks, setPackConfig } from './rules/index.js'
import { fingerprint } from './fingerprint.js'
import { decidePersona, extractPersonas, listPersonas, proposePersona, showPersona } from './personas.js'
import { loadContract } from './contract.js'
import {
  defaultBook, fail, libraryChars, pathsFor, readLibrary, readSessions, readState, sha256, writeJson, writeLibrary,
} from './store.js'
import { countChars, clip, estimateTokens, normalizeText } from './text.js'

const output = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
}

const markdownOutput = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: value.markdown ?? JSON.stringify(value, null, 2) }],
}

const dirParam = { type: 'string', description: '工作区根目录（绝对路径），插件只在这里写 .dsh-novel-voice/' }
const bookParam = { type: 'string', description: '书名；默认取工作区目录名，对应 .dsh-novel-voice/<book>/' }

function requireDir(args) {
  if (typeof args?.dir !== 'string' || !args.dir.trim()) fail('bad-dir', 'dir 不能为空')
  return path.resolve(args.dir)
}

function resolveBook(args) {
  const dir = requireDir(args)
  return { dir, book: String(args?.book ?? '').trim() || defaultBook(dir) }
}

/** 只允许改工作区内已存在的普通文件；拒绝越界、符号链接指向外部与目录。 */
async function resolveWritableTarget(dir, input) {
  if (typeof input !== 'string' || !input.trim()) fail('write-requires-path', 'write:true 需要 path 指向要改的文件。')
  const root = path.resolve(dir)
  const target = path.resolve(root, input)
  if (target !== root && !target.startsWith(root + path.sep)) fail('path-outside', 'path 越出工作区，未写入。')
  let realRoot
  let realTarget
  try {
    realRoot = await fs.realpath(root)
    realTarget = await fs.realpath(target)
  } catch {
    fail('path-not-found', 'path 指向的文件不存在，未写入。')
  }
  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + path.sep)) {
    fail('path-outside', 'path 经符号链接越出工作区，未写入。')
  }
  const info = await fs.lstat(target)
  if (!info.isFile()) fail('path-not-file', 'path 必须是普通文件，未写入。')
  return target
}

async function loadBody(dir, book, args) {
  if (typeof args?.text === 'string' && args.text.trim()) return normalizeText(args.text)
  if (typeof args?.path === 'string' && args.path.trim()) {
    const buf = await fs.readFile(path.resolve(args.path))
    return normalizeText(decodeBuffer(buf).text)
  }
  if (args?.workId && args?.chapter) {
    const source = await readWorkSource(dir, book, args.workId)
    return chapterBody(source.text, source.chapters, args.chapter)
  }
  fail('no-text', '需要 text / path / (workId + chapter) 之一。')
}

export async function buildContext(dir, book, args = {}) {
  const watchlist = await readWatchlist(dir, book)
  const profile = await loadProfile(dir, book, args.profileId ?? null).catch(() => null)
  const overlap = await getOverlap(dir, book)
  const contract = await loadContract(dir, { project: args.project })
  return { watchlist, profile, overlap, contract, cast: Array.isArray(args.cast) ? args.cast : [] }
}

const overlapCache = new Map()
async function getOverlap(dir, book) {
  const library = await readLibrary(dir, book)
  const key = `${pathsFor(dir, book).bookDir}|${library.works.map((work) => work.hash).join(',')}`
  if (overlapCache.has(key)) return overlapCache.get(key)
  const sources = []
  for (const work of library.works) {
    try {
      const source = await readWorkSource(dir, book, work.workId)
      sources.push({ workId: work.workId, text: source.text })
    } catch {
      // 没有源文的作品不参与重合检测。
    }
  }
  const index = buildOverlapIndex(sources)
  overlapCache.set(key, index)
  if (overlapCache.size > 4) overlapCache.delete(overlapCache.keys().next().value)
  return index
}

async function executeImport(args) {
  const { dir, book } = resolveBook(args)
  const action = String(args?.action ?? 'import')
  if (action === 'list') {
    const library = await readLibrary(dir, book)
    return {
      ok: true,
      book,
      dir: pathsFor(dir, book).bookDir,
      works: library.works,
      capacity: {
        works: library.works.length,
        worksLimit: LIMITS.works,
        chars: libraryChars(library),
        charsLimit: LIMITS.libraryChars,
      },
      hint: library.works.length >= 2 ? null : '至少 2 部参考作品更容易看出风格差异；作者自己的旧稿越多，越像你。',
    }
  }
  if (action === 'import') {
    const result = await importTargets(dir, book, {
      paths: args.paths,
      folder: args.folder,
      path: args.path,
      sourceType: args.sourceType,
      title: args.title,
      keepSource: args.keepSource,
    })
    overlapCache.clear()
    return { ok: true, book, ...result }
  }
  if (action === 'remove') {
    const workId = String(args?.workId ?? '').trim()
    if (!workId) fail('bad-work', 'remove 需要 workId。')
    const library = await readLibrary(dir, book)
    const found = library.works.find((work) => work.workId === workId)
    if (!found) fail('no-work', `书架里没有 ${workId}。`)
    await fs.rm(pathsFor(dir, book).work(workId), { recursive: true, force: true })
    library.works = library.works.filter((work) => work.workId !== workId)
    await writeLibrary(dir, book, library)
    overlapCache.clear()
    return { ok: true, removed: workId, works: library.works.length }
  }
  const workId = String(args?.workId ?? '').trim()
  if (!workId) fail('bad-work', `${action} 需要 workId。`)
  const source = await readWorkSource(dir, book, workId)
  if (action === 'chapters') {
    return {
      ok: true,
      workId,
      chapters: source.chapters.map((chapter) => ({ index: chapter.index, title: chapter.title, chars: chapter.chars, start: chapter.start })),
    }
  }
  if (action === 'preview') {
    return {
      ok: true,
      workId,
      chars: countChars(source.text),
      chapters: source.chapters.slice(0, 5).map((chapter) => ({
        index: chapter.index,
        title: chapter.title,
        chars: chapter.chars,
        preview: clip(source.text.slice(chapter.start, chapter.end).replace(/\s+/g, ' '), 80),
      })),
    }
  }
  if (action === 'fixChapters') {
    const overrides = normalizeOverrides(args.overrides)
    if (!overrides) fail('bad-overrides', 'fixChapters 需要 overrides: [{start,title}]。')
    const chapters = splitChapters(source.text, overrides)
    await writeJson(path.join(pathsFor(dir, book).work(workId), 'chapters.json'), { schemaVersion: 1, workId, chapters, manual: true })
    const library = await readLibrary(dir, book)
    const entry = library.works.find((work) => work.workId === workId)
    if (entry) {
      entry.chapters = chapters.length
      entry.chapterFix = true
      await writeLibrary(dir, book, library)
    }
    return { ok: true, workId, chapters: chapters.map((chapter) => ({ index: chapter.index, title: chapter.title, chars: chapter.chars })) }
  }
  fail('bad-action', `voice_import 不认识 action=${action}`)
}

async function executeLearn(args, deps) {
  const { dir, book } = resolveBook(args)
  const action = String(args?.action ?? 'measure')
  const library = await readLibrary(dir, book)
  if (action === 'measure') {
    const ids = Array.isArray(args.workIds) && args.workIds.length ? args.workIds : library.works.map((work) => work.workId)
    if (!ids.length) fail('no-work', '书架是空的；先 voice_import 导入 txt/md。')
    const results = []
    for (const workId of ids) {
      try {
        results.push(await measureWork(dir, book, workId))
      } catch (error) {
        results.push({ workId, ok: false, error: String(error?.message ?? error) })
      }
    }
    return { ok: true, book, measured: results }
  }
  if (action === 'sample') {
    const sampled = await sampleSegments(dir, book, args.workIds, { mode: args.mode })
    return {
      ok: true,
      mode: sampled.mode,
      count: sampled.samples.length,
      chars: sampled.chars,
      tokensEstimate: sampled.tokensEstimate,
      samples: sampled.samples.map((sample) => ({
        workId: sample.workId,
        chapter: sample.chapter,
        scene: sample.scene,
        chars: sample.chars,
        preview: clip(sample.text, 60),
      })),
      rejected: sampled.rejected,
    }
  }
  if (action === 'analyze') {
    if (!deps?.llm) fail('model-unavailable', '本机没有可用的模型路由；分析可以先用 local（只统计）。')
    const result = await analyzeWithModel({ dir, book, workIds: args.workIds, mode: args.mode, llm: deps.llm })
    const profilesDir = path.join(pathsFor(dir, book).profiles)
    await writeJson(path.join(profilesDir, 'candidates.json'), {
      schemaVersion: 1,
      extracted: result.accepted,
      rejected: result.rejected,
      mode: result.mode,
      samples: result.samples.length,
      updatedAt: new Date().toISOString(),
    })
    return {
      ok: true,
      mode: result.mode,
      samples: result.samples.length,
      chars: result.chars,
      tokensEstimate: result.tokensEstimate,
      candidates: result.accepted,
      rejected: result.rejected,
      next: '把认可的卡用 voice_learn action=commit rules=[...] 写进档案；不认可的不要提交。',
    }
  }
  if (action === 'status') {
    return {
      ok: true,
      book,
      works: library.works.map((work) => ({ workId: work.workId, title: work.title, status: work.status, chars: work.chars, chapters: work.chapters })),
      profiles: await listProfiles(dir, book),
    }
  }
  if (action === 'cancel') return { ok: true, message: '本版的分析是同步执行的，没有后台任务可取消。' }
  if (action === 'commit') {
    const rules = Array.isArray(args.rules) ? args.rules : []
    if (!rules.length) fail('no-rules', 'commit 需要 rules: [...]（通常来自 analyze 的 candidates）。')
    const profile = await loadProfile(dir, book, args.profileId ?? null)
    if (!profile) fail('no-profile', '还没有档案；先 voice_profile action=create。')
    const { added } = await addRules(dir, book, profile.id, rules)
    return { ok: true, profileId: profile.id, added }
  }
  fail('bad-action', `voice_learn 不认识 action=${action}`)
}

async function executeProfile(args) {
  const { dir, book } = resolveBook(args)
  const action = String(args?.action ?? 'show')
  if (action === 'list') return { ok: true, profiles: await listProfiles(dir, book) }
  if (action === 'create') {
    const profile = await createProfile(dir, book, {
      name: args.name,
      workIds: args.workIds,
      cast: args.cast,
    })
    return { ok: true, profile: summaryOf(profile), bands: profile.bands, anchors: profile.anchors.length, samples: profile.samples.length }
  }
  if (action === 'templates') {
    return {
      ok: true,
      templates: TEMPLATES.map((template, index) => ({ id: index + 1, title: template.title, layer: template.layer, instruction: template.instruction, scope: template.scope })),
    }
  }
  if (action === 'apply') {
    const ids = Array.isArray(args.templateIds) ? args.templateIds : null
    const profile = await loadProfile(dir, book, args.profileId ?? null)
    if (!profile) fail('no-profile', '还没有档案；先 create。')
    const { added } = await addRules(dir, book, profile.id, templateRules(ids, { bands: profile.bands }))
    return { ok: true, profileId: profile.id, added }
  }
  if (action === 'packs') {
    const config = await readPackConfig(dir, book)
    return { ok: true, packs: await packSummaries(), enabled: config.enabled, updatedAt: config.updatedAt }
  }
  if (action === 'set-packs') {
    return { ok: true, ...(await setPackConfig(dir, book, args.packs)) }
  }
  const profile = await loadProfile(dir, book, args.profileId ?? null)
  if (!profile) fail('no-profile', '还没有档案。')
  if (action === 'show') {
    return {
      ok: true,
      profile: {
        ...profile,
        samples: (profile.samples ?? []).map((sample) => ({ ...sample, text: clip(sample.text, 120) })),
      },
    }
  }
  if (action === 'confirm') return { ok: true, profile: summaryOf(await confirmProfile(dir, book, profile.id)) }
  if (action === 'update') return { ok: true, profile: summaryOf(await updateProfile(dir, book, profile.id, args.patch ?? {})) }
  if (action === 'weights') return { ok: true, profile: summaryOf(await setWeights(dir, book, profile.id, args.blend ?? {})) }
  if (action === 'rollback') return { ok: true, profile: summaryOf(await rollbackProfile(dir, book, profile.id, args.version)) }
  if (action === 'regenerate') {
    const regenerated = await regenerateProfile(dir, book, profile.id)
    return { ok: true, profile: summaryOf(regenerated), anchors: regenerated.anchors.length, samples: regenerated.samples.length }
  }
  fail('bad-action', `voice_profile 不认识 action=${action}`)
}

async function executeBrief(args) {
  const { dir, book } = resolveBook(args)
  const brief = await briefForProfile(dir, book, {
    chapter: args.chapter,
    scene: args.scene,
    cast: args.cast,
    task: args.task,
    budget: args.budget,
    sampleBudget: args.sampleBudget,
    profileId: args.profileId,
    hardConstraints: args.hardConstraints,
  })
  return { book, ...brief }
}

async function executeCheck(args) {
  const { dir, book } = resolveBook(args)
  const action = String(args?.action ?? 'lint')
  const context = await buildContext(dir, book, args)
  if (action === 'rank') {
    const texts = Array.isArray(args.candidates) ? args.candidates.filter((text) => typeof text === 'string') : []
    if (texts.length < 2) fail('bad-candidates', 'rank 需要 2–3 段候选文本。')
    return { ok: true, book, ...rank(texts, context) }
  }
  const text = await loadBody(dir, book, args)
  const result = lint(text, context)
  const packs = await resolvePacks(dir, book, Array.isArray(args.packs) ? args.packs : null)
  const ruleResult = applyRules(text, packs)
  const styleFingerprint = fingerprint(text)
  const state = await readState(dir, book)
  return {
    ok: true,
    status: 'completed',
    pass: Number(result.summary?.block ?? 0) === 0 && Number(ruleResult.summary?.block ?? 0) === 0,
    revision: state.revision,
    book,
    chars: result.chars,
    findings: result.findings,
    ruleFindings: ruleResult.findings,
    ruleSummary: ruleResult.summary,
    rulePacks: ruleResult.packs,
    fingerprint: styleFingerprint,
    portrait: result.portrait,
    deviations: result.deviations,
    summary: result.summary,
    contract: result.contract,
    profile: context.profile ? { id: context.profile.id, version: context.profile.version, status: context.profile.status, revision: context.profile.revision ?? null } : null,
    note: 'findings 是线索，不是判决：warn 请逐条看，info 只是画像，block 必须改。ruleFindings 来自默认关闭的规则包，只有 voice_profile set-packs 开启后才为非空。pass:false 只表示有 block，不代表执行失败。',
  }
}

async function executePolish(args, deps) {
  const { dir, book } = resolveBook(args)
  if (args?.write === true && typeof args?.text === 'string' && args.text.trim()) {
    fail('write-requires-path', 'write:true 只用于直接改 path 指向的文件；不要同时传 text。')
  }
  const writeTarget = args?.write === true ? await resolveWritableTarget(dir, args.path) : null
  const text = await loadBody(dir, book, args)
  const context = await buildContext(dir, book, args)
  const findings = lint(text, context).findings
  const windows = selectWindows(findings, text)
  const fix = args?.fix === true
  if (!fix) {
    return {
      ok: true,
      dryRun: true,
      book,
      chars: countChars(text),
      findings,
      summary: findings.reduce((acc, finding) => {
        acc[finding.severity] = (acc[finding.severity] ?? 0) + 1
        return acc
      }, {}),
      windows: windows.length,
      estCalls: windows.length * LIMITS.maxRounds,
      message: '默认只报不改。确认要改再传 fix:true（会调用模型，每窗 1 次、最多 2 轮）。',
    }
  }
  if (!deps?.llm) fail('model-unavailable', '改写需要模型路由；当前不可用。可以只做 voice_check。')
  const result = await repairText({
    text,
    findings,
    llm: deps.llm,
    profile: context.profile,
    watchlist: context.watchlist,
    overlap: context.overlap,
    contract: context.contract,
    cast: context.cast,
    options: { maxRounds: args.maxRounds, maxWindows: args.maxWindows },
  })
  if (args.write === true && writeTarget) {
    const target = writeTarget
    const backup = `${target}.${Date.now()}.bak`
    await fs.copyFile(target, backup)
    await fs.writeFile(target, result.revised, 'utf8')
    result.written = target
    result.backup = backup
  }
  return { ok: true, book, ...result }
}

async function executeFeedback(args) {
  const { dir, book } = resolveBook(args)
  const action = String(args?.action ?? 'record')
  if (action === 'record') {
    const entry = await recordFeedback(dir, book, {
      kind: args.kind,
      text: args.text,
      draft: args.draft,
      final: args.final,
      scope: args.scope,
    })
    const aggregated = await aggregateFeedback(dir, book)
    return { ok: true, recorded: entry, pending: aggregated.pending.length }
  }
  if (action === 'aggregate') return { ok: true, ...(await aggregateFeedback(dir, book)) }
  if (action === 'pending') return { ok: true, pending: await pendingCandidates(dir, book) }
  if (action === 'confirm') {
    const candidate = await acceptCandidate(dir, book, args.profileId, String(args.candidateId ?? ''))
    const profile = await loadProfile(dir, book, args.profileId ?? null)
    if (!profile) fail('no-profile', '还没有档案。')
    await addRules(dir, book, profile.id, [{
      layer: 'L3',
      title: candidate.text.slice(0, 20) || '来自反馈的规则',
      observation: candidate.text,
      instruction: candidate.text,
      scope: [candidate.scope?.scene].filter(Boolean),
      status: 'confirmed',
      evidence: [],
    }])
    return { ok: true, profileId: profile.id, candidate: candidate.id }
  }
  if (action === 'reject') {
    return { ok: true, candidate: (await rejectCandidate(dir, book, String(args.candidateId ?? ''), args.reason)).id }
  }
  if (action === 'ban') {
    return { ok: true, ...(await addEntry(dir, book, { phrase: args.text, tier: 'book', why: args.reason ?? '作者标黑' })) }
  }
  if (action === 'unban') return { ok: true, ...(await removeEntry(dir, book, String(args.text ?? ''))) }
  fail('bad-action', `voice_feedback 不认识 action=${action}`)
}

async function executeRating(args) {
  const { dir, book } = resolveBook(args)
  const action = String(args?.action ?? 'status')
  if (action === 'record') {
    const entry = await recordRating(dir, book, {
      workId: args.workId,
      chapter: args.chapter,
      quote: args.quote,
      start: args.start,
      polarity: args.polarity,
      strength: args.strength,
      reader: args.reader,
      tags: args.tags,
      note: args.note,
    })
    return { ok: true, recorded: entry }
  }
  if (action === 'list') {
    return listRatings(dir, book, {
      chapter: args.chapter,
      polarity: args.polarity,
      status: args.status,
      limit: args.limit,
    })
  }
  if (action === 'aggregate') {
    return aggregateRatings(dir, book, { chapter: args.chapter })
  }
  if (action === 'confirm' || action === 'reject') {
    return decideRatings(dir, book, args.ids, action === 'confirm' ? 'confirmed' : 'rejected', args.reason)
  }
  if (action === 'status') {
    const config = await readReaderConfig(dir, book)
    const aggregate = await aggregateRatings(dir, book, { chapter: args.chapter })
    return { ok: true, enabled: config.on, updatedAt: config.updatedAt, ...aggregate }
  }
  if (action === 'enable' || action === 'disable') {
    return { ok: true, ...(await setReaderOn(dir, book, action === 'enable', args.reason)) }
  }
  fail('bad-action', `voice_rating 不认识 action=${action}`)
}

async function executePersona(args, deps = {}) {
  const { dir, book } = resolveBook(args)
  const action = String(args?.action ?? 'list')
  if (action === 'list') return { ok: true, personas: await listPersonas(dir, book) }
  if (action === 'show') return { ok: true, persona: await showPersona(dir, book, String(args.personaId ?? '')) }
  if (action === 'extract') {
    return {
      ok: true,
      ...(await extractPersonas(dir, book, {
        workId: args.workId,
        llm: deps.llm,
        maxBatches: args.maxBatches,
        maxChars: args.maxChars,
      })),
    }
  }
  if (action === 'propose') {
    const persona = await proposePersona(dir, book, {
      workId: args.workId,
      name: args.name,
      aliases: args.aliases,
      claims: args.claims,
    })
    return { ok: true, persona }
  }
  if (action === 'confirm' || action === 'reject') {
    return {
      ok: true,
      persona: await decidePersona(dir, book, String(args.personaId ?? ''), action === 'confirm' ? 'confirmed' : 'rejected', args.reason),
    }
  }
  fail('bad-action', `voice_persona 不认识 action=${action}`)
}

export function toolDefinitions(deps = {}) {
  return [
    {
      name: 'voice_import',
      description: '导入/管理本地书架。参考作品（别人写的）用来学技法；作者自己的旧稿（sourceType=own）用来学"你的呼吸"。只收 TXT/MD，UTF-8 或 GB18030。action=import 后建议先 preview 看分章是否正确，再用 fixChapters 手动修正。',
      parameters: {
        type: 'object',
        properties: {
          dir: dirParam,
          book: bookParam,
          action: { type: 'string', enum: ['import', 'list', 'remove', 'chapters', 'preview', 'fixChapters'], description: '默认 import' },
          paths: { type: 'array', items: { type: 'string' }, maxItems: 20, description: '文件或目录，支持多选' },
          folder: { type: 'string', description: '目录（递归导入其中的 txt/md）' },
          path: { type: 'string', description: '单个文件' },
          sourceType: { type: 'string', enum: ['reference', 'own'], description: 'reference=参考作品；own=作者自己的旧稿' },
          title: { type: 'string', description: '单本导入时的书名' },
          keepSource: { type: 'boolean', description: '默认 true：把源文复制进本地书库；false 只存路径' },
          workId: { type: 'string', description: 'remove / chapters / preview / fixChapters 需要' },
          overrides: {
            type: 'array',
            items: {
              type: 'object',
              properties: { start: { type: 'number' }, title: { type: 'string' } },
              required: ['start'],
              additionalProperties: false,
            },
            maxItems: 400,
            description: 'fixChapters 的分章覆盖：[{start, title}]，start 是正文字符偏移',
          },
        },
        required: ['dir', 'action'],
        additionalProperties: false,
      },
      output, execute: executeImport,
    },
    {
      name: 'voice_learn',
      description: '统计与技法提取。action=measure 全本地统计（0 模型）；action=sample 看会发送哪些片段；action=analyze 调模型提取技法卡（引文必须逐字回查，找不到就丢）。默认 local，不花钱。',
      parameters: {
        type: 'object',
        properties: {
          dir: dirParam,
          book: bookParam,
          action: { type: 'string', enum: ['measure', 'sample', 'analyze', 'status', 'cancel', 'commit'], description: '默认 measure' },
          workIds: { type: 'array', items: { type: 'string' }, maxItems: 20 },
          mode: { type: 'string', enum: ['local', 'quick', 'deep'], description: 'local=0 段；quick=每作品 4 段；deep=12 段' },
          rules: { type: 'array', items: { type: 'object', additionalProperties: true }, maxItems: 20, description: 'commit 要写进档案的技法卡' },
          profileId: { type: 'string' },
        },
        required: ['dir', 'action'],
        additionalProperties: false,
      },
      output, execute: (args) => executeLearn(args, deps),
    },
    {
      name: 'voice_profile',
      description: '档案：list/show/create/confirm/update/weights/rollback/templates/apply/packs/set-packs。create 需要先 measure；apply 把模板技法写进档案；packs 列出内置规则包（默认关），set-packs 开关本书要跑的规则包；只有 confirmed 的规则会进简报。',
      parameters: {
        type: 'object',
        properties: {
          dir: dirParam,
          book: bookParam,
          action: { type: 'string', enum: ['list', 'show', 'create', 'confirm', 'update', 'weights', 'rollback', 'templates', 'apply', 'regenerate', 'packs', 'set-packs'], description: '默认 show' },
          profileId: { type: 'string' },
          name: { type: 'string' },
          workIds: { type: 'array', items: { type: 'string' }, maxItems: 20 },
          cast: { type: 'array', items: { type: 'string' }, maxItems: 20, description: '在场人名；用于把样段里的人名遮掉' },
          templateIds: { type: 'array', items: { type: 'number' }, maxItems: 20 },
          patch: { type: 'object', additionalProperties: true, description: '{name, identity:{summary,keywords,avoid}}' },
          blend: { type: 'object', additionalProperties: true, description: '{global:{m-immersive,m-tight,m-restrained}, sceneWeights:{场景:{...}}}' },
          version: { type: 'string', description: 'rollback 的目标版本' },
          packs: { type: 'array', items: { type: 'string' }, maxItems: 20, description: 'set-packs：要启用的规则包 id；默认空，默认关' },
        },
        required: ['dir', 'action'],
        additionalProperties: false,
      },
      output, execute: executeProfile,
    },
    {
      name: 'voice_brief',
      description: '写某一章之前调用。返回 ≤600 字简报：总则、这一场、3–5 条写法、≤8 条禁语、1 条参考锚点；书架里有作者旧稿时再附 ≤400 字样段。简报里不出现统计数字。',
      parameters: {
        type: 'object',
        properties: {
          dir: dirParam,
          book: bookParam,
          chapter: { type: 'number', description: '章号' },
          scene: { type: 'string', enum: SCENES, description: '场景类型；不传按日常过渡' },
          cast: { type: 'array', items: { type: 'string' }, maxItems: 20 },
          task: { type: 'string', description: '本章任务，一句话' },
          budget: { type: 'number', description: '正文预算（字），默认 600' },
          sampleBudget: { type: 'number', description: '样段预算（字），默认 400' },
          profileId: { type: 'string' },
          hardConstraints: { type: 'object', additionalProperties: true, description: '{pov, address[], forbidden[]}' },
        },
        required: ['dir'],
        additionalProperties: false,
      },
      output: markdownOutput, execute: executeBrief,
    },
    {
      name: 'voice_check',
      description: '写完之后检查。零模型、可离线。action=lint 返回带位置的 findings（warn 逐条看，info 只是画像，block 必须改），并附 fingerprint（文体指纹，无评分）与默认关闭的 ruleFindings（规则包需先 voice_profile set-packs 开启）；action=rank 对 2–3 份候选给"谁更接近档案 + 命中更少"，不判断好坏。',
      parameters: {
        type: 'object',
        properties: {
          dir: dirParam,
          book: bookParam,
          project: { type: 'string', description: '同人项目名（.dsh-novel-fanfic/<project>）；多项目工作区必须显式指定，空/歧义时契约不注入' },
          action: { type: 'string', enum: ['lint', 'rank'], description: '默认 lint' },
          text: { type: 'string', description: '正文全文（与 path / workId+chapter 三选一）' },
          path: { type: 'string', description: '本地 .txt/.md 路径' },
          workId: { type: 'string' },
          chapter: { type: 'number' },
          candidates: { type: 'array', items: { type: 'string' }, maxItems: 3, description: 'rank 的候选文本' },
          cast: { type: 'array', items: { type: 'string' }, maxItems: 20 },
          packs: { type: 'array', items: { type: 'string' }, maxItems: 20, description: '规则包 id；不传则按本书 rules.json 的配置，默认空（默认关）' },
          profileId: { type: 'string' },
        },
        required: ['dir', 'action'],
        additionalProperties: false,
      },
      output, execute: executeCheck,
    },
    {
      name: 'voice_polish',
      description: '定点改写。默认只报不改（dryRun），传 fix:true 才调模型；只改命中窗口，窗口外不动；五道校验不过就回退该窗并标 needs-author。绝不新增事实。',
      parameters: {
        type: 'object',
        properties: {
          dir: dirParam,
          book: bookParam,
          project: { type: 'string', description: '同人项目名；多项目工作区必须显式指定，空/歧义时契约不注入' },
          text: { type: 'string' },
          path: { type: 'string' },
          workId: { type: 'string' },
          chapter: { type: 'number' },
          scene: { type: 'string', enum: SCENES },
          fix: { type: 'boolean', description: '默认 false：只报不改' },
          write: { type: 'boolean', description: '默认 false。true 且给了 path 时写回原文件（先备份 .bak）' },
          maxRounds: { type: 'number', description: '默认 2' },
          maxWindows: { type: 'number', description: '默认 20' },
          cast: { type: 'array', items: { type: 'string' }, maxItems: 20 },
        },
        required: ['dir'],
        additionalProperties: false,
      },
      output, execute: (args) => executePolish(args, deps),
    },
    {
      name: 'voice_feedback',
      description: '反馈只记账，不自动改档案。record 落盘并聚合候选（≥2 次同 scope 才进待确认）；confirm 才写进档案；ban 把一句套话加进本书禁语表。',
      parameters: {
        type: 'object',
        properties: {
          dir: dirParam,
          book: bookParam,
          action: { type: 'string', enum: ['record', 'aggregate', 'pending', 'confirm', 'reject', 'ban', 'unban'], description: '默认 record' },
          kind: { type: 'string', enum: ['rule', 'like', 'dislike', 'ab', 'comment', 'edit', 'accept', 'reject'] },
          text: { type: 'string', description: '作者意见 / 要禁的短语' },
          draft: { type: 'string' },
          final: { type: 'string' },
          scope: { type: 'object', additionalProperties: true, description: '{scene, chapter, profileId}' },
          candidateId: { type: 'string' },
          profileId: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['dir', 'action'],
        additionalProperties: false,
      },
      output, execute: executeFeedback,
    },
    {
      name: 'voice_rating',
      description: '读者评分/引用账本。读者引用喜欢或不喜欢的原文段落并打 1–5 强度；默认关，作者 confirm 后才进写前简报与 beat 的【写法】；不训练模型、不给作品总分。record 需要 workId+chapter+quote，引用必须能在该章原文找到。',
      parameters: {
        type: 'object',
        properties: {
          dir: dirParam,
          book: bookParam,
          action: { type: 'string', enum: ['record', 'list', 'aggregate', 'confirm', 'reject', 'status', 'enable', 'disable'], description: '默认 status' },
          workId: { type: 'string', description: 'record 必填：书架里的作品 id' },
          chapter: { type: 'number', description: 'record 必填：章号' },
          quote: { type: 'string', description: 'record 必填：读者引用的原文短段（≤200 字）' },
          start: { type: 'number', description: '可选：引用在该章内的 UTF-16 起点；不传则自动查找' },
          polarity: { type: 'string', enum: ['like', 'dislike'], description: 'record 必填：喜欢/不喜欢' },
          strength: { type: 'number', description: '1–5，默认 3' },
          reader: { type: 'string', description: '读者标识；可匿名或留空' },
          tags: { type: 'array', items: { type: 'string' }, maxItems: 8, description: '可选标签，如“短句”“留白”“段末升华”' },
          note: { type: 'string', description: '可选短评' },
          ids: { type: 'array', items: { type: 'string' }, maxItems: 200, description: 'confirm/reject 需要' },
          status: { type: 'string', enum: ['pending', 'confirmed', 'rejected'], description: 'list 过滤' },
          limit: { type: 'number', description: 'list 返回条数，默认 100，最多 200' },
          reason: { type: 'string', description: 'confirm/reject 或 enable/disable 的原因' },
        },
        required: ['dir', 'action'],
        additionalProperties: false,
      },
      output, execute: executeRating,
    },
    {
      name: 'voice_persona',
      description: '人物画像账本：整书证据卡。extract 分批读作品、模型只提案、证据逐条回查，落 candidate；propose 接收手工/模型提案；每条证据的短引用必须能在 workId+chapter 原文找到；作者 confirm 后才生效；全部对白证据不能确认。不写正文、不训练模型、不注入 brief（0.3.2 才提供 getPersonaBrief）。',
      parameters: {
        type: 'object',
        properties: {
          dir: dirParam,
          book: bookParam,
          action: { type: 'string', enum: ['list', 'show', 'propose', 'extract', 'confirm', 'reject'], description: '默认 list' },
          personaId: { type: 'string', description: 'show/confirm/reject 需要' },
          workId: { type: 'string', description: 'propose/extract 必填：人物来源作品' },
          name: { type: 'string', description: 'propose 必填：人物名' },
          aliases: { type: 'array', items: { type: 'string' }, maxItems: 8, description: '别名/称谓' },
          claims: {
            type: 'array', maxItems: 12,
            description: '主张：{field, text, situation?, confidence?, evidence:[{chapter, quote, channel, start?}], counterEvidence?}；field=personality/values/decision/relationship/stress/behavior/taboo，channel=narration/inner/action/choice/dialogue',
            items: { type: 'object', additionalProperties: true },
          },
          reason: { type: 'string', description: 'confirm/reject 原因' },
          maxBatches: { type: 'number', description: 'extract 最多批次数，默认 8，最多 30' },
          maxChars: { type: 'number', description: 'extract 每批最多字符，默认 6000' },
        },
        required: ['dir', 'action'],
        additionalProperties: false,
      },
      output, execute: (args) => executePersona(args, deps),
    },
  ]
}


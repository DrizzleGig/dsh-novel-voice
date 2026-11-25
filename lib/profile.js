// lib/profile.js — 档案：合成、确认、权重、版本、回滚、模板。档案是账本，不是报告。

import fs from 'node:fs/promises'
import path from 'node:path'
import { LIMITS, MODES, DEFAULT_BLEND } from './consts.js'
import { buildBands } from './bands.js'
import { splitParagraphs, splitSentences, countChars, clip, round } from './text.js'
import { readWorkSource } from './import.js'
import { buildScenes } from './scenes.js'
import { baselineFromFingerprints, fingerprint } from './fingerprint.js'
import {
  audit, bumpRevision, fail, pathsFor, readJson, readLibrary, readState, sha256, writeJson,
} from './store.js'

const SCENE_ORDER = ['对话', '动作战斗', '心理情感', '描写环境', '日常过渡', '悬疑对峙']

export const TEMPLATES = [
  { title: '紧张场景不命名情绪', layer: 'L3', instruction: '紧张场景里写动作、停顿、生理反应，不写"他很紧张/她感到害怕"这类命名；必要心理信息用一句话带过。', scope: ['悬疑对峙', '动作战斗'], check: { detector: 'emotion-naming', severity: 'warn' } },
  { title: '段末不总结', layer: 'L3', instruction: '段落收在动作、物件或一句没说完的话上；不要用"就这样""从此""他不知道的是"收尾。', scope: ['日常过渡', '悬疑对峙'], check: { detector: 'paragraph-closure', severity: 'warn' } },
  { title: '对话留潜台词', layer: 'L3', instruction: '对话允许答非所问；每三句至少一句带动作或停顿；不要把人物想说的直接说完。', scope: ['对话', '悬疑对峙'], check: { detector: 'negation-parallel', severity: 'info' } },
  { title: '信息后置披露', layer: 'L3', instruction: '先给现象和动作，解释放在人物真正需要的时候；不要开篇交代全部因果。', scope: ['悬疑对峙', '日常过渡'], check: null },
  { title: '少用长比喻', layer: 'L2', instruction: '需要比喻时用短、具体、能摸到的东西；不要"仿佛整个世界都……"这种拔高喻。', scope: [], check: { detector: 'stale-metaphor', severity: 'hint' } },
  { title: '不解释人物动机', layer: 'L3', instruction: '人物的选择让动作和后果自己说话；叙述者不替他解释"因为太在乎所以……"。', scope: ['心理情感'], check: { detector: 'explanation', severity: 'info' } },
  { title: '短句推进动作', layer: 'L2', instruction: '动作段落以短句为主，一句一个动作；不要连续三个长句拖住节奏。', scope: ['动作战斗'], check: { detector: 'rhythm', severity: 'info' } },
  { title: '允许不完整', layer: 'L1', instruction: '允许断句、省主语、单独成段的一句话；不要为了语法完整把话说满。', scope: [], check: null },
]

export function ruleId(index) {
  return `r-${String(index).padStart(3, '0')}`
}

/** 把已确认的规则挂到它适用的模式上；编译器据此让权重真的影响选条。 */
export function assignModeRules(profile) {
  const rules = (profile?.rules ?? []).filter((rule) => rule.status === 'confirmed')
  for (const mode of profile.modes ?? []) {
    const when = mode.when ?? []
    mode.ruleIds = rules
      .filter((rule) => {
        const scopes = rule.scope?.sceneTypes ?? []
        return scopes.length === 0 || scopes.some((scene) => when.includes(scene))
      })
      .map((rule) => rule.id)
  }
  return profile
}

export async function listProfiles(dir, book) {
  const { profiles } = pathsFor(dir, book)
  let entries = []
  try {
    entries = await fs.readdir(profiles, { withFileTypes: true })
  } catch {
    return []
  }
  const out = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const profile = await readJson(path.join(profiles, entry.name, 'profile.json'), null)
    if (profile) out.push(summaryOf(profile))
  }
  return out.sort((a, b) => String(a.id).localeCompare(String(b.id)))
}

export function summaryOf(profile) {
  return {
    id: profile.id,
    name: profile.name,
    book: profile.book,
    version: profile.version,
    status: profile.status,
    updatedAt: profile.updatedAt,
    rules: (profile.rules ?? []).filter((rule) => rule.status === 'confirmed').length,
    candidates: (profile.rules ?? []).filter((rule) => rule.status === 'candidate').length,
    evidenceCount: (profile.rules ?? []).reduce((sum, rule) => sum + (rule.supporting_evidence ?? []).length, 0),
    sources: (profile.sources ?? []).length,
    anchors: (profile.anchors ?? []).length,
    samples: (profile.samples ?? []).length,
    revision: Number.isInteger(profile.revision) ? profile.revision : null,
  }
}

export async function loadProfile(dir, book, profileId = null) {
  const list = await listProfiles(dir, book)
  if (!list.length) return null
  const target = profileId ? list.find((item) => item.id === profileId) : (list.find((item) => item.status === 'confirmed') ?? list[0])
  if (!target) fail('no-profile', `没有档案 ${profileId}。`)
  return await readJson(path.join(pathsFor(dir, book).profile(target.id), 'profile.json'), null)
}

async function writeVersion(dir, book, profile, meta = {}) {
  const dirOfProfile = pathsFor(dir, book).profile(profile.id)
  const versions = path.join(dirOfProfile, 'versions')
  let files = []
  try {
    files = (await fs.readdir(versions)).filter((name) => /^v\d+\.json$/.test(name))
  } catch {
    files = []
  }
  const before = await readState(dir, book)
  const parentRevision = Number.isInteger(profile.revision) ? profile.revision : before.revision
  const state = await bumpRevision(dir, book, { kind: meta.action ?? 'profile-write' })
  profile.revision = state.revision
  profile.parentRevision = Number.isInteger(meta.parentRevision)
    ? meta.parentRevision
    : (Number.isInteger(parentRevision) ? parentRevision : before.revision)
  profile.action = meta.action ?? 'write'
  profile.reason = meta.reason ?? null
  profile.at = state.updatedAt
  if (meta.restoredFrom !== undefined) profile.restoredFrom = meta.restoredFrom
  profile.versions = [...(profile.versions ?? []), profile.version].slice(-20)
  const next = String(files.length + 1).padStart(4, '0')
  await writeJson(path.join(versions, `v${next}.json`), profile)
  await writeJson(path.join(dirOfProfile, 'profile.json'), profile)
}

function bump(version) {
  const parts = String(version ?? '1.0').split('.').map(Number)
  return `${parts[0] || 1}.${(parts[1] || 0) + 1}`
}

async function collectWorkStats(dir, book) {
  const library = await readLibrary(dir, book)
  const out = []
  for (const work of library.works) {
    const stats = await readJson(path.join(pathsFor(dir, book).work(work.workId), 'stats.json'), null)
    if (stats) out.push({ workId: work.workId, title: work.title, chars: work.chars, sourceType: work.sourceType, stats: stats.stats })
  }
  return out
}

function maskNames(text, cast) {
  let out = String(text ?? '')
  for (const name of cast ?? []) {
    if (!name || name.length < 2) continue
    out = out.split(name).join('他')
  }
  return out
}

function cutToChars(text, max) {
  const body = String(text ?? '')
  if (countChars(body) <= max) return body
  let out = ''
  for (const sentence of splitSentences(body)) {
    if (countChars(out + sentence.text) > max) break
    out += sentence.text
  }
  return out || body.slice(0, max)
}

const HEADING_RE = /^[一二三四五六七八九十百千0-9]+$|^第.{1,8}[章回节卷]/

/** TXT 里章节标题常和正文挤在一行；这里按标题行与空行切块，标题本身不进样段。 */
function blocksOf(text) {
  const out = []
  let current = []
  const flush = () => {
    if (current.length) out.push(current.join('\n'))
    current = []
  }
  for (const line of String(text ?? '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) {
      flush()
      continue
    }
    if (HEADING_RE.test(trimmed)) {
      flush()
      continue
    }
    current.push(line)
  }
  flush()
  return out
}

function sampleForScene(source, scene, cast) {
  let buffer = []
  for (const block of blocksOf(source.text)) {
    const type = buildScenes(block)[0]?.type
    if (type !== scene) {
      buffer = []
      continue
    }
    buffer.push(block)
    const joined = buffer.join('\n')
    if (countChars(joined) < 120) continue
    return maskNames(cutToChars(joined, LIMITS.sampleChars), cast)
  }
  return null
}

const CHAPTER_HEAD_RE = /^第\s*[0-9零〇一二三四五六七八九十百千两]+\s*[章回节卷]/

function shortQuote(source, scene) {
  const paragraphs = splitParagraphs(source.text)
  const bodyStart = source.chapters?.[0]?.start ?? 0
  for (const paragraph of paragraphs) {
    if (paragraph.start < bodyStart + 20) continue
    const type = buildScenes(paragraph.text)[0]?.type
    if (type !== scene) continue
    const sentences = splitSentences(paragraph.text).filter((sentence) => countChars(sentence.text) >= 15)
    for (const sentence of sentences) {
      if (CHAPTER_HEAD_RE.test(sentence.text.trim())) continue
      const chars = countChars(sentence.text)
      if (chars <= 60) {
        return { text: sentence.text, workId: source.meta.workId, chapter: null }
      }
    }
  }
  return null
}

export function autoSummary(bands = {}) {
  const parts = []
  const sentence = bands?.sentenceMean?.band
  if (Array.isArray(sentence)) {
    const center = (Number(sentence[0]) + Number(sentence[1])) / 2
    parts.push(center >= 26 ? '句子偏长' : center <= 18 ? '句子偏短' : '句子中等')
  }
  const paragraph = bands?.paragraphMean?.band
  if (Array.isArray(paragraph)) {
    const center = (Number(paragraph[0]) + Number(paragraph[1])) / 2
    parts.push(center >= 42 ? '段落偏长' : center <= 28 ? '段落偏短' : '段落中等')
  }
  const dialogue = bands?.dialogueRatio?.band
  if (Array.isArray(dialogue)) {
    const center = (Number(dialogue[0]) + Number(dialogue[1])) / 2
    parts.push(center >= 0.3 ? '对话偏多' : center <= 0.15 ? '对话偏少' : '对话适中')
  }
  return parts.join('、')
}

async function collectMaterial(dir, book, works, cast = []) {
  const library = await readLibrary(dir, book)
  const anchors = []
  const samples = []
  for (const work of works) {
    if (anchors.length >= 6 && samples.length >= 6) break
    const entry = library.works.find((item) => item.workId === work.workId)
    let source
    try {
      source = await readWorkSource(dir, book, work.workId)
    } catch {
      continue
    }
    if (entry?.sourceType === 'own') {
      for (const scene of SCENE_ORDER) {
        if (samples.length >= 6) break
        if (samples.some((sample) => sample.scene === scene)) continue
        const text = sampleForScene(source, scene, cast)
        if (text) samples.push({ kind: 'own', scene, text, workId: work.workId, chapter: null })
      }
    } else {
      for (const scene of SCENE_ORDER) {
        if (anchors.length >= 6) break
        if (anchors.some((anchor) => anchor.scene === scene)) continue
        const quote = shortQuote(source, scene)
        if (quote) anchors.push({ kind: 'reference', scene, ...quote })
      }
    }
  }
  return { anchors, samples }
}

export async function regenerateProfile(dir, book, profileId) {
  const profile = await loadProfile(dir, book, profileId)
  if (!profile) fail('no-profile', '还没有档案。')
  const works = (profile.sources ?? []).map((source) => ({ workId: source.workId }))
  if (!works.length) fail('no-source', '档案里没有来源作品。')
  const { anchors, samples } = await collectMaterial(dir, book, works, [])
  const stylometry = await buildStylometry(dir, book, works.map((work) => work.workId))
  profile.anchors = anchors
  profile.samples = samples
  if (stylometry) profile.stylometry = stylometry
  if (!profile.identity?.summary || /待作者确认/.test(profile.identity.summary)) {
    profile.identity = profile.identity ?? {}
    profile.identity.summary = profile.provisional
      ? '样本偏少，画像仅供参考。'
      : `自动画像：${autoSummary(profile.bands)}。用 voice_profile update 改成你自己的话。`
  }
  profile.version = bump(profile.version)
  profile.updatedAt = new Date().toISOString()
  await writeVersion(dir, book, profile, { action: 'regenerate' })
  await audit(dir, book, { event: 'profile-regenerate', profileId: profile.id, anchors: anchors.length, samples: samples.length })
  return profile
}

async function buildStylometry(dir, book, workIds = []) {
  const fingerprints = []
  for (const workId of workIds) {
    try {
      const source = await readWorkSource(dir, book, workId)
      const chapters = Array.isArray(source.chapters) && source.chapters.length
        ? source.chapters
        : [{ start: 0, end: source.text.length }]
      for (const chapter of chapters) {
        const text = source.text.slice(chapter.start, chapter.end)
        if (countChars(text) < 200) continue
        fingerprints.push(fingerprint(text))
      }
    } catch {
      // 源文缺失不阻断档案；指纹缺失时简报省略该段。
    }
  }
  return fingerprints.length ? baselineFromFingerprints(fingerprints) : null
}

export async function createProfile(dir, book, options = {}) {
  const works = await collectWorkStats(dir, book)
  if (!works.length) fail('no-stats', '书架里还没有已统计的作品；先跑 voice_learn measure。')
  const ids = Array.isArray(options.workIds) && options.workIds.length
    ? works.filter((work) => options.workIds.includes(work.workId))
    : works
  if (!ids.length) fail('no-work', '指定的作品都不在书架里，或还没统计。')

  const totalChars = ids.reduce((sum, work) => sum + (Number(work.chars) || 0), 0)
  const provisional = totalChars < LIMITS.usableChars
  const bands = buildBands(ids, { provisional })
  const stylometry = await buildStylometry(dir, book, ids.map((work) => work.workId))
  const { anchors, samples } = await collectMaterial(dir, book, ids, options.cast ?? [])

  const now = new Date().toISOString()
  const profile = {
    schemaVersion: 1,
    id: `p-${String((await listProfiles(dir, book)).length + 1).padStart(3, '0')}`,
    book: path.basename(pathsFor(dir, book).bookDir),
    name: String(options.name ?? '我的叙事风格').slice(0, 40),
    version: '1.0',
    status: 'provisional',
    createdAt: now,
    updatedAt: now,
    sources: ids.map((work) => ({
      workId: work.workId,
      role: work.sourceType === 'own' ? 'own' : 'reference',
      weight: round(1 / ids.length),
      learn: ['all'],
    })),
    identity: {
      summary: provisional
        ? '样本偏少，画像仅供参考。'
        : `自动画像：${autoSummary(bands)}。用 voice_profile update 改成你自己的话。`,
      keywords: [],
      avoid: [],
    },
    bands,
    stylometry,
    modes: MODES.map((mode) => ({ ...mode, ruleIds: [] })),
    blend: JSON.parse(JSON.stringify(DEFAULT_BLEND)),
    rules: [],
    anchors,
    samples,
    conflicts: [],
    provisional,
  }
  assignModeRules(profile)
  await writeVersion(dir, book, profile, { action: 'create' })
  await audit(dir, book, { event: 'profile-create', profileId: profile.id, works: ids.length, chars: totalChars, provisional })
  return profile
}

export async function updateProfile(dir, book, profileId, patch = {}) {
  const profile = await loadProfile(dir, book, profileId)
  if (!profile) fail('no-profile', '还没有档案。')
  if (patch.name != null) profile.name = String(patch.name).slice(0, 40)
  if (patch.identity && typeof patch.identity === 'object') {
    profile.identity = {
      ...profile.identity,
      summary: String(patch.identity.summary ?? profile.identity.summary).slice(0, 400),
      keywords: Array.isArray(patch.identity.keywords) ? patch.identity.keywords.slice(0, 12).map(String) : profile.identity.keywords,
      avoid: Array.isArray(patch.identity.avoid) ? patch.identity.avoid.slice(0, 12).map(String) : profile.identity.avoid,
    }
  }
  if (Array.isArray(patch.characterStyles)) {
    profile.characterStyles = patch.characterStyles.slice(0, 8).map((item) => ({
      role: ['protagonist', 'supporting', 'other'].includes(item?.role) ? item.role : 'other',
      personaId: String(item?.personaId ?? '').slice(0, 80),
      cast: Array.isArray(item?.cast) ? item.cast.slice(0, 8).map((name) => String(name).slice(0, 20)) : [],
      weight: Number.isFinite(Number(item?.weight)) ? Math.max(0, Math.min(2, Number(item.weight))) : 1,
    })).filter((item) => item.personaId)
  }
  profile.version = bump(profile.version)
  profile.updatedAt = new Date().toISOString()
  await writeVersion(dir, book, profile, { action: 'update' })
  return profile
}

export async function confirmProfile(dir, book, profileId) {
  const profile = await loadProfile(dir, book, profileId)
  if (!profile) fail('no-profile', '还没有档案。')
  profile.status = 'confirmed'
  profile.version = bump(profile.version)
  profile.updatedAt = new Date().toISOString()
  await writeVersion(dir, book, profile, { action: 'confirm' })
  await audit(dir, book, { event: 'profile-confirm', profileId: profile.id, version: profile.version })
  return profile
}

export async function setWeights(dir, book, profileId, blend = {}) {
  const profile = await loadProfile(dir, book, profileId)
  if (!profile) fail('no-profile', '还没有档案。')
  if (blend.global && typeof blend.global === 'object') {
    profile.blend.global = normalizeWeights(blend.global)
  }
  if (blend.sceneWeights && typeof blend.sceneWeights === 'object') {
    for (const [scene, weights] of Object.entries(blend.sceneWeights)) {
      profile.blend.sceneWeights[scene] = normalizeWeights(weights)
    }
  }
  profile.version = bump(profile.version)
  profile.updatedAt = new Date().toISOString()
  await writeVersion(dir, book, profile, { action: 'weights' })
  return profile
}

function normalizeWeights(weights) {
  const ids = MODES.map((mode) => mode.id)
  const raw = {}
  for (const id of ids) raw[id] = Math.max(0, Number(weights?.[id] ?? 0))
  let sum = ids.reduce((total, id) => total + raw[id], 0)
  if (sum <= 0) {
    raw[ids[0]] = 1
    sum = 1
  }
  const out = {}
  for (const id of ids) out[id] = round(raw[id] / sum)
  return out
}

function normalizeEvidence(items) {
  if (!Array.isArray(items)) return []
  return items.map((item) => {
    const quote = String(item?.quote ?? '').slice(0, 120)
    return {
      workId: item?.workId ?? null,
      chapter: Number.isInteger(item?.chapter) ? item.chapter : null,
      start: Number.isInteger(item?.start) ? item.start : null,
      end: Number.isInteger(item?.end) ? item.end : null,
      quote,
      hash: item?.hash ?? (quote ? sha256(quote) : null),
      role: item?.role === 'counter' ? 'counter' : 'support',
    }
  }).filter((item) => item.quote)
}

export async function addRules(dir, book, profileId, rules) {
  const profile = await loadProfile(dir, book, profileId)
  if (!profile) fail('no-profile', '还没有档案。')
  let index = (profile.rules ?? []).length
  const added = []
  for (const rule of rules ?? []) {
    index += 1
    added.push({
      id: ruleId(index),
      layer: rule.layer ?? 'L3',
      title: String(rule.title ?? '').slice(0, 40),
      rule: String(rule.observation ?? rule.rule ?? '').slice(0, 240),
      instruction: String(rule.instruction ?? '').slice(0, 240),
      scope: { sceneTypes: Array.isArray(rule.scope) ? rule.scope : [] },
      check: rule.check ?? null,
      status: rule.status === 'candidate' ? 'candidate' : 'confirmed',
      confidence: Number(rule.confidence ?? 0.7),
      supporting_evidence: normalizeEvidence(rule.evidence),
      contradicting_evidence: normalizeEvidence(rule.counterEvidence),
      observations: 1,
      version: 1,
    })
  }
  profile.rules = [...(profile.rules ?? []), ...added]
  assignModeRules(profile)
  profile.version = bump(profile.version)
  profile.updatedAt = new Date().toISOString()
  await writeVersion(dir, book, profile, { action: 'add-rules' })
  return { profile, added }
}

export async function rollbackProfile(dir, book, profileId, version) {
  const profile = await loadProfile(dir, book, profileId)
  if (!profile) fail('no-profile', '还没有档案。')
  const versionsDir = path.join(pathsFor(dir, book).profile(profile.id), 'versions')
  const files = (await fs.readdir(versionsDir)).filter((name) => /^v\d+\.json$/.test(name)).sort()
  if (!files.length) fail('no-versions', '没有历史版本可回滚。')
  let target = null
  if (version) {
    for (const file of files.reverse()) {
      const candidate = await readJson(path.join(versionsDir, file), null)
      if (candidate?.version === version) {
        target = candidate
        break
      }
    }
  } else if (files.length >= 2) {
    target = await readJson(path.join(versionsDir, files[files.length - 2]), null)
  }
  if (!target) fail('no-version', `找不到版本 ${version}。`)
  const current = profile
  const restoredFrom = Number.isInteger(target.revision) ? target.revision : target.version
  target.updatedAt = new Date().toISOString()
  target.version = bump(current.version)
  target.status = current.status
  await writeVersion(dir, book, target, {
    action: 'rollback',
    parentRevision: current.revision,
    restoredFrom,
  })
  await audit(dir, book, { event: 'profile-rollback', profileId: target.id, to: restoredFrom })
  return target
}

function modeSummary(blend = {}) {
  return Object.entries(blend.global ?? {})
    .map(([id, value]) => `${id.replace('m-', '')} ${Math.round(Number(value) * 100)}%`)
    .join(' / ')
}

function diffProfiles(previous, next) {
  const out = []
  const before = new Map((previous?.rules ?? []).map((rule) => [rule.id, rule]))
  const after = new Map((next?.rules ?? []).map((rule) => [rule.id, rule]))
  for (const [id, rule] of after) {
    if (!before.has(id)) out.push({ kind: 'rule-added', text: `新增「${rule.title}」` })
  }
  for (const [id, rule] of before) {
    if (!after.has(id)) {
      out.push({ kind: 'rule-removed', text: `移除「${rule.title}」` })
      continue
    }
    const now = after.get(id)
    if (rule.status !== now.status) {
      out.push({ kind: 'rule-status', text: `「${rule.title}」${rule.status} → ${now.status}` })
    } else if (rule.instruction !== now.instruction) {
      out.push({ kind: 'rule-edited', text: `改写「${now.title}」` })
    }
  }
  const beforeBlend = JSON.stringify(previous?.blend?.global ?? {})
  const afterBlend = JSON.stringify(next?.blend?.global ?? {})
  if (beforeBlend !== afterBlend) {
    out.push({ kind: 'weights', text: `全局权重 → ${modeSummary(next?.blend)}` })
  }
  if ((previous?.identity?.summary ?? '') !== (next?.identity?.summary ?? '')) {
    out.push({ kind: 'identity', text: '风格总则改写' })
  }
  return out.slice(0, 6)
}

export async function readHistory(dir, book, profileId = null) {
  const profile = await loadProfile(dir, book, profileId)
  if (!profile) return []
  const versionsDir = path.join(pathsFor(dir, book).profile(profile.id), 'versions')
  let files = []
  try {
    files = (await fs.readdir(versionsDir)).filter((name) => /^v\d+\.json$/.test(name)).sort()
  } catch {
    return []
  }
  let previous = null
  const out = []
  for (const file of files.slice(-30)) {
    const snapshot = await readJson(path.join(versionsDir, file), null)
    if (!snapshot) continue
    out.push({
      version: snapshot.version,
      revision: Number.isInteger(snapshot.revision) ? snapshot.revision : null,
      at: snapshot.at ?? snapshot.updatedAt ?? null,
      action: snapshot.action ?? null,
      reason: snapshot.reason ?? null,
      restoredFrom: snapshot.restoredFrom ?? null,
      current: snapshot.version === profile.version,
      changes: previous ? diffProfiles(previous, snapshot) : [],
    })
    previous = snapshot
  }
  return out.reverse()
}

export async function setRuleStatus(dir, book, profileId, ruleId, status) {  const profile = await loadProfile(dir, book, profileId)
  if (!profile) fail('no-profile', '还没有档案。')
  const rule = (profile.rules ?? []).find((item) => item.id === ruleId)
  if (!rule) fail('no-rule', `档案里没有 ${ruleId}。`)
  rule.status = ['confirmed', 'candidate', 'rejected', 'stale', 'disabled'].includes(status) ? status : rule.status
  assignModeRules(profile)
  profile.version = bump(profile.version)
  profile.updatedAt = new Date().toISOString()
  await writeVersion(dir, book, profile, { action: 'rule-status', reason: `${ruleId} -> ${rule.status}` })
  return { profile: summaryOf(profile), rule }
}

/** 从 L2 区间生成 1–2 条"节奏"规则：不带数字，但把方向说清楚。 */
export function rhythmRules(bands = {}) {
  const rules = []
  const sentence = bands?.sentenceMean?.band
  if (Array.isArray(sentence)) {
    const center = (Number(sentence[0]) + Number(sentence[1])) / 2
    if (center >= 26) {
      rules.push({
        title: '句子可以长',
        layer: 'L2',
        instruction: '允许三十字上下的长句：把动作、对话、心理放进同一句，不要每句都断。',
        scope: [],
        check: { detector: 'rhythm' },
      })
    } else if (center <= 18) {
      rules.push({
        title: '短句推进',
        layer: 'L2',
        instruction: '用短句推进动作，一句话只说一件事，不要连着写长复句。',
        scope: [],
        check: { detector: 'rhythm' },
      })
    }
  }
  const paragraph = bands?.paragraphMean?.band
  if (Array.isArray(paragraph)) {
    const center = (Number(paragraph[0]) + Number(paragraph[1])) / 2
    if (center >= 42) {
      rules.push({
        title: '段落可以长',
        layer: 'L2',
        instruction: '一段写四到六句，允许场景与对话落在同一段；不要一句一段。',
        scope: [],
        check: { detector: 'rhythm' },
      })
    } else if (center <= 30) {
      rules.push({
        title: '段落偏短',
        layer: 'L2',
        instruction: '一段一两句就够，短段落推进更快，不要把无关的情绪堆在一段里。',
        scope: [],
        check: { detector: 'rhythm' },
      })
    }
  }
  return rules
}

export function templateRules(ids = null, options = {}) {
  const list = ids?.length
    ? TEMPLATES.filter((_, index) => ids.includes(index + 1))
    : TEMPLATES
  const rules = list.map((template) => ({
    ...template,
    observation: template.instruction,
    status: 'confirmed',
    confidence: 0.6,
    evidence: [],
  }))
  if (options.includeRhythm !== false) rules.push(...rhythmRules(options.bands))
  return rules
}



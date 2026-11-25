// lib/personas.js — 人物画像账本：候选卡 + 逐条证据 + 作者确认。
// 只存短引用与 UTF-16 范围；确认后才算生效；默认不注入 brief。

import { chapterBody } from './chapters.js'
import { readWorkSource } from './import.js'
import { scenesForChapter } from './scenes.js'
import { audit, fail, pathsFor, readJson, sha256, writeJson } from './store.js'
import { clip, countChars, inRanges, normalizeText, quotedRanges } from './text.js'

export const PERSONA_FIELDS = ['personality', 'values', 'decision', 'relationship', 'stress', 'behavior', 'taboo']
export const PERSONA_CHANNELS = ['narration', 'inner', 'action', 'choice', 'dialogue']
const FIELD_LABELS = {
  personality: '性格', values: '价值取向', decision: '决策方式', relationship: '关系脚本',
  stress: '压力反应', behavior: '行为倾向', taboo: '禁忌',
}
const MAX_CLAIMS = 12
const MAX_EVIDENCE = 8
const MAX_QUOTE = 200

function nowIso() {
  return new Date().toISOString()
}

function normalizeAliases(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const raw of value) {
    const alias = String(raw ?? '').trim().slice(0, 20)
    if (alias && !out.includes(alias)) out.push(alias)
  }
  return out.slice(0, 8)
}

function normalizeField(value) {
  const field = String(value ?? '').trim()
  if (!PERSONA_FIELDS.includes(field)) fail('bad-field', `field 只能是 ${PERSONA_FIELDS.join('/')}。`)
  return field
}

function normalizeChannel(value) {
  const channel = String(value ?? 'narration').trim()
  if (!PERSONA_CHANNELS.includes(channel)) fail('bad-channel', `channel 只能是 ${PERSONA_CHANNELS.join('/')}。`)
  return channel
}

async function resolveEvidence(dir, book, workId, item) {
  const chapter = Number(item?.chapter)
  if (!Number.isInteger(chapter) || chapter < 1) fail('bad-chapter', '证据需要 chapter。')
  const quote = normalizeText(String(item?.quote ?? ''))
  if (countChars(quote) < 4) fail('short-quote', '证据引用至少 4 个字。')
  if (countChars(quote) > MAX_QUOTE) fail('long-quote', `证据引用最多 ${MAX_QUOTE} 字。`)
  const source = await readWorkSource(dir, book, workId)
  const body = chapterBody(source.text, source.chapters, chapter)
  let start = Number(item?.start)
  if (Number.isInteger(start) && start >= 0) {
    if (body.slice(start, start + quote.length) !== quote) {
      fail('quote-start-mismatch', '证据 start 与该章原文对不上；不按“首处匹配”猜位置。')
    }
  } else {
    start = body.indexOf(quote)
  }
  if (start < 0) fail('quote-not-found', '证据引用没有在该章原文中找到。')
  const quoted = inRanges(quotedRanges(body), start)
  return {
    chapter,
    start,
    end: start + quote.length,
    quote,
    quoteHash: sha256(quote),
    channel: quoted ? 'dialogue' : normalizeChannel(item?.channel),
  }
}

export async function verifyEvidence(dir, book, workId, item) {
  return resolveEvidence(dir, book, workId, item)
}

export async function readPersonaIndex(dir, book) {
  const value = await readJson(pathsFor(dir, book).personaIndex, null)
  return Array.isArray(value?.cards) ? value : { schemaVersion: 1, cards: [] }
}

async function writePersonaIndex(dir, book, index) {
  await writeJson(pathsFor(dir, book).personaIndex, { schemaVersion: 1, ...index })
}

function summaryOf(card) {
  return {
    personaId: card.personaId,
    name: card.name,
    aliases: card.aliases ?? [],
    workId: card.workId,
    status: card.status,
    claims: (card.claims ?? []).length,
    revision: card.revision,
    updatedAt: card.updatedAt,
  }
}

export async function listPersonas(dir, book) {
  const index = await readPersonaIndex(dir, book)
  return index.cards.slice().sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
}

export async function showPersona(dir, book, personaId) {
  const card = await readJson(pathsFor(dir, book).persona(String(personaId ?? '')), null)
  if (!card) fail('no-persona', `没有人物卡 ${personaId}。`)
  return card
}

export async function proposePersona(dir, book, input = {}) {
  const workId = String(input.workId ?? '').trim()
  if (!workId) fail('bad-work', 'propose 需要 workId。')
  const name = String(input.name ?? '').trim().slice(0, 40)
  if (!name) fail('bad-name', 'propose 需要人物名。')
  const claimsInput = Array.isArray(input.claims) ? input.claims : []
  if (!claimsInput.length) fail('no-claims', 'propose 至少需要一条主张。')
  if (claimsInput.length > MAX_CLAIMS) fail('too-many-claims', `最多 ${MAX_CLAIMS} 条主张。`)

  const claims = []
  for (let index = 0; index < claimsInput.length; index += 1) {
    const raw = claimsInput[index]
    const text = String(raw?.text ?? '').trim().slice(0, 300)
    if (!text) fail('bad-claim', `第 ${index + 1} 条主张缺 text。`)
    const evidenceInput = Array.isArray(raw?.evidence) ? raw.evidence : []
    if (!evidenceInput.length) fail('no-evidence', `第 ${index + 1} 条主张至少需要一条证据。`)
    if (evidenceInput.length > MAX_EVIDENCE) fail('too-many-evidence', `每条主张最多 ${MAX_EVIDENCE} 条证据。`)
    const evidence = []
    for (const item of evidenceInput) evidence.push(await resolveEvidence(dir, book, workId, item))
    const counterInput = Array.isArray(raw?.counterEvidence) ? raw.counterEvidence : []
    const counterEvidence = []
    for (const item of counterInput.slice(0, MAX_EVIDENCE)) counterEvidence.push(await resolveEvidence(dir, book, workId, item))
    claims.push({
      id: `cl-${index + 1}`,
      field: normalizeField(raw?.field),
      text,
      situation: clip(String(raw?.situation ?? '').trim(), 200) || null,
      confidence: Number.isFinite(Number(raw?.confidence)) ? Math.max(0, Math.min(1, Number(raw.confidence))) : null,
      evidence,
      counterEvidence,
    })
  }

  const personaId = `pc-${sha256(`${workId}|${name}`).slice(0, 16)}`
  const previous = await readJson(pathsFor(dir, book).persona(personaId), null)
  if (previous?.status === 'confirmed') fail('already-confirmed', '这张人物卡已确认；先另建候选或回滚。')
  const now = nowIso()
  const card = {
    schemaVersion: 1,
    personaId,
    name,
    aliases: normalizeAliases(input.aliases),
    workId,
    status: 'candidate',
    claims,
    revision: previous ? Number(previous.revision ?? 1) + 1 : 1,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    source: 'proposal',
  }
  await writeJson(pathsFor(dir, book).persona(personaId), card)
  const index = await readPersonaIndex(dir, book)
  const cards = index.cards.filter((item) => item.personaId !== personaId)
  cards.push(summaryOf(card))
  await writePersonaIndex(dir, book, { cards })
  await audit(dir, book, { kind: 'persona-propose', personaId, claims: claims.length })
  return card
}

export async function decidePersona(dir, book, personaId, status, reason = '') {
  if (!['confirmed', 'rejected'].includes(status)) fail('bad-status', 'status 只能是 confirmed 或 rejected。')
  const card = await showPersona(dir, book, personaId)
  if (card.status === 'rejected' && status === 'confirmed') fail('rejected', '已拒绝的人物卡不能直接确认。')
  if (status === 'confirmed') {
    const claims = Array.isArray(card.claims) ? card.claims : []
    if (!claims.length) fail('no-claims', '没有主张，不能确认。')
    const hasNonDialogue = claims.some((claim) => (claim.evidence ?? []).some((item) => item.channel !== 'dialogue'))
    if (!hasNonDialogue) fail('dialogue-only', '所有证据都来自对白；至少需要一条叙述/内心/行动/选择证据。')
  }
  card.status = status
  card.revision = Number(card.revision ?? 1) + 1
  card.updatedAt = nowIso()
  card.decisionReason = clip(String(reason ?? ''), 200) || null
  await writeJson(pathsFor(dir, book).persona(card.personaId), card)
  const index = await readPersonaIndex(dir, book)
  const cards = index.cards.filter((item) => item.personaId !== card.personaId)
  cards.push(summaryOf(card))
  await writePersonaIndex(dir, book, { cards })
  await audit(dir, book, { kind: 'persona-decision', personaId: card.personaId, status })
  return card
}

const EXTRACT_SYSTEM = [
  '你是中文长篇小说的人物画像抽取器。只根据给定的章节场景，输出人物候选与证据。',
  '只输出 JSON，不要解释。格式：',
  '{"characters":[{"name":"人物名","aliases":["别名"],"claims":[{"field":"personality|values|decision|relationship|stress|behavior|taboo","text":"一句可核对的主张","situation":"适用情境","confidence":0.0,"evidence":[{"chapter":1,"quote":"原文连续片段","channel":"narration|inner|action|choice|dialogue"}],"counterEvidence":[]}]}]}',
  '规则：quote 必须是给出的原文里的连续片段，4–200 字，不得改写、不得跨章；证据不足就不要输出该主张；不要从单一对白推断完整人格；没有人物就返回 {"characters":[]}。',
].join('\n')

function parseModelJson(raw) {
  let text = String(raw ?? '').trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) text = fenced[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) fail('model-output-invalid', '人物抽取没有返回 JSON。')
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    fail('model-output-invalid', '人物抽取返回的 JSON 不合法。')
  }
}

function sceneParts(scene, maxChars) {
  if (scene.chars <= maxChars) return [scene]
  const parts = []
  let start = scene.start
  while (start < scene.end) {
    const end = Math.min(scene.end, start + maxChars)
    parts.push({ ...scene, start, end, chars: end - start })
    start = end
  }
  return parts
}

function batchesFor(source, maxBatches, maxChars) {
  const batches = []
  for (const chapter of source.chapters ?? []) {
    if (batches.length >= maxBatches) break
    const scenes = scenesForChapter(source.text, source.chapters, chapter.index)
    let current = null
    for (const scene of scenes) {
      for (const part of sceneParts(scene, maxChars)) {
        if (batches.length >= maxBatches) break
        if (!current || current.chars + part.chars > maxChars || current.scenes.length >= 4) {
          current = { chapter: chapter.index, scenes: [], chars: 0 }
          batches.push(current)
        }
        current.scenes.push(part)
        current.chars += part.chars
      }
    }
  }
  return batches.slice(0, maxBatches)
}

/**
 * 整书/分批人物抽取：模型只提案，证据逐条回查；所有候选落为 candidate，作者确认才生效。
 * 不做训练；不把整书一次塞进模型；maxBatches/maxChars 控制成本。
 */
export async function extractPersonas(dir, book, options = {}) {
  const workId = String(options.workId ?? '').trim()
  if (!workId) fail('bad-work', 'extract 需要 workId。')
  if (typeof options.llm !== 'function') fail('model-unavailable', '人物抽取需要模型路由；当前不可用。')
  const maxBatches = Math.min(30, Math.max(1, Number(options.maxBatches) || 8))
  const maxChars = Math.min(20_000, Math.max(1500, Number(options.maxChars) || 6000))
  const source = await readWorkSource(dir, book, workId)
  if (!Array.isArray(source.chapters) || !source.chapters.length) fail('no-chapters', '这部作品没有分章。')
  const batches = batchesFor(source, maxBatches, maxChars)
  if (!batches.length) fail('no-scenes', '没有可抽取的场景。')

  const byName = new Map()
  const failures = []
  for (const batch of batches) {
    const sceneText = batch.scenes
      .map((scene) => `【场景 ${scene.type}】\n${source.text.slice(scene.start, scene.end)}`)
      .join('\n\n')
    let raw
    try {
      raw = await options.llm({
        system: EXTRACT_SYSTEM,
        user: `作品 ${workId}，第 ${batch.chapter} 章。以下场景可能含多个人物：\n\n${sceneText}`,
        temperature: 0.2,
        maxTokens: 1600,
      })
    } catch (error) {
      failures.push({ chapter: batch.chapter, reason: String(error?.message ?? error) })
      continue
    }
    let parsed
    try {
      parsed = parseModelJson(raw)
    } catch (error) {
      failures.push({ chapter: batch.chapter, reason: String(error?.message ?? error) })
      continue
    }
    for (const character of Array.isArray(parsed?.characters) ? parsed.characters : []) {
      const name = String(character?.name ?? '').trim().slice(0, 40)
      if (!name) continue
      const entry = byName.get(name) ?? { name, aliases: new Set(), claims: [] }
      for (const alias of Array.isArray(character?.aliases) ? character.aliases : []) {
        const value = String(alias ?? '').trim().slice(0, 20)
        if (value) entry.aliases.add(value)
      }
      for (const claim of Array.isArray(character?.claims) ? character.claims : []) {
        if (entry.claims.length >= MAX_CLAIMS) break
        const field = String(claim?.field ?? '').trim()
        if (!PERSONA_FIELDS.includes(field)) continue
        const text = String(claim?.text ?? '').trim().slice(0, 300)
        if (!text) continue
        const evidence = []
        for (const item of Array.isArray(claim?.evidence) ? claim.evidence : []) {
          const evidenceChapter = Number(item?.chapter)
          if (Number.isInteger(evidenceChapter) && evidenceChapter !== batch.chapter) continue
          try {
            evidence.push(await verifyEvidence(dir, book, workId, {
              chapter: evidenceChapter || batch.chapter,
              quote: item?.quote,
              channel: item?.channel,
            }))
          } catch {
            // 改写/跨章的引用直接丢掉，不让模型把 paraphrase 当原文。
          }
        }
        if (!evidence.length) continue
        const counterEvidence = []
        for (const item of Array.isArray(claim?.counterEvidence) ? claim.counterEvidence : []) {
          const evidenceChapter = Number(item?.chapter)
          if (Number.isInteger(evidenceChapter) && evidenceChapter !== batch.chapter) continue
          try {
            counterEvidence.push(await verifyEvidence(dir, book, workId, {
              chapter: evidenceChapter || batch.chapter,
              quote: item?.quote,
              channel: item?.channel,
            }))
          } catch {
            // 反例同样必须能回查；回查不到就不记录。
          }
        }
        const key = `${field}|${text}|${evidence[0].quoteHash}`
        if (entry.claims.some((existing) => existing.key === key)) continue
        entry.claims.push({
          key,
          field,
          text,
          situation: clip(String(claim?.situation ?? '').trim(), 200) || null,
          confidence: Number.isFinite(Number(claim?.confidence)) ? Math.max(0, Math.min(1, Number(claim.confidence))) : null,
          evidence,
          counterEvidence,
        })
      }
      byName.set(name, entry)
    }
  }

  const proposed = []
  for (const entry of byName.values()) {
    const claims = entry.claims.map(({ key, ...claim }) => claim)
    if (!claims.length) continue
    try {
      proposed.push(await proposePersona(dir, book, {
        workId,
        name: entry.name,
        aliases: [...entry.aliases],
        claims: claims.slice(0, MAX_CLAIMS),
      }))
    } catch (error) {
      failures.push({ name: entry.name, reason: String(error?.message ?? error) })
    }
  }
  return { proposed, batches: batches.length, failures }
}

/**
 * 只读人物简报：只含 confirmed 卡；cast 非空时按姓名/别名过滤。
 * 不返回分数，不把候选卡/反例当结论；冲突暂为空数组（A/B/C 组合时再接）。
 */
export async function personaBrief(dir, book, options = {}) {
  const cast = Array.isArray(options.cast) ? options.cast.map((item) => String(item ?? '').trim()).filter(Boolean) : []
  const bindings = Array.isArray(options.characterStyles)
    ? options.characterStyles.filter((item) => item && typeof item.personaId === 'string')
    : []
  const index = await readPersonaIndex(dir, book)
  const confirmed = new Map()
  for (const item of index.cards) {
    if (item.status !== 'confirmed') continue
    const card = await readJson(pathsFor(dir, book).persona(item.personaId), null)
    if (card?.status === 'confirmed') confirmed.set(card.personaId, card)
  }

  const selected = []
  if (bindings.length) {
    for (const binding of bindings) {
      const card = confirmed.get(binding.personaId)
      if (!card) continue
      if (cast.length && !cast.some((name) => card.name === name || (card.aliases ?? []).includes(name))) continue
      selected.push({ card, role: ['protagonist', 'supporting', 'other'].includes(binding.role) ? binding.role : 'other' })
    }
  } else {
    for (const card of confirmed.values()) {
      if (cast.length && !cast.some((name) => card.name === name || (card.aliases ?? []).includes(name))) continue
      selected.push({ card, role: 'other' })
    }
  }
  if (!selected.length) {
    return {
      ok: true,
      available: false,
      reason: bindings.length ? 'no-binding-match' : cast.length ? 'no-cast-match' : 'no-confirmed',
      personas: [],
      conflicts: [],
      markdown: '',
    }
  }

  const roleLabel = { protagonist: '主角', supporting: '配角', other: '其他' }
  const personas = selected.map(({ card, role }) => ({
    personaId: card.personaId,
    name: card.name,
    role,
    roleLabel: roleLabel[role],
    aliases: card.aliases ?? [],
    workId: card.workId,
    revision: card.revision,
    claims: (card.claims ?? []).slice(0, 4).map((claim) => ({
      field: claim.field,
      label: FIELD_LABELS[claim.field] ?? claim.field,
      text: claim.text,
      situation: claim.situation ?? null,
      evidenceCount: (claim.evidence ?? []).length,
      counterCount: (claim.counterEvidence ?? []).length,
    })),
  }))

  const byField = new Map()
  for (const persona of personas) {
    for (const claim of persona.claims) {
      const group = byField.get(claim.field) ?? []
      group.push({ personaId: persona.personaId, name: persona.name, text: claim.text })
      byField.set(claim.field, group)
    }
  }
  const conflicts = []
  for (const [field, group] of byField) {
    const texts = [...new Set(group.map((item) => item.text))]
    if (texts.length <= 1) continue
    conflicts.push({ field, label: FIELD_LABELS[field] ?? field, personas: group.map((item) => item.name), claims: group })
  }

  const lines = ['# 人物画像简报（仅已确认）']
  for (const persona of personas) {
    lines.push('', `【${persona.name}·${persona.roleLabel}】`)
    for (const claim of persona.claims) {
      lines.push(`- ${claim.label}：${claim.text}${claim.situation ? `（情境：${claim.situation}）` : ''}`)
    }
    if (!persona.claims.length) lines.push('- 暂无已确认主张。')
  }
  if (conflicts.length) {
    lines.push('', '【冲突（并列，不合并）】')
    for (const conflict of conflicts) {
      lines.push(`- ${conflict.label}：${conflict.claims.map((item) => `${item.name}「${item.text}」`).join(' / ')}`)
    }
  }
  lines.push('', '这些是作者确认过的行为倾向，只作建议；不覆盖本章已拍板事实，也不替角色做决定。')
  const markdown = lines.join('\n')
  return {
    ok: true,
    available: true,
    personas,
    conflicts,
    markdown,
    chars: countChars(markdown),
  }
}

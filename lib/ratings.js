// lib/ratings.js — 读者评分/引用账本：append-only、默认关、只读服务消费。
// 读者评分是读者输入，不是作品质量分；公共聚合只给喜欢/不喜欢、条数、引用与强度。

import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { chapterBody } from './chapters.js'
import { readWorkSource } from './import.js'
import { appendJsonl, audit, fail, pathsFor, readJson, sha256, writeJson } from './store.js'
import { clip, countChars, normalizeText } from './text.js'

export const RATING_POLARITIES = ['like', 'dislike']
export const RATING_MIN_QUOTE = 4
export const RATING_MAX_QUOTE = 200
export const MAX_TAGS = 8
export const MAX_TAG_CHARS = 16

function nowIso() {
  return new Date().toISOString()
}

function normalizePolarity(value) {
  const polarity = String(value ?? '').trim()
  if (!RATING_POLARITIES.includes(polarity)) fail('bad-polarity', 'polarity 只能是 like 或 dislike。')
  return polarity
}

function normalizeStrength(value) {
  const strength = Number(value ?? 3)
  if (!Number.isInteger(strength) || strength < 1 || strength > 5) fail('bad-strength', 'strength 只能是 1–5 的整数。')
  return strength
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const raw of value) {
    const tag = String(raw ?? '').trim().slice(0, MAX_TAG_CHARS)
    if (tag && !out.includes(tag)) out.push(tag)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

export async function readReaderConfig(dir, book) {
  const value = await readJson(pathsFor(dir, book).reader, null)
  return { on: value?.on === true, updatedAt: value?.updatedAt ?? null }
}

export async function setReaderOn(dir, book, on, reason = '') {
  const value = { on: on === true, updatedAt: nowIso(), reason: clip(String(reason ?? ''), 120) }
  await writeJson(pathsFor(dir, book).reader, value)
  await audit(dir, book, { kind: 'reader-toggle', on: value.on, reason: value.reason })
  return value
}

async function readEvents(dir, book) {
  let text
  try {
    text = await fs.readFile(pathsFor(dir, book).ratings, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const events = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const value = JSON.parse(line)
      if (value && typeof value === 'object') events.push(value)
    } catch {
      // 坏行跳过：账本不能因为一行手改就整本读不出。
    }
  }
  return events
}

function foldEvents(events) {
  const byId = new Map()
  for (const event of events) {
    if (!event || typeof event.id !== 'string') continue
    if (event.type === 'rating') {
      const previous = byId.get(event.id)
      const identical = previous
        && previous.quoteHash === event.quoteHash
        && previous.start === event.start
        && previous.end === event.end
        && previous.polarity === event.polarity
        && previous.strength === event.strength
        && previous.reader === event.reader
        && JSON.stringify(previous.tags ?? []) === JSON.stringify(event.tags ?? [])
        && previous.note === event.note
      byId.set(event.id, {
        ...event,
        status: identical ? previous.status : 'pending',
        decidedAt: identical ? previous.decidedAt : null,
        decisionReason: identical ? previous.decisionReason : null,
      })
      continue
    }
    if (event.type === 'decision' && (event.status === 'confirmed' || event.status === 'rejected')) {
      const current = byId.get(event.id)
      if (!current) continue
      current.status = event.status
      current.decidedAt = event.at ?? null
      current.decisionReason = event.reason ?? null
    }
  }
  return [...byId.values()].sort((left, right) => String(left.at).localeCompare(String(right.at)))
}

function countsOf(items) {
  return {
    total: items.length,
    pending: items.filter((item) => item.status === 'pending').length,
    confirmed: items.filter((item) => item.status === 'confirmed').length,
    rejected: items.filter((item) => item.status === 'rejected').length,
  }
}

function quoteView(item) {
  return {
    id: item.id,
    quote: clip(item.quote, 60),
    chapter: item.chapter,
    strength: item.strength,
    tags: item.tags ?? [],
    status: item.status,
    decidedAt: item.decidedAt ?? null,
  }
}

/**
 * 记录一条读者评分。引用必须能在作品章节原文里找到；找不到就拒绝写入。
 * 同一读者对同一段落同一极性重复提交会复用同一个 id（最新一条为准）。
 */
export async function recordRating(dir, book, input = {}) {
  const workId = String(input.workId ?? '').trim()
  if (!workId) fail('bad-work', 'record 需要 workId。')
  const chapter = Number(input.chapter)
  if (!Number.isInteger(chapter) || chapter < 1) fail('bad-chapter', 'chapter 必须是 ≥1 的整数。')
  const quote = normalizeText(String(input.quote ?? ''))
  if (countChars(quote) < RATING_MIN_QUOTE) fail('short-quote', `引用至少 ${RATING_MIN_QUOTE} 个字。`)
  if (countChars(quote) > RATING_MAX_QUOTE) fail('long-quote', `引用最多 ${RATING_MAX_QUOTE} 个字；只存短引用，不存整章。`)

  const source = await readWorkSource(dir, book, workId)
  const body = chapterBody(source.text, source.chapters, chapter)
  let start = Number(input.start)
  if (Number.isInteger(start) && start >= 0) {
    if (body.slice(start, start + quote.length) !== quote) {
      fail('quote-start-mismatch', '引用的 start 与该章原文对不上；不按“首处匹配”猜位置。')
    }
  } else {
    start = body.indexOf(quote)
  }
  if (start < 0) fail('quote-not-found', '引用没有在该章原文中找到；请让读者从原文复制。')
  const end = start + quote.length
  const polarity = normalizePolarity(input.polarity)
  const strength = normalizeStrength(input.strength)
  const reader = clip(String(input.reader ?? '').trim(), 40) || null
  const tags = normalizeTags(input.tags)
  const note = clip(String(input.note ?? '').trim(), 300)
  const identity = reader ? `reader:${reader}` : `anon:${randomUUID()}`
  const id = `rt-${sha256(`${workId}|${chapter}|${start}|${end}|${polarity}|${identity}`).slice(0, 20)}`
  const existing = await readEvents(dir, book)
  const duplicate = existing.some((event) => event.type === 'rating' && event.id === id)
  const event = {
    type: 'rating',
    id,
    at: nowIso(),
    workId,
    chapter,
    start,
    end,
    quote,
    quoteHash: sha256(quote),
    polarity,
    strength,
    reader,
    tags,
    note,
  }
  await appendJsonl(pathsFor(dir, book).ratings, event)
  await audit(dir, book, { kind: 'reader-rating', id, chapter, polarity, strength, duplicate })
  return { ...event, duplicate }
}

export async function listRatings(dir, book, filters = {}) {
  const config = await readReaderConfig(dir, book)
  const all = foldEvents(await readEvents(dir, book))
  const chapter = Number(filters.chapter)
  const polarity = filters.polarity ? normalizePolarity(filters.polarity) : null
  const status = ['pending', 'confirmed', 'rejected'].includes(filters.status) ? filters.status : null
  const limit = Math.min(200, Math.max(1, Number(filters.limit) || 100))
  const items = all
    .filter((item) => !Number.isInteger(chapter) || item.chapter === chapter)
    .filter((item) => !polarity || item.polarity === polarity)
    .filter((item) => !status || item.status === status)
    .slice(-limit)
    .reverse()
    .map(quoteView)
  return { ok: true, enabled: config.on, ...countsOf(all), items }
}

export async function aggregateRatings(dir, book, filters = {}) {
  const config = await readReaderConfig(dir, book)
  const all = foldEvents(await readEvents(dir, book))
  const confirmed = all.filter((item) => item.status === 'confirmed')
  const chapter = Number(filters.chapter)
  const scoped = confirmed.filter((item) => !Number.isInteger(chapter) || item.chapter === chapter)
  const byPolarity = (polarity) => {
    const items = scoped.filter((item) => item.polarity === polarity)
    return {
      count: items.length,
      strengthCounts: [1, 2, 3, 4, 5].reduce((out, value) => {
        out[value] = items.filter((item) => item.strength === value).length
        return out
      }, {}),
      quotes: items
        .slice()
        .sort((left, right) => right.strength - left.strength || String(right.at).localeCompare(String(left.at)))
        .slice(0, 5)
        .map(quoteView),
    }
  }
  const tags = new Map()
  for (const item of scoped) {
    for (const tag of item.tags ?? []) {
      const current = tags.get(tag) ?? { tag, likes: 0, dislikes: 0 }
      if (item.polarity === 'like') current.likes += 1
      else current.dislikes += 1
      tags.set(tag, current)
    }
  }
  return {
    ok: true,
    enabled: config.on,
    ...countsOf(all),
    likes: byPolarity('like'),
    dislikes: byPolarity('dislike'),
    tags: [...tags.values()].sort((left, right) => (right.likes + right.dislikes) - (left.likes + left.dislikes)).slice(0, 20),
  }
}

export async function decideRatings(dir, book, ids, status, reason = '') {
  if (!['confirmed', 'rejected'].includes(status)) fail('bad-status', 'status 只能是 confirmed 或 rejected。')
  const wanted = Array.isArray(ids) ? ids.map((id) => String(id ?? '').trim()).filter(Boolean) : []
  if (!wanted.length) fail('no-ids', '需要 ids。')
  const all = foldEvents(await readEvents(dir, book))
  const known = new Set(all.map((item) => item.id))
  const updated = []
  const missing = []
  for (const id of wanted) {
    if (!known.has(id)) {
      missing.push(id)
      continue
    }
    const event = { type: 'decision', id, status, at: nowIso(), by: 'author', reason: clip(String(reason ?? ''), 200) }
    await appendJsonl(pathsFor(dir, book).ratings, event)
    updated.push(id)
  }
  await audit(dir, book, { kind: 'reader-decision', status, updated: updated.length, missing: missing.length })
  return { ok: true, status, updated, missing }
}

/**
 * 写前简报用的读者信号：只含作者已确认的条目；默认关时返回空态。
 * 不返回作品总分、平均分或排名。
 */
export async function readerSignals(dir, book, options = {}) {
  const config = await readReaderConfig(dir, book)
  if (!config.on) return { available: false, enabled: false, reason: 'reader-off', scope: 'book', count: 0 }
  const all = foldEvents(await readEvents(dir, book))
  const confirmed = all.filter((item) => item.status === 'confirmed')
  if (!confirmed.length) return { available: false, enabled: true, reason: 'no-confirmed', scope: 'book', count: 0 }
  const pick = (polarity) => confirmed
    .filter((item) => item.polarity === polarity)
    .slice()
    .sort((left, right) => right.strength - left.strength || String(right.at).localeCompare(String(left.at)))
    .slice(0, 3)
    .map((item) => ({
      quote: clip(item.quote, 50),
      strength: item.strength,
      tags: item.tags ?? [],
      chapter: item.chapter,
    }))
  const likes = pick('like')
  const dislikes = pick('dislike')
  if (!likes.length && !dislikes.length) return { available: false, enabled: true, reason: 'no-confirmed', count: 0 }
  return {
    available: true,
    enabled: true,
    scope: 'book',
    count: confirmed.length,
    likes,
    dislikes,
    updatedAt: confirmed.map((item) => item.at).sort().at(-1) ?? null,
    limit: Number(options.limit) || 3,
  }
}

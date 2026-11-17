// lib/feedback.js — 反馈只记账：append-only 事件 + 候选聚合。v0.1.0 不自动升级。

import path from 'node:path'
import fs from 'node:fs/promises'
import { pathsFor, appendJsonl, readJson, writeJson, audit, fail } from './store.js'

export const SIGNAL_WEIGHT = {
  rule: 5,
  like: 4,
  dislike: 4,
  ab: 4,
  comment: 3,
  edit: 1,
  accept: 2,
  reject: 2,
}

export async function recordFeedback(dir, book, event) {
  const kind = String(event?.kind ?? 'comment')
  if (!(kind in SIGNAL_WEIGHT)) fail('bad-kind', `未知反馈类型 ${kind}。`)
  const entry = {
    id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    kind,
    weight: SIGNAL_WEIGHT[kind],
    scope: event?.scope ?? {},
    text: String(event?.text ?? '').slice(0, 500),
    draft: String(event?.draft ?? '').slice(0, 4000),
    final: String(event?.final ?? '').slice(0, 4000),
    status: 'recorded',
  }
  const file = path.join(pathsFor(dir, book).profiles, 'feedback.jsonl')
  await appendJsonl(file, entry)
  await audit(dir, book, { event: 'feedback', kind, id: entry.id })
  return entry
}

export async function readFeedback(dir, book, limit = 50) {
  const file = path.join(pathsFor(dir, book).profiles, 'feedback.jsonl')
  let text = ''
  try {
    text = await fs.readFile(file, 'utf8')
  } catch {
    return []
  }
  const rows = text.split('\n').filter(Boolean).map((line) => {
    try {
      return JSON.parse(line)
    } catch {
      return null
    }
  }).filter(Boolean)
  return rows.slice(-limit).reverse()
}

function candidatesFile(dir, book) {
  return path.join(pathsFor(dir, book).profiles, 'candidates.json')
}

export async function pendingCandidates(dir, book) {
  const file = candidatesFile(dir, book)
  const stored = await readJson(file, { candidates: [] })
  return (stored?.candidates ?? []).filter((candidate) => candidate.status === 'candidate' && candidate.supports >= 2)
}

/** 聚合：同 scope + 同 kind 的重复反馈累加支持数，够 2 次才进候选列表。 */
export async function aggregateFeedback(dir, book) {
  const events = await readFeedback(dir, book, 200)
  const stored = await readJson(candidatesFile(dir, book), { candidates: [] })
  const candidates = stored?.candidates ?? []
  const processed = new Set(Array.isArray(stored?.processed) ? stored.processed : [])
  for (const event of events) {
    if (!['dislike', 'comment', 'edit', 'like', 'ab'].includes(event.kind)) continue
    if (event.id && processed.has(event.id)) continue
    const key = `${event.kind}:${event.scope?.scene ?? ''}:${event.text}`
    const existing = candidates.find((candidate) => candidate.key === key)
    if (existing) {
      existing.supports = (existing.supports ?? 1) + 1
      existing.lastAt = event.at
    } else {
      candidates.push({
        id: `c-${candidates.length + 1}`,
        key,
        kind: event.kind,
        text: event.text,
        scope: event.scope ?? {},
        supports: 1,
        counterexamples: 0,
        status: 'candidate',
        firstAt: event.at,
        lastAt: event.at,
      })
    }
    if (event.id) processed.add(event.id)
  }
  const visible = candidates.filter((candidate) => candidate.supports >= 2 && candidate.status === 'candidate')
  await writeJson(candidatesFile(dir, book), {
    schemaVersion: 1,
    candidates,
    processed: [...processed],
    updatedAt: new Date().toISOString(),
  })
  return { candidates, pending: visible }
}

export async function rejectCandidate(dir, book, id, reason = '') {
  const stored = await readJson(candidatesFile(dir, book), { candidates: [] })
  const candidate = (stored.candidates ?? []).find((item) => item.id === id)
  if (!candidate) fail('no-candidate', `没有候选 ${id}。`)
  candidate.status = 'rejected'
  candidate.reason = String(reason).slice(0, 120)
  await writeJson(candidatesFile(dir, book), { ...stored, updatedAt: new Date().toISOString() })
  return candidate
}

export async function acceptCandidate(dir, book, profileId, id) {
  const stored = await readJson(candidatesFile(dir, book), { candidates: [] })
  const candidate = (stored.candidates ?? []).find((item) => item.id === id)
  if (!candidate) fail('no-candidate', `没有候选 ${id}。`)
  candidate.status = 'accepted'
  await writeJson(candidatesFile(dir, book), { ...stored, updatedAt: new Date().toISOString() })
  return candidate
}

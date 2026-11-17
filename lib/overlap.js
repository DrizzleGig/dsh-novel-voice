// lib/overlap.js — 20 字连续重合。索引按段采样，避免 3M 字全文塞进内存。

import { LIMITS } from './consts.js'

export function buildOverlapIndex(sources, options = {}) {
  const len = LIMITS.overlapChars
  const maxChars = Number(options.maxChars) > 0 ? Number(options.maxChars) : 500_000
  const set = new Set()
  let indexed = 0
  const list = (sources ?? []).filter((source) => source?.text)
  const perSource = list.length ? Math.max(10_000, Math.floor(maxChars / list.length)) : 0
  for (const source of list) {
    const text = String(source.text)
    const budget = Math.min(perSource, text.length)
    const step = Math.max(1, Math.floor(text.length / Math.max(1, budget)))
    for (let i = 0; i + len <= text.length && indexed < maxChars; i += step) {
      set.add(text.slice(i, i + len))
      indexed += 1
    }
  }
  return { len, set, indexed, sampled: true }
}

export function findOverlap(text, index) {
  if (!index?.set?.size) return []
  const len = index.len
  const body = String(text ?? '')
  const hits = []
  let lastEnd = -1
  for (let i = 0; i + len <= body.length; i += 1) {
    if (i < lastEnd) continue
    if (!index.set.has(body.slice(i, i + len))) continue
    hits.push({ start: i, end: i + len, quote: body.slice(i, i + len) })
    lastEnd = i + len
    if (hits.length >= 8) break
  }
  return hits
}

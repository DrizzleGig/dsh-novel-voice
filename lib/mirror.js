// lib/mirror.js — read-only comparison against the profile. No score, no rank.
// Calls lint() for findings and computes every L2 band (including in-range ones),
// so the panel can say "区间内 / 偏短 / 偏长" without inventing a total.

import { buildContext } from './tools.js'
import { lint } from './check.js'
import { computeStats } from './metrics.js'
import { deviationOf } from './bands.js'
import { readState, sha256 } from './store.js'
import { round } from './text.js'

const METRICS = [
  ['sentenceMean', '句长', (stats) => stats.sentence.mean, 1],
  ['sentenceCv', '句长变化', (stats) => stats.sentence.cv, 2],
  ['paragraphMean', '段长', (stats) => stats.paragraph.mean, 1],
  ['dialogueRatio', '对话比', (stats) => stats.dialogue.ratio, 2],
  ['abstractPer1k', '抽象词 / 千字', (stats) => stats.abstractPer1k, 1],
  ['explanationPer1k', '解释连接词 / 千字', (stats) => stats.explanationPer1k, 1],
]

export async function mirrorText({ dir, book, text, options = {} } = {}) {
  const body = String(text ?? '')
  if (!body.trim()) {
    const error = new Error('待检文本为空：先粘贴一段或选一章。')
    error.code = 'empty-text'
    throw error
  }
  const context = await buildContext(dir, book, options)
  if (!context.profile) {
    return { ok: false, code: 'no-profile', message: '还没有档案；先导入作品并建档案，再对照。' }
  }
  const state = await readState(dir, book)
  const profile = context.profile
  const result = lint(body, context)
  const stats = computeStats(body)
  const bands = profile.bands ?? {}
  const rows = METRICS.map(([metric, label, pick, digits]) => {
    const value = round(Number(pick(stats) ?? 0), digits)
    const band = bands?.[metric]?.band
    const deviation = deviationOf(value, bands?.[metric])
    return {
      metric,
      label,
      value,
      band: Array.isArray(band) ? band : null,
      direction: deviation?.direction ?? 'unknown',
      distance: deviation?.distance ?? null,
    }
  })
  const textHash = sha256(body)
  const expectedTextHash = typeof options.textHash === 'string' ? options.textHash : null
  const expectedRevision = Number.isInteger(Number(options.profileRevision)) ? Number(options.profileRevision) : null
  const stale = Boolean(
    (expectedTextHash && expectedTextHash !== textHash)
    || (expectedRevision !== null && expectedRevision !== state.revision),
  )
  return {
    ok: true,
    book,
    textHash,
    profileRevision: state.revision,
    profileVersion: profile.version,
    generatedAt: new Date().toISOString(),
    chars: result.chars,
    bands: rows,
    deviations: result.deviations,
    findings: result.findings,
    summary: result.summary,
    profile: { id: profile.id, version: profile.version, status: profile.status },
    stale,
    staleReason: stale ? '文本或档案在生成结果后发生了变化，请重新对照。' : null,
    note: '这是和档案区间的对照，不是好坏评分；偏离不等于缺陷，可能只是这一章需要另一种写法。',
  }
}

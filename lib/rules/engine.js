// lib/rules/engine.js — 确定性规则引擎：phrase/regex/metric，UTF-16 span，不做评分。
// 规则包的来源/许可在 pack 元数据里；finding 只给命中、位置、原句、理由与可复制建议。

import { clip, inRanges, quotedRanges } from '../text.js'

export const RULE_SEVERITIES = ['block', 'warn', 'info', 'hint']
export const RULE_SCOPES = ['all', 'narration', 'dialogue']

function pushFinding(out, seen, pack, rule, start, end, body) {
  const key = `${rule.id}:${start}:${end}`
  if (seen.has(key)) return
  seen.add(key)
  const quote = clip(body.slice(start, end), 80)
  out.push({
    ruleId: rule.id,
    packId: pack.id,
    type: rule.type ?? 'RULE',
    scope: rule.scope ?? 'all',
    severity: RULE_SEVERITIES.includes(rule.severity) ? rule.severity : 'warn',
    outcome: 'hit',
    span: { start, end },
    quote,
    message: rule.message ?? rule.title ?? rule.id,
    fix: rule.fix ?? null,
    evidenceLevel: rule.evidenceLevel ?? 'indirect',
    source: pack.source ?? null,
    license: pack.license ?? null,
  })
}

function matchesScope(rule, ranges, start) {
  if (rule.scope === 'narration') return !inRanges(ranges, start)
  if (rule.scope === 'dialogue') return inRanges(ranges, start)
  return true
}

function applyRule(body, ranges, pack, rule, out, seen, options) {
  const match = rule.match ?? {}
  if (match.kind === 'phrase') {
    const phrase = String(match.pattern ?? '')
    if (!phrase) return
    let from = 0
    for (;;) {
      const index = body.indexOf(phrase, from)
      if (index < 0) break
      if (matchesScope(rule, ranges, index)) pushFinding(out, seen, pack, rule, index, index + phrase.length, body)
      from = index + Math.max(1, phrase.length)
    }
    return
  }
  if (match.kind === 'regex') {
    const source = String(match.pattern ?? '')
    if (!source) return
    const flags = String(match.flags ?? 'u')
    let regex
    try {
      regex = new RegExp(source, flags.includes('g') ? flags : `${flags}g`)
    } catch {
      return // 坏规则不拖垮整包；发布 gate 会另行校验。
    }
    let hit
    while ((hit = regex.exec(body))) {
      if (!hit[0].length) {
        regex.lastIndex += 1
        continue
      }
      if (matchesScope(rule, ranges, hit.index)) {
        pushFinding(out, seen, pack, rule, hit.index, hit.index + hit[0].length, body)
      }
    }
    return
  }
  if (match.kind === 'metric') {
    const values = options?.metrics ?? {}
    const value = Number(values[match.metric])
    if (!Number.isFinite(value)) return
    const threshold = Number(match.value)
    if (!Number.isFinite(threshold)) return
    const hit = match.op === 'lte' ? value <= threshold : value >= threshold
    if (!hit) return
    pushFinding(out, seen, pack, rule, 0, body.length, body)
  }
}

/**
 * 对一段文本跑规则包。规则包默认关，调用方负责决定传哪些。
 * 返回的 findings 只有命中/位置/原句/理由；没有 score/total/percent/rank。
 */
export function applyRules(text, packs = [], options = {}) {
  const body = String(text ?? '')
  const ranges = quotedRanges(body)
  const out = []
  const seen = new Set()
  const used = []
  for (const pack of Array.isArray(packs) ? packs : []) {
    if (!pack || typeof pack.id !== 'string' || !Array.isArray(pack.rules)) continue
    used.push(pack.id)
    for (const rule of pack.rules) {
      if (!rule || typeof rule.id !== 'string') continue
      applyRule(body, ranges, pack, rule, out, seen, options)
    }
  }
  out.sort((left, right) => left.span.start - right.span.start || left.span.end - right.span.end)
  const summary = { block: 0, warn: 0, info: 0, hint: 0 }
  for (const finding of out) summary[finding.severity] += 1
  return { findings: out, summary, packs: used }
}

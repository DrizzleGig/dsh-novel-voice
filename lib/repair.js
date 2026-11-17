// lib/repair.js — 定点改写：选窗、生成、五道校验、合并、复检。
// 宁可不改，不可改坏：任何一道校验不过就回退这一窗并标 needs-author。

import { LIMITS, REPAIR_SYSTEM } from './consts.js'
import { lint } from './check.js'
import { findOverlap } from './overlap.js'
import { countChars, clip, round } from './text.js'

const FIXABLE = new Set(['cliche-density', 'negation-parallel', 'paragraph-closure', 'emotion-naming', 'repetition'])

export function selectWindows(findings, text, options = {}) {
  const pad = Number(options.pad) > 0 ? Number(options.pad) : LIMITS.windowPad
  const maxChars = Number(options.windowChars) > 0 ? Number(options.windowChars) : LIMITS.windowChars
  const maxWindows = Number(options.maxWindows) > 0 ? Number(options.maxWindows) : LIMITS.maxWindows
  const targets = (findings ?? [])
    .filter((finding) => FIXABLE.has(finding.detector) && finding.severity !== 'block')
    .sort((a, b) => a.span.start - b.span.start)
  const windows = []
  for (const finding of targets) {
    const from = Math.max(0, finding.span.start - pad)
    const to = Math.min(text.length, finding.span.end + pad)
    const last = windows[windows.length - 1]
    if (last && from <= last.end) {
      last.end = Math.max(last.end, to)
      last.findings.push(finding)
      continue
    }
    windows.push({ start: from, end: to, findings: [finding] })
  }
  const bounded = []
  for (const window of windows) {
    const expanded = expandToSentence(text, window.start, window.end)
    let { start, end } = expanded
    if (end - start > maxChars) {
      const center = Math.floor((start + end) / 2)
      start = Math.max(0, center - Math.floor(maxChars / 2))
      end = Math.min(text.length, start + maxChars)
    }
    bounded.push({ ...window, start, end })
  }
  return bounded.slice(0, maxWindows)
}

function expandToSentence(text, start, end) {
  let from = start
  let to = end
  const boundary = /[。！？…\n]/
  while (from > 0 && !boundary.test(text[from - 1])) from -= 1
  while (to < text.length && !boundary.test(text[to - 1])) to += 1
  return { start: from, end: to }
}

function digitsOf(text) {
  return new Set(String(text).match(/[0-9０-９]+/g) ?? [])
}

function stripWrapping(raw) {
  let text = String(raw ?? '').trim()
  text = text.replace(/^```[a-z]*\n?/i, '').replace(/```$/,'').trim()
  if ((text.startsWith('「') && text.endsWith('」')) || (text.startsWith('"') && text.endsWith('"'))) {
    text = text.slice(1, -1).trim()
  }
  return text
}

export function validateWindow(before, after, context = {}) {
  const checks = []
  const reject = (reason, detail) => ({ ok: false, reason, detail, checks })

  const beforeChars = countChars(before)
  const afterChars = countChars(after)
  if (!after.trim()) return reject('empty', '模型返回空文本')
  if (Math.abs(afterChars - beforeChars) / Math.max(1, beforeChars) > 0.15) {
    return reject('length', `字数变化 ${beforeChars} → ${afterChars}，超过 15%`)
  }
  checks.push('V1')

  const beforeDigits = digitsOf(before)
  for (const digit of digitsOf(after)) {
    if (!beforeDigits.has(digit)) return reject('new-fact', `新增数字「${digit}」`)
  }
  for (const name of context.cast ?? []) {
    if (!name || name.length < 2) continue
    if (!before.includes(name) && after.includes(name)) return reject('new-fact', `新增人物「${name}」`)
  }
  if ((after.match(/[「“]/g) ?? []).length > (before.match(/[「“]/g) ?? []).length) {
    return reject('new-quote', '新增了引号内容（可能是新编的对白或细节）')
  }
  checks.push('V3')

  // V2 保留度：不允许把整段重写一遍（那会漂移，也没法审）。事实校验先于它，编造比改多更严重。
  if (retention(before, after) < 0.45) {
    return reject('rewrote-too-much', '改写幅度过大：窗口内原文保留度低于 45%')
  }
  checks.push('V2')

  const beforeHits = lint(before, { watchlist: context.watchlist, overlap: null, profile: null }).findings
    .filter((finding) => finding.severity === 'warn')
  const afterLint = lint(after, { watchlist: context.watchlist, overlap: context.overlap, profile: null })
  const afterWarns = afterLint.findings.filter((finding) => finding.severity === 'warn')
  if (beforeHits.length > 0 && afterWarns.length >= beforeHits.length) {
    return reject('no-progress', `命中没有减少（${beforeHits.length} → ${afterWarns.length}）`)
  }
  const known = new Set(beforeHits.map((finding) => finding.detector))
  for (const finding of afterWarns) {
    if (!known.has(finding.detector)) return reject('new-habit', `引入了新的「${finding.detector}」：${finding.quote}`)
  }
  checks.push('V4')

  if (findOverlap(after, context.overlap).length) return reject('overlap', '改写后与参考作品仍有 20 字重合')
  checks.push('V5')

  return { ok: true, reason: null, checks }
}

/** 字符 2-gram 保留度：衡量"改了多少"，防止整段重写。 */
export function retention(before, after) {
  const a = String(before ?? '')
  const b = String(after ?? '')
  if (!b.length) return 0
  const grams = new Map()
  for (let i = 0; i + 2 <= a.length; i += 1) {
    const key = a.slice(i, i + 2)
    grams.set(key, (grams.get(key) ?? 0) + 1)
  }
  let matched = 0
  let total = 0
  for (let i = 0; i + 2 <= b.length; i += 1) {
    const key = b.slice(i, i + 2)
    total += 1
    const left = grams.get(key) ?? 0
    if (left > 0) {
      matched += 1
      grams.set(key, left - 1)
    }
  }
  return total ? matched / total : 0
}

function buildPrompt(window, text, context) {
  const lines = []
  lines.push('【要改的段落】')
  lines.push(window.text)
  lines.push('')
  lines.push('【必须修掉的问题】')
  for (const finding of window.findings) {
    lines.push(`- (${finding.detector}) 「${finding.quote}」`)
    lines.push(`  为什么：${finding.why}`)
    lines.push(`  怎么改：${finding.fix}`)
  }
  const rules = (context.profile?.rules ?? [])
    .filter((rule) => rule.status === 'confirmed')
    .slice(0, 3)
  if (rules.length) {
    lines.push('')
    lines.push('【可以参照的写法】')
    for (const rule of rules) lines.push(`- ${rule.instruction || rule.rule}`)
  }
  lines.push('')
  lines.push('【绝对不要】')
  lines.push('- 不新增人名、数字、地点、时间、动作、比喻；')
  lines.push('- 不改人称与视角；不解释人物动机；')
  lines.push('- 只改问题所在，其余原样保留。')
  lines.push('')
  lines.push('只输出改写后的这一段文字。')
  return lines.join('\n')
}

export async function repairText(input) {
  const text = String(input.text ?? '')
  if (!input.llm) {
    return { ok: false, code: 'model-unavailable', message: '改写需要模型；本机没有可用的 provider/model，已跳过。' }
  }
  const windows = selectWindows(input.findings, text, input.options ?? {})
  if (!windows.length) {
    return { ok: true, revised: text, changes: [], rejected: [], rounds: 0, needsAuthor: 0, message: '没有可定点改写的命中。' }
  }
  const beforeSummary = summarize(input.findings)
  let revised = text
  const changes = []
  const rejected = []
  let needsAuthor = 0
  let rounds = 0
  const maxRounds = Number(input.options?.maxRounds) > 0 ? Number(input.options.maxRounds) : LIMITS.maxRounds

  // 从后往前替换，避免偏移漂移。
  for (const window of [...windows].sort((a, b) => b.start - a.start)) {
    const before = text.slice(window.start, window.end)
    let attempt = 0
    let accepted = null
    while (attempt < maxRounds && !accepted) {
      attempt += 1
      rounds += 1
      let raw
      try {
        raw = await input.llm({
          system: REPAIR_SYSTEM,
          user: buildPrompt({ ...window, text: before }, text, input),
          temperature: attempt === 1 ? LIMITS.temperature : 0.25,
          maxTokens: Math.min(LIMITS.maxTokensPerWindow, Math.max(300, before.length * 2 + 200)),
        })
      } catch (error) {
        rejected.push({ span: { start: window.start, end: window.end }, reason: 'model-error', message: String(error?.message ?? error) })
        needsAuthor += 1
        break
      }
      const candidate = stripWrapping(raw)
      const verdict = validateWindow(before, candidate, {
        watchlist: input.watchlist,
        overlap: input.overlap,
        cast: input.cast,
        profile: input.profile,
      })
      if (!verdict.ok) {
        if (attempt >= maxRounds) {
          rejected.push({ span: { start: window.start, end: window.end }, reason: verdict.reason, detail: verdict.detail })
          needsAuthor += 1
        }
        continue
      }
      accepted = { text: candidate, verdict }
    }
    if (!accepted) continue
    revised = revised.slice(0, window.start) + accepted.text + revised.slice(window.end)
    changes.push({
      span: { start: window.start, end: window.end },
      before,
      after: accepted.text,
      fixed: window.findings.map((finding) => finding.detector),
      checks: accepted.verdict.checks,
    })
  }

  const afterLint = lint(revised, {
    watchlist: input.watchlist,
    overlap: input.overlap,
    profile: input.profile,
    contract: input.contract,
  })
  const afterSummary = summarize(afterLint.findings)
  return {
    ok: true,
    revised,
    changes: changes.sort((a, b) => a.span.start - b.span.start),
    rejected,
    rounds,
    needsAuthor,
    before: beforeSummary,
    after: afterSummary,
    note: '窗口外的文字未改动；窗口内按句子边界扩展，保留度已校验（≥45%）。',
  }
}

function summarize(findings) {
  const summary = { block: 0, warn: 0, info: 0, hint: 0 }
  for (const finding of findings ?? []) summary[finding.severity] = (summary[finding.severity] ?? 0) + 1
  return summary
}

export function describeChanges(changes) {
  return (changes ?? []).map((change) => ({
    at: change.span.start,
    before: clip(change.before, 80),
    after: clip(change.after, 80),
    fixed: change.fixed,
  }))
}

export function charRatio(before, after) {
  const a = countChars(before)
  const b = countChars(after)
  return round(a ? b / a : 1, 2)
}

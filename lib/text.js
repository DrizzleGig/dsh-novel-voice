// lib/text.js — 文本归一化、分段、分句、计数。全部纯函数，无 IO。

const SENT_END = new Set(['。', '！', '？', '!', '?', '…'])
const CLOSERS = new Set(['」', '』', '”', '’', '）', ')', '》', '】'])

export function normalizeText(input) {
  let text = String(input ?? '').replace(/^\uFEFF/, '')
  text = text.replace(/\r\n?/g, '\n')
  text = text.replace(/[ \t]+\n/g, '\n')
  text = text.replace(/\n{4,}/g, '\n\n\n')
  return text.trim()
}

function trimSpan(text, from, to) {
  const raw = text.slice(from, to)
  const lead = raw.length - raw.replace(/^\s+/, '').length
  const body = raw.trim()
  if (!body) return null
  return { start: from + lead, end: from + lead + body.length, text: body }
}

export function splitParagraphs(text) {
  const build = (re) => {
    const out = []
    let cursor = 0
    let match
    while ((match = re.exec(text))) {
      const span = trimSpan(text, cursor, match.index)
      if (span) out.push(span)
      cursor = match.index + match[0].length
    }
    const tail = trimSpan(text, cursor, text.length)
    if (tail) out.push(tail)
    return out
  }
  const hasBlank = /\n[ \t]*\n/.test(text)
  let out = build(hasBlank ? /\n[ \t]*\n/g : /\n/g)
  // TXT 小说常只在章节之间留空行：空行分段会把整章算成一段。
  // 如果分出来的段中位数大得不像段落，退回按行分。
  if (hasBlank && out.length) {
    const lengths = out.map((paragraph) => paragraph.text.replace(/\s+/g, '').length).sort((a, b) => a - b)
    const median = lengths[Math.floor(lengths.length / 2)]
    if (median > 400) out = build(/\n/g)
  }
  if (!out.length && text.trim()) out.push({ start: 0, end: text.length, text: text.trim() })
  return out
}

export function splitSentences(text) {
  const out = []
  let start = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '\n') {
      const span = trimSpan(text, start, i)
      if (span) out.push(span)
      start = i + 1
      continue
    }
    if (!SENT_END.has(ch)) continue
    let end = i + 1
    if (ch === '…' && text[i + 1] === '…') {
      end = i + 2
      i += 1
    }
    while (end < text.length && CLOSERS.has(text[end])) end += 1
    const span = trimSpan(text, start, end)
    if (span) out.push(span)
    start = end
    i = end - 1
  }
  const tail = trimSpan(text, start, text.length)
  if (tail) out.push(tail)
  return out
}

export function countChars(text) {
  return String(text ?? '').replace(/\s+/g, '').length
}

export function estimateTokens(chars) {
  return Math.ceil(Number(chars ?? 0) * 0.7)
}

export function clip(text, max) {
  const value = String(text ?? '')
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1))}…`
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 返回所有引号内区间，用于把"对白里的口癖"与"叙述里的坏习惯"分开。 */
export function quotedRanges(text) {
  const out = []
  const re = /「[^」]*」|『[^』]*』|“[^”]*”|"[^"\n]*"/g
  let match
  while ((match = re.exec(text))) out.push([match.index, match.index + match[0].length])
  return out
}

export function inRanges(ranges, index) {
  for (let i = 0; i < ranges.length; i += 1) {
    const [from, to] = ranges[i]
    if (from > index) return false
    if (index >= from && index < to) return true
  }
  return false
}

export function mean(values) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function stdev(values) {
  if (values.length < 2) return 0
  const avg = mean(values)
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

export function percentile(sorted, p) {
  if (!sorted.length) return 0
  const index = (sorted.length - 1) * p
  const low = Math.floor(index)
  const high = Math.ceil(index)
  if (low === high) return sorted[low]
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low)
}

export function round(value, digits = 3) {
  const scale = 10 ** digits
  return Math.round(Number(value) * scale) / scale
}

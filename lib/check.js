// lib/check.js — 五层检查里的前三层。只有 L1 判罪；L2 只报偏离；L3 只列候选。
// 输出永远是「位置 + 原句 + 理由」，不是分数。

import { SEVERITY_ORDER } from './consts.js'
import { computeStats } from './metrics.js'
import { deviationOf } from './bands.js'
import { findOverlap } from './overlap.js'
import { inRanges, quotedRanges, splitParagraphs, splitSentences, clip, countChars, round } from './text.js'
import { matchWatchlist } from './watchlist.js'

const CLOSURE_RE = /(?:就这样|从此|而这一切|他不知道的是|殊不知|这便是|那一刻[，,]?(?:他|她)?(?:明白|知道|懂得)|未来的路还很长|而这[，,]?只是开始)[^。！？]{0,12}[。！？]?\s*$/

const EMOTION_RES = [
  /(?:他|她|我|它)的?(?:感到|觉到|觉得|心里|心中|心底)[^。！？\n]{0,14}(?:紧张|害怕|恐惧|愤怒|悲伤|难过|委屈|无助|孤独|绝望|兴奋|激动|不安|焦虑|羞愧|尴尬|痛苦|失落|恍惚)/g,
  /(?:一种|一股|一阵)(?:说不出的|难以言喻的|无法形容的|莫名的)[^。！？\n]{0,10}/g,
]
// “一股说不出的味道/声音/冷风”是感官，不是情绪；别把感官当情绪直述。
const SENSORY_RE = /(?:味道|气味|香味|臭味|口感|滋味|声音|声响|香味|光|风|冷|热|疼|痛|痒|麻)/

function paragraphAt(paragraphs, index) {
  for (const paragraph of paragraphs) {
    if (index >= paragraph.start && index < paragraph.end) return paragraph
  }
  return null
}

function makeFinding(state, detector, severity, span, quote, why, fix, ruleId = null) {
  state.index += 1
  return {
    id: `f-${String(state.index).padStart(3, '0')}`,
    detector,
    severity,
    span,
    quote: clip(String(quote ?? '').replace(/\s+/g, ' ').trim(), 60),
    why,
    fix,
    ruleId,
  }
}

export function lint(text, context = {}) {
  const body = String(text ?? '')
  const state = { index: 0 }
  const findings = []
  const paragraphs = splitParagraphs(body)
  const quoted = quotedRanges(body)
  const entries = context.watchlist?.entries ?? []

  // L1 · 套话密度：按段报，不逐词删。
  const clicheHits = matchWatchlist(body, entries)
  const byParagraph = new Map()
  for (const hit of clicheHits) {
    const paragraph = paragraphAt(paragraphs, hit.start)
    const key = paragraph ? paragraph.start : -1
    const bucket = byParagraph.get(key) ?? { paragraph, hits: [] }
    bucket.hits.push(hit)
    byParagraph.set(key, bucket)
  }
  for (const [, bucket] of byParagraph) {
    if (bucket.hits.length < 2) continue
    const quote = bucket.paragraph?.text ?? bucket.hits[0].quote
    findings.push(makeFinding(
      state, 'cliche-density', 'warn',
      { start: bucket.paragraph?.start ?? bucket.hits[0].start, end: bucket.paragraph?.end ?? bucket.hits[0].end },
      quote,
      `这一段有 ${bucket.hits.length} 处套话：${bucket.hits.map((hit) => hit.quote).slice(0, 4).join('、')}`,
      '整段换个写法，用具体的动作或物件承接；不要只把词删掉。',
    ))
  }
  const clichePer1k = round((clicheHits.length * 1000) / Math.max(1, countChars(body)), 2)

  // L1 · 否定-修正句。
  for (const hit of clicheHits) {
    if (hit.entry?.why?.includes('否定-修正')) {
      const inDialogue = inRanges(quoted, hit.start)
      findings.push(makeFinding(
        state, 'negation-parallel', inDialogue ? 'info' : 'warn', { start: hit.start, end: hit.end }, hit.quote,
        inDialogue ? '对白里的否定-修正句，可能是人物口癖；只提示。' : '叙述里的否定-修正句：先否定再纠正，是中文 AI 文本最常见的一类句式。',
        inDialogue ? '若确实是人物习惯就保留。' : '改成正面陈述：直接写"是什么"，不要先写"不是什么"。',
      ))
    }
  }

  // L1 · 段末升华 / 解说体。
  for (const paragraph of paragraphs) {
    const tail = paragraph.text.slice(-40)
    if (!CLOSURE_RE.test(tail)) continue
    findings.push(makeFinding(
      state, 'paragraph-closure', 'warn', { start: Math.max(paragraph.start, paragraph.end - 40), end: paragraph.end }, paragraph.text,
      '段末收在总结或解说上：这是"作者替读者总结"，不是人物在经历。',
      '删掉最后一句总结，或改成动作、物件、未说完的话。',
    ))
  }

  // L1 · 抽象情绪直述。
  const emotionSpans = []
  for (const re of EMOTION_RES) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(body))) {
      // 感官词优先：只有“说不出的恐惧/不安”这类抽象情绪才判。
      if (SENSORY_RE.test(match[0])) continue
      const start = match.index
      const end = start + match[0].length
      // 两条正则可能命中同一句：同 detector 的重叠 span 只报一次。
      if (emotionSpans.some((span) => start < span.end && end > span.start)) continue
      emotionSpans.push({ start, end })
      const inDialogue = inRanges(quoted, start)
      findings.push(makeFinding(
        state, 'emotion-naming', inDialogue ? 'info' : 'warn', { start, end }, match[0],
        inDialogue ? '对白里的情绪直述，可能是人物口癖。' : '情绪被直接命名，没有可观察的承接。',
        inDialogue ? '若符合人物就保留。' : '换成动作、生理细节或环境反应；或删掉，让下一句动作接住。',
      ))
    }
  }

  // L2 · 句法画像（只报偏离，不判罪）。
  const stats = computeStats(body)
  const deviations = []
  const bands = context.profile?.bands ?? {}
  const metrics = [
    ['sentenceMean', stats.sentence.mean],
    ['sentenceCv', stats.sentence.cv],
    ['paragraphMean', stats.paragraph.mean],
    ['dialogueRatio', stats.dialogue.ratio],
    ['abstractPer1k', stats.abstractPer1k],
    ['explanationPer1k', stats.explanationPer1k],
  ]
  for (const [metric, value] of metrics) {
    const deviation = deviationOf(value, bands[metric])
    if (deviation) deviations.push({ metric, value, ...deviation })
  }

  // L1 · 重复（3-gram / 句首）。数字类（章号）不算；出现次数太少也不算。
  const trigramCount = Math.round((stats.repetition.topTrigramShare ?? 0) * Math.max(1, countChars(body) - 2))
  if (stats.repetition.topTrigram && !/\d/.test(stats.repetition.topTrigram) && stats.repetition.topTrigramShare > 0.006 && trigramCount >= 4) {
    const index = body.indexOf(stats.repetition.topTrigram)
    if (index >= 0) {
      findings.push(makeFinding(
        state, 'repetition', 'info', { start: index, end: index + 3 }, body.slice(Math.max(0, index - 10), index + 13),
        `「${stats.repetition.topTrigram}」在这一章出现 ${trigramCount} 次，偏多。`,
        '看看是不是同一个动作/句式反复；换一种说法，不是删词。',
      ))
    }
  }

  // L1 · 与参考作品 20 字重合（硬伤）。
  for (const hit of findOverlap(body, context.overlap)) {
    findings.push(makeFinding(
      state, 'overlap', 'block', { start: hit.start, end: hit.end }, hit.quote,
      '与书架里的作品有 20 字以上连续重合，可能过度贴近原文。',
      '重写这一段；不要复制参考作品的句子。',
    ))
  }

  // L1 · 契约（有 fanfic 契约时才启用；没有就明确说不可用）。
  const contract = context.contract
  if (contract?.available) {
    for (const item of contract.forbidden ?? []) {
      const index = body.indexOf(item)
      if (index < 0) continue
      findings.push(makeFinding(
        state, 'contract', 'block', { start: index, end: index + item.length }, item,
        '命中了契约里的禁忌项。', '按契约改写这一处。',
      ))
    }
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.span.start - b.span.start)
  const summary = { block: 0, warn: 0, info: 0, hint: 0 }
  for (const finding of findings) summary[finding.severity] += 1

  return {
    chars: countChars(body),
    findings: findings.slice(0, 200),
    portrait: {
      sentenceCv: stats.sentence.cv,
      sentenceMean: stats.sentence.mean,
      dialogueRatio: stats.dialogue.ratio,
      clichePer1k,
      abstractPer1k: stats.abstractPer1k,
      explanationPer1k: stats.explanationPer1k,
      topTrigram: stats.repetition.topTrigram,
    },
    deviations,
    summary,
    contract: { available: Boolean(contract?.available) },
  }
}

export function sentencesOf(text) {
  return splitSentences(text)
}

/** 候选重排：只给"谁更接近档案 + 命中更少"，不判断哪个更好。 */
export function rank(texts, context = {}) {
  const scored = (texts ?? []).map((text, index) => {
    const result = lint(text, context)
    const deviationPenalty = result.deviations.reduce((sum, item) => {
      if (item.direction === 'in') return sum
      return sum + Math.min(3, Math.abs(item.distance) / Math.max(0.01, (item.band?.[1] ?? 1) - (item.band?.[0] ?? 0)))
    }, 0)
    const sortKey = result.summary.block * 10 + result.summary.warn * 3 + result.portrait.clichePer1k + deviationPenalty
    return {
      index,
      chars: result.chars,
      summary: result.summary,
      portrait: result.portrait,
      deviations: result.deviations,
      sortKey,
    }
  })
  const ordered = [...scored].sort((a, b) => a.sortKey - b.sortKey)
  return {
    items: scored.map(({ sortKey, ...item }) => item),
    closest: ordered[0]?.index ?? null,
    note: '这只是指针：更接近档案、命中更少，不代表写得更好；内容保真请自己确认。',
  }
}

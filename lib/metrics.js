// lib/metrics.js — 六组确定性统计。纯函数：同输入同输出，不读文件、不调模型。

import { countChars, mean, percentile, round, splitParagraphs, splitSentences, stdev } from './text.js'

const ABSTRACT = ['一种', '某种', '仿佛', '似乎', '好像', '莫名', '无法', '难以', '说不清', '不知为何', '瞬间', '忽然', '突然', '渐渐', '微微', '淡淡', '轻轻', '温柔', '深邃', '复杂', '情绪', '感觉', '氛围', '气息', '味道']
const EXPLAIN = ['因为', '所以', '于是', '因此', '然而', '可是', '事实上', '这意味着', '换句话说', '与此同时', '原本', '其实', '毕竟', '显然', '当然', '总之']

function countOf(text, words) {
  let total = 0
  for (const word of words) {
    let from = 0
    for (;;) {
      const index = text.indexOf(word, from)
      if (index < 0) break
      total += 1
      from = index + word.length
    }
  }
  return total
}

function quoteChars(text) {
  let total = 0
  const re = /「[^」]*」|『[^』]*』|“[^”]*”|"[^"\n]*"/g
  let match
  while ((match = re.exec(text))) total += match[0].length
  return total
}

function topShare(items) {
  if (!items.length) return { share: 0, top: '' }
  const counts = new Map()
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1)
  let best = 0
  let top = ''
  for (const [key, value] of counts) {
    if (value > best) {
      best = value
      top = key
    }
  }
  return { share: round(best / items.length), top }
}

export function computeStats(text) {
  const body = String(text ?? '')
  const chars = Math.max(1, countChars(body))
  const paragraphs = splitParagraphs(body)
  const sentences = splitSentences(body)

  const sentenceLengths = sentences.map((sentence) => countChars(sentence.text)).filter((value) => value > 0)
  const paragraphLengths = paragraphs.map((paragraph) => countChars(paragraph.text)).filter((value) => value > 0)
  const sortedSentence = [...sentenceLengths].sort((a, b) => a - b)
  const sortedParagraph = [...paragraphLengths].sort((a, b) => a - b)

  const sentenceMean = mean(sentenceLengths)
  const paragraphMean = mean(paragraphLengths)
  const shortCount = sentenceLengths.filter((value) => value <= 8).length
  const longCount = sentenceLengths.filter((value) => value >= 40).length

  const dialogueChars = quoteChars(body)
  const dialogueTurns = (body.match(/[「“]/g) ?? []).length

  const dash = (body.match(/——/g) ?? []).length
  const ellipsis = (body.match(/……/g) ?? []).length
  const question = (body.match(/[？?]/g) ?? []).length
  const exclaim = (body.match(/[！!]/g) ?? []).length

  const trigramCounts = new Map()
  const compact = body.replace(/\s+/g, '')
  // 大长篇只抽样统计 3-gram，避免 3M 字把内存吃穿；占比按抽样数归一。
  const step = Math.max(1, Math.ceil((compact.length - 2) / 400_000))
  let samples = 0
  for (let i = 0; i + 3 <= compact.length; i += step) {
    const key = compact.slice(i, i + 3)
    trigramCounts.set(key, (trigramCounts.get(key) ?? 0) + 1)
    samples += 1
  }
  let topTrigram = ''
  let topTrigramCount = 0
  for (const [key, value] of trigramCounts) {
    if (value > topTrigramCount) {
      topTrigram = key
      topTrigramCount = value
    }
  }
  const trigramTotal = Math.max(1, samples)
  const openers = sentences.map((sentence) => sentence.text.slice(0, 2)).filter((value) => value.length === 2)

  const abstractHits = countOf(body, ABSTRACT)
  const explainHits = countOf(body, EXPLAIN)

  return {
    chars,
    paragraphs: paragraphs.length,
    sentences: sentences.length,
    sentence: {
      mean: round(sentenceMean),
      median: round(percentile(sortedSentence, 0.5)),
      cv: round(sentenceMean ? stdev(sentenceLengths) / sentenceMean : 0),
      p10: round(percentile(sortedSentence, 0.1)),
      p25: round(percentile(sortedSentence, 0.25)),
      p50: round(percentile(sortedSentence, 0.5)),
      p75: round(percentile(sortedSentence, 0.75)),
      p90: round(percentile(sortedSentence, 0.9)),
      shortRatio: round(sentenceLengths.length ? shortCount / sentenceLengths.length : 0),
      longRatio: round(sentenceLengths.length ? longCount / sentenceLengths.length : 0),
      max: sortedSentence.length ? sortedSentence[sortedSentence.length - 1] : 0,
    },
    paragraph: {
      mean: round(paragraphMean),
      median: round(percentile(sortedParagraph, 0.5)),
      cv: round(paragraphMean ? stdev(paragraphLengths) / paragraphMean : 0),
      p10: round(percentile(sortedParagraph, 0.1)),
      p25: round(percentile(sortedParagraph, 0.25)),
      p75: round(percentile(sortedParagraph, 0.75)),
      p90: round(percentile(sortedParagraph, 0.9)),
      singleSentenceRatio: round(paragraphs.length ? paragraphs.filter((paragraph) => splitSentences(paragraph.text).length === 1).length / paragraphs.length : 0),
    },
    dialogue: {
      ratio: round(dialogueChars / chars),
      turns: dialogueTurns,
    },
    punct: {
      dashPer1k: round((dash * 1000) / chars, 2),
      ellipsisPer1k: round((ellipsis * 1000) / chars, 2),
      questionPer1k: round((question * 1000) / chars, 2),
      exclaimPer1k: round((exclaim * 1000) / chars, 2),
    },
    abstractPer1k: round((abstractHits * 1000) / chars, 2),
    explanationPer1k: round((explainHits * 1000) / chars, 2),
    repetition: {
      topTrigramShare: round(topTrigramCount / trigramTotal),
      topTrigram,
      topOpenerShare: topShare(openers).share,
      topOpener: topShare(openers).top,
    },
  }
}

/** 从章节统计里抽区间：p10–p90，样本不足时加宽 1.5 倍。 */
export function bandFrom(percentiles, provisional) {
  const { p10, p90 } = percentiles
  const center = (p10 + p90) / 2
  const half = Math.max((p90 - p10) / 2, Math.abs(center) * 0.08)
  const widened = provisional ? half * 1.5 : half
  return [round(center - widened, 2), round(center + widened, 2)]
}

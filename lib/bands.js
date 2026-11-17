// lib/bands.js — 把统计变成区间。区间比目标值抗噪；样本不足就标 provisional。

import { BAND_MIN_HALF } from './consts.js'
import { round } from './text.js'

function weightedAverage(items, pick) {
  let weight = 0
  let total = 0
  for (const item of items) {
    const value = Number(pick(item) ?? 0)
    const w = Math.max(1, Number(item?.chars) || 1)
    total += value * w
    weight += w
  }
  return weight ? total / weight : 0
}

function makeBand(center, half, n, provisional, floor = -Infinity) {
  const widen = provisional ? 1.5 : 1
  const lo = Math.max(floor, center - Math.abs(half) * widen)
  return {
    band: [round(lo, 2), round(center + Math.abs(half) * widen, 2)],
    n,
    provisional,
  }
}

/**
 * @param {Array<{chars:number, stats:object}>} works 每部作品一条
 * @param {{provisional?:boolean}} options
 */
export function buildBands(works, options = {}) {
  const usable = (works ?? []).filter((item) => item?.stats)
  if (!usable.length) return {}
  const n = usable.reduce((sum, item) => sum + (item.stats.sentences || 0), 0)
  const provisional = options.provisional === true || n < 60

  const pickSentence = (item) => {
    const sentence = item.stats.sentence ?? {}
    const low = Number(sentence.p25 ?? sentence.p10 ?? 0)
    const high = Number(sentence.p75 ?? sentence.p90 ?? low)
    return { low, high }
  }
  const pickParagraph = (item) => {
    const paragraph = item.stats.paragraph ?? {}
    const low = Number(paragraph.p25 ?? paragraph.p10 ?? 0)
    const high = Number(paragraph.p75 ?? paragraph.p90 ?? low)
    return { low, high }
  }

  const sentenceMean = weightedAverage(usable, (item) => (pickSentence(item).low + pickSentence(item).high) / 2)
  const sentenceHalf = Math.max(
    weightedAverage(usable, (item) => (pickSentence(item).high - pickSentence(item).low) / 2),
    BAND_MIN_HALF.sentenceMean,
  )
  const cv = weightedAverage(usable, (item) => item.stats.sentence?.cv)
  const paragraphMean = weightedAverage(usable, (item) => (pickParagraph(item).low + pickParagraph(item).high) / 2)
  const paragraphHalf = Math.max(
    weightedAverage(usable, (item) => (pickParagraph(item).high - pickParagraph(item).low) / 2),
    paragraphMean * 0.25,
    BAND_MIN_HALF.paragraphMean,
  )
  const dialogueRatio = weightedAverage(usable, (item) => item.stats.dialogue?.ratio)

  return {
    sentenceMean: makeBand(sentenceMean, sentenceHalf, n, provisional, 0),
    sentenceCv: makeBand(cv, Math.max(cv * 0.2, BAND_MIN_HALF.sentenceCv), n, provisional, 0),
    paragraphMean: makeBand(paragraphMean, paragraphHalf, n, provisional, 0),
    dialogueRatio: makeBand(dialogueRatio, Math.max(dialogueRatio * 0.25, BAND_MIN_HALF.dialogueRatio), n, provisional, 0),
    abstractPer1k: makeBand(weightedAverage(usable, (item) => item.stats.abstractPer1k), BAND_MIN_HALF.abstractPer1k * 2, n, provisional, 0),
    explanationPer1k: makeBand(weightedAverage(usable, (item) => item.stats.explanationPer1k), BAND_MIN_HALF.explanationPer1k * 2, n, provisional, 0),
  }
}

export function deviationOf(value, metric) {
  if (!metric || !Array.isArray(metric.band)) return null
  const [lo, hi] = metric.band
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  if (numeric < lo) return { direction: 'low', distance: round(lo - numeric, 2), band: metric.band }
  if (numeric > hi) return { direction: 'high', distance: round(numeric - hi, 2), band: metric.band }
  return { direction: 'in', distance: 0, band: metric.band }
}

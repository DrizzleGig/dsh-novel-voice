// lib/fingerprint.js — 文体指纹：确定性、无模型、无评分。
// 只描述“这段文本的句长/节奏/用词/标点长什么样”，不判断好坏。

import crypto from 'node:crypto'
import { computeStats } from './metrics.js'
import { countChars, mean, percentile, round, splitSentences } from './text.js'

export const FINGERPRINT_SCHEMA = 1
const MATTR_WINDOW = 50

const FUNCTION_WORDS = [
  '的', '了', '着', '是', '在', '和', '与', '及', '或', '而', '但', '却', '也', '就', '都', '又', '还', '只', '才',
  '把', '被', '让', '给', '从', '向', '对', '为', '以', '于', '因', '所', '其', '这', '那', '他', '她', '它', '我', '你',
  '们', '一个', '没有', '不是', '只是', '已经', '忽然', '突然', '于是', '因此', '然而', '所以', '但是', '而且', '并且',
]

const CONNECTIVES = ['因为', '所以', '因此', '然而', '但是', '可是', '于是', '此外', '同时', '不过', '而且', '并且', '总之', '其实', '显然', '当然']

const MIN_HALF = {
  sentenceMean: 2.5,
  sentenceCv: 0.08,
  paragraphMean: 8,
  paragraphCv: 0.08,
  dialogueRatio: 0.06,
  shortRatio: 0.05,
  longRatio: 0.04,
  abstractPer1k: 0.8,
  explanationPer1k: 0.8,
  functionWordRatio: 0.02,
  mattr: 0.03,
  nominalizationPer1k: 0.8,
  passivePer1k: 0.5,
  connectiveChainRatio: 0.04,
  dashPer1k: 0.4,
  ellipsisPer1k: 0.4,
  questionPer1k: 0.3,
  exclaimPer1k: 0.2,
  topOpenerShare: 0.04,
  topTrigramShare: 0.02,
}

function countWord(text, word) {
  let total = 0
  let from = 0
  for (;;) {
    const index = text.indexOf(word, from)
    if (index < 0) break
    total += 1
    from = index + word.length
  }
  return total
}

function mattr(tokens, window = MATTR_WINDOW) {
  if (!tokens.length) return 0
  if (tokens.length <= window) return new Set(tokens).size / tokens.length
  let total = 0
  let windows = 0
  for (let from = 0; from + window <= tokens.length; from += 1) {
    total += new Set(tokens.slice(from, from + window)).size / window
    windows += 1
  }
  return windows ? total / windows : 0
}

function tokensOf(text) {
  return text.match(/[\u4e00-\u9fff]|[A-Za-z0-9']+/gu) ?? []
}

export function fingerprint(text) {
  const body = String(text ?? '')
  const stats = computeStats(body)
  const chars = Math.max(1, countChars(body))
  const sentences = splitSentences(body)
  const tokens = tokensOf(body)
  const functionHits = FUNCTION_WORDS.reduce((sum, word) => sum + countWord(body, word), 0)
  const nominalization = (body.match(/[\u4e00-\u9fff]{1,4}(?:性|化|感)/gu) ?? []).length
  const passive = (body.match(/(?:被|受到|遭到|得以|为[^。！？]{0,10}?所)/gu) ?? []).length
  const connectiveOpeners = sentences.filter((sentence) => CONNECTIVES.some((word) => sentence.text.startsWith(word))).length
  const values = {
    sentenceMean: stats.sentence.mean,
    sentenceCv: stats.sentence.cv,
    paragraphMean: stats.paragraph.mean,
    paragraphCv: stats.paragraph.cv,
    dialogueRatio: stats.dialogue.ratio,
    shortRatio: stats.sentence.shortRatio,
    longRatio: stats.sentence.longRatio,
    abstractPer1k: stats.abstractPer1k,
    explanationPer1k: stats.explanationPer1k,
    functionWordRatio: round(functionHits / chars, 4),
    mattr: round(mattr(tokens), 4),
    nominalizationPer1k: round((nominalization * 1000) / chars, 2),
    passivePer1k: round((passive * 1000) / chars, 2),
    connectiveChainRatio: round(sentences.length ? connectiveOpeners / sentences.length : 0, 4),
    dashPer1k: stats.punct.dashPer1k,
    ellipsisPer1k: stats.punct.ellipsisPer1k,
    questionPer1k: stats.punct.questionPer1k,
    exclaimPer1k: stats.punct.exclaimPer1k,
    topOpenerShare: stats.repetition.topOpenerShare,
    topTrigramShare: stats.repetition.topTrigramShare,
  }
  const hash = crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex')
  return {
    schemaVersion: FINGERPRINT_SCHEMA,
    chars,
    sentences: stats.sentences,
    paragraphs: stats.paragraphs,
    values,
    hash,
  }
}

function bandFor(key, values) {
  const sorted = [...values].sort((left, right) => left - right)
  const center = mean(values)
  const half = Math.max((percentile(sorted, 0.9) - percentile(sorted, 0.1)) / 2, Math.abs(center) * 0.15, MIN_HALF[key] ?? 0.01)
  return [round(Math.max(0, center - half), 4), round(center + half, 4)]
}

/** 从多章指纹建基线：每维 p10–p90 区间 + 均值；样本少时自动加宽。 */
export function baselineFromFingerprints(fingerprints = []) {
  const list = (Array.isArray(fingerprints) ? fingerprints : []).filter((item) => item?.values)
  const keys = Object.keys(list[0]?.values ?? {})
  const values = {}
  const bands = {}
  for (const key of keys) {
    const series = list.map((item) => Number(item.values[key])).filter((value) => Number.isFinite(value))
    if (!series.length) continue
    values[key] = round(mean(series), 4)
    const band = bandFor(key, series)
    const widened = series.length < 3
      ? [round(Math.max(0, values[key] - (values[key] - band[0]) * 1.5), 4), round(values[key] + (band[1] - values[key]) * 1.5, 4)]
      : band
    bands[key] = { band: widened, n: series.length }
  }
  return { schemaVersion: FINGERPRINT_SCHEMA, values, bands, samples: list.length }
}

export function compareFingerprint(current, baseline) {
  const values = current?.values ?? {}
  const dimensions = []
  const summary = { close: 0, deviate: 0, unknown: 0 }
  const keys = Object.keys(values)
  for (const key of keys) {
    const value = Number(values[key])
    const base = baseline?.bands?.[key]?.band
    const baseValue = Number(baseline?.values?.[key])
    if (!Number.isFinite(value) || !Array.isArray(base) || base.length !== 2) {
      dimensions.push({ key, value: Number.isFinite(value) ? value : null, band: null, status: 'unknown', direction: null })
      summary.unknown += 1
      continue
    }
    const [low, high] = base
    const direction = value < low ? 'below' : value > high ? 'above' : 'in'
    const status = direction === 'in' ? 'close' : 'deviate'
    summary[status] += 1
    dimensions.push({
      key,
      value,
      baseline: Number.isFinite(baseValue) ? baseValue : round((low + high) / 2, 4),
      band: [low, high],
      status,
      direction,
    })
  }
  return { dimensions, summary }
}

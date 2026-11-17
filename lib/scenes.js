// lib/scenes.js — 六类场景切分。规则启发式优先；边界场景交给模型是 P1 的事。

import { SCENE_KEYWORDS, SCENES } from './consts.js'
import { countChars, round, splitParagraphs, splitSentences } from './text.js'

const ORDER = ['悬疑对峙', '动作战斗', '心理情感', '描写环境', '日常过渡', '对话']

function quoteRatioOf(text) {
  const total = countChars(text) || 1
  const quoted = (text.match(/「[^」]*」|『[^』]*』|“[^”]*”|"[^"\n]*"/g) ?? []).join('').length
  return quoted / total
}

function keywordScore(text, words) {
  let hits = 0
  for (const word of words) {
    let from = 0
    for (;;) {
      const index = text.indexOf(word, from)
      if (index < 0) break
      hits += 1
      from = index + word.length
    }
  }
  return hits
}

export function classifyParagraph(text) {
  const body = String(text ?? '')
  const chars = countChars(body) || 1
  const sentences = splitSentences(body)
  const meanLen = sentences.length ? chars / sentences.length : chars
  const scores = new Map()
  for (const type of SCENES) {
    const keywords = SCENE_KEYWORDS[type] ?? []
    let score = (keywordScore(body, keywords) * 1000) / chars
    if (type === '对话') score += quoteRatioOf(body) * 12
    if (type === '动作战斗' && meanLen < 18) score += 1.5
    if (type === '描写环境' && quoteRatioOf(body) < 0.05) score += 0.8
    if (type === '心理情感' && meanLen > 24) score += 0.6
    scores.set(type, score)
  }
  let best = '日常过渡'
  let bestScore = -1
  let total = 0
  for (const type of ORDER) {
    const score = scores.get(type) ?? 0
    total += score
    if (score > bestScore) {
      bestScore = score
      best = type
    }
  }
  const confidence = total > 0 ? bestScore / total : 0
  return { type: best, confidence: round(Math.min(0.95, confidence), 2) }
}

export function buildScenes(text) {
  const body = String(text ?? '')
  const paragraphs = splitParagraphs(body)
  const runs = []
  for (const paragraph of paragraphs) {
    const { type, confidence } = classifyParagraph(paragraph.text)
    const last = runs[runs.length - 1]
    if (last && last.type === type) {
      last.end = paragraph.end
      last.chars += countChars(paragraph.text)
      last.confidence = round((last.confidence + confidence) / 2, 2)
    } else {
      runs.push({ start: paragraph.start, end: paragraph.end, type, confidence, chars: countChars(paragraph.text) })
    }
  }
  // 太碎的片段并回上一段，避免场景列表比段落还长。
  const merged = []
  for (const run of runs) {
    const last = merged[merged.length - 1]
    if (last && run.chars < 40) {
      last.end = run.end
      last.chars += run.chars
      continue
    }
    merged.push({ ...run })
  }
  return merged.map((run, index) => ({
    index: index + 1,
    start: run.start,
    end: run.end,
    type: run.type,
    confidence: run.confidence,
    chars: run.chars,
    source: 'heuristic',
  }))
}

export function scenesForChapter(text, chapters, chapter) {
  const entry = chapters.find((item) => item.index === Number(chapter))
  if (!entry) return []
  const slice = String(text ?? '').slice(entry.start, entry.end)
  return buildScenes(slice).map((scene) => ({
    ...scene,
    start: scene.start + entry.start,
    end: scene.end + entry.start,
    chapter,
  }))
}

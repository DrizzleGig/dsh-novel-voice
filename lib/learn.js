// lib/learn.js — 统计、取样、模型辅助技法提取、引文校验。分析不猜、证据不造。

import path from 'node:path'
import { LIMITS } from './consts.js'
import { splitParagraphs, countChars, clip, estimateTokens } from './text.js'
import { computeStats } from './metrics.js'
import { buildScenes } from './scenes.js'
import { readWorkSource } from './import.js'
import {
  audit, fail, pathsFor, readJson, readLibrary, sha256, writeJson, writeLibrary,
} from './store.js'

export async function measureWork(dir, book, workId) {
  const source = await readWorkSource(dir, book, workId)
  const stats = computeStats(source.text)
  const scenesByChapter = {}
  let sceneCount = 0
  for (const chapter of source.chapters) {
    const slice = source.text.slice(chapter.start, chapter.end)
    const scenes = buildScenes(slice)
    sceneCount += scenes.length
    if (scenes.length) scenesByChapter[chapter.index] = scenes
  }
  const workDir = pathsFor(dir, book).work(workId)
  const payload = {
    schemaVersion: 1,
    workId,
    chars: countChars(source.text),
    contentHash: source.meta?.hash ?? '',
    stats,
    byScene: summarizeByScene(scenesByChapter, source),
    computedAt: new Date().toISOString(),
  }
  await writeJson(path.join(workDir, 'stats.json'), payload)
  await writeJson(path.join(workDir, 'scenes.json'), {
    schemaVersion: 1,
    workId,
    total: sceneCount,
    byChapter: scenesByChapter,
  })
  const library = await readLibrary(dir, book)
  const entry = library.works.find((work) => work.workId === workId)
  if (entry) {
    entry.status = 'measured'
    entry.measuredAt = new Date().toISOString()
    entry.scenes = sceneCount
    await writeLibrary(dir, book, library)
  }
  await audit(dir, book, { event: 'measure', workId, chars: payload.chars, scenes: sceneCount })
  return { workId, chars: payload.chars, sentences: stats.sentences, scenes: sceneCount, stats }
}

function summarizeByScene(scenesByChapter, source) {
  const buckets = new Map()
  for (const [chapterKey, scenes] of Object.entries(scenesByChapter)) {
    const chapter = Number(chapterKey)
    const entry = source.chapters.find((item) => item.index === chapter)
    if (!entry) continue
    for (const scene of scenes) {
      const chars = scene.chars || 0
      const bucket = buckets.get(scene.type) ?? { scenes: 0, chars: 0 }
      bucket.scenes += 1
      bucket.chars += chars
      buckets.set(scene.type, bucket)
    }
  }
  return Object.fromEntries(buckets)
}

export async function sampleSegments(dir, book, workIds, options = {}) {
  const mode = options.mode === 'deep' ? 'deep' : 'quick'
  const perWork = mode === 'deep' ? LIMITS.deepSamples : LIMITS.quickSamples
  const library = await readLibrary(dir, book)
  const ids = Array.isArray(workIds) && workIds.length ? workIds : library.works.map((work) => work.workId)
  const samples = []
  const rejected = []
  for (const workId of ids) {
    const entry = library.works.find((work) => work.workId === workId)
    if (!entry) {
      rejected.push({ workId, reason: 'not-in-library' })
      continue
    }
    let source
    try {
      source = await readWorkSource(dir, book, workId)
    } catch (error) {
      rejected.push({ workId, reason: 'no-source', message: String(error?.message ?? error) })
      continue
    }
    const chapters = source.chapters
    const picks = pickChapters(chapters, perWork)
    const covered = new Set()
    for (const chapter of picks) {
      const slice = source.text.slice(chapter.start, chapter.end)
      const paragraphs = splitParagraphs(slice).filter((paragraph) => countChars(paragraph.text) >= 120)
      if (!paragraphs.length) continue
      const sceneOf = (paragraph) => {
        const scenes = buildScenes(paragraph.text)
        return scenes[0]?.type ?? '日常过渡'
      }
      let best = null
      let bestScore = -1
      for (const paragraph of paragraphs) {
        const scene = sceneOf(paragraph)
        const score = (covered.has(scene) ? 0 : 1000) + countChars(paragraph.text)
        if (score > bestScore) {
          bestScore = score
          best = { paragraph, scene }
        }
      }
      if (!best) continue
      covered.add(best.scene)
      const text = clip(best.paragraph.text, LIMITS.sliceChars)
      samples.push({
        workId,
        title: entry.title,
        chapter: chapter.index,
        chapterTitle: chapter.title,
        scene: best.scene,
        start: chapter.start + best.paragraph.start,
        end: chapter.start + best.paragraph.end,
        chars: countChars(text),
        text,
      })
      if (samples.length >= LIMITS.maxSamples) break
    }
    if (samples.length >= LIMITS.maxSamples) break
  }
  return {
    mode,
    samples,
    rejected,
    chars: samples.reduce((sum, sample) => sum + sample.chars, 0),
    tokensEstimate: estimateTokens(samples.reduce((sum, sample) => sum + sample.chars, 0)),
  }
}

function pickChapters(chapters, count) {
  if (!chapters.length) return []
  if (chapters.length <= count) return chapters
  const out = []
  for (let i = 0; i < count; i += 1) {
    const index = Math.floor((i * chapters.length) / count)
    out.push(chapters[index])
  }
  return out
}

export const ANALYZE_SYSTEM = [
  '你是中文小说文体分析员，只做观察，不做评价。',
  '禁止：评价好坏、猜作者身份、复制长段原文、给作品打分、使用"简洁有力/细腻/克制"这类形容词。',
  '每条技法必须是可执行的选择：在什么场景、写什么、不写什么。',
  '输出严格 JSON 数组，不要代码块，不要解释。',
].join('\n')

export function buildAnalyzePrompt(samples) {
  const blocks = samples.map((sample, index) => {
    return [
      `【样本 ${index + 1}】作品：${sample.title}｜第 ${sample.chapter} 章｜场景：${sample.scene}`,
      sample.text,
    ].join('\n')
  })
  return [
    '请从下面样本里提取 3–8 条写作技法。要求：',
    '1. 每条给出 title（≤12 字）、layer（只能是 L1/L2/L3/L4）、observation（作者写什么/不写什么）、instruction（给模型的执行指令，含"不要……"的边界）、scope（场景类型数组）；',
    '2. evidence 给 1–2 条，必须是样本里逐字出现的短句，每条 ≤40 字，并注明 sample（样本序号）；',
    '3. 宁可少提，不要凑数；样本里看不出来的不要编。',
    '',
    '输出格式：[{"title":"","layer":"L3","observation":"","instruction":"","scope":["对峙"],"evidence":[{"sample":1,"quote":""}]}]',
    '',
    ...blocks,
  ].join('\n')
}

export function parseCandidates(raw) {
  const text = String(raw ?? '').trim()
  const first = text.indexOf('[')
  const last = text.lastIndexOf(']')
  if (first < 0 || last <= first) fail('model-output-invalid', '模型没有返回 JSON 数组。')
  let parsed
  try {
    parsed = JSON.parse(text.slice(first, last + 1))
  } catch {
    fail('model-output-invalid', '模型输出的 JSON 解析失败。')
  }
  if (!Array.isArray(parsed)) fail('model-output-invalid', '模型输出的不是数组。')
  return parsed
}

/** 引文必须逐字来自对应样本，找不到就整卡丢弃。 */
export function verifyCandidates(candidates, samples) {
  const accepted = []
  const rejected = []
  for (const candidate of candidates ?? []) {
    const title = String(candidate?.title ?? '').trim().slice(0, 40)
    if (!title) {
      rejected.push({ title: '(空)', reason: 'missing-title' })
      continue
    }
    const evidences = []
    let ok = true
    for (const evidence of Array.isArray(candidate?.evidence) ? candidate.evidence : []) {
      const index = Number(evidence?.sample) - 1
      const quote = String(evidence?.quote ?? '').trim()
      if (!quote || quote.length > 40 || !samples[index]) {
        ok = false
        break
      }
      if (!samples[index].text.includes(quote)) {
        ok = false
        break
      }
      evidences.push({
        workId: samples[index].workId,
        chapter: samples[index].chapter,
        quote,
        hash: sha256(quote),
      })
    }
    if (!ok || !evidences.length) {
      rejected.push({ title, reason: 'evidence-not-found' })
      continue
    }
    accepted.push({
      title,
      layer: ['L1', 'L2', 'L3', 'L4'].includes(candidate.layer) ? candidate.layer : 'L3',
      observation: String(candidate.observation ?? '').trim().slice(0, 240),
      instruction: String(candidate.instruction ?? '').trim().slice(0, 240),
      scope: Array.isArray(candidate.scope) ? candidate.scope.slice(0, 6).map(String) : [],
      evidence: evidences,
      status: 'candidate',
      confidence: 0.6,
    })
  }
  return { accepted, rejected }
}

export async function analyzeWithModel({ dir, book, workIds, mode, llm }) {
  const sampled = await sampleSegments(dir, book, workIds, { mode })
  if (!sampled.samples.length) fail('no-samples', '没有可分析的代表性片段；确认作品已导入且有正文。')
  const raw = await llm({
    system: ANALYZE_SYSTEM,
    user: buildAnalyzePrompt(sampled.samples),
    temperature: 0.3,
    maxTokens: 2400,
  })
  const candidates = parseCandidates(raw)
  const verified = verifyCandidates(candidates, sampled.samples)
  await audit(dir, book, {
    event: 'analyze',
    mode,
    samples: sampled.samples.length,
    chars: sampled.chars,
    accepted: verified.accepted.length,
    rejected: verified.rejected.length,
  })
  return { ...sampled, ...verified, rawTokensEstimate: estimateTokens(String(raw).length) }
}

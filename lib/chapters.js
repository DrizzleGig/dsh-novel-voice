// lib/chapters.js — 分章：正则命中 + 手动修正。不假设一定识别成功。

import { fail } from './store.js'

const CHAPTER_RE = /^[ \t]*(?:(?:第\s*([0-9零〇一二三四五六七八九十百千万两]+)\s*[章回节卷])|(?:Chapter\s+([0-9]+))|(?:【\s*第\s*([0-9零〇一二三四五六七八九十百千万两]+)\s*[章回]\s*】))([^\n]{0,40})$/gm

export function detectChapterStarts(text) {
  const starts = []
  const re = new RegExp(CHAPTER_RE.source, 'gm')
  let match
  while ((match = re.exec(text))) {
    starts.push({ start: match.index, title: match[0].trim() })
  }
  return starts
}

export function splitChapters(text, overrides = null) {
  const body = String(text ?? '')
  const starts = []

  if (Array.isArray(overrides) && overrides.length) {
    for (const item of overrides) {
      const start = Number(item?.start)
      if (!Number.isInteger(start) || start < 0 || start >= body.length) continue
      starts.push({ start, title: String(item?.title ?? '').trim() || `第 ${starts.length + 1} 章` })
    }
    starts.sort((a, b) => a.start - b.start)
  }

  if (!starts.length) {
    const detected = detectChapterStarts(body)
    if (detected.length >= 2) starts.push(...detected)
  }

  if (!starts.length) {
    return [{ index: 1, title: '全文', start: 0, end: body.length, chars: body.replace(/\s+/g, '').length }]
  }

  const chapters = []
  for (let i = 0; i < starts.length; i += 1) {
    const end = i + 1 < starts.length ? starts[i + 1].start : body.length
    const slice = body.slice(starts[i].start, end)
    chapters.push({
      index: i + 1,
      title: starts[i].title,
      start: starts[i].start,
      end,
      chars: slice.replace(/\s+/g, '').length,
    })
  }
  return chapters
}

export function chapterBody(text, chapters, chapter) {
  const found = chapters.find((entry) => entry.index === Number(chapter))
  if (!found) fail('bad-chapter', `没有第 ${chapter} 章。`)
  return String(text ?? '').slice(found.start, found.end)
}

export function chapterTitle(chapters, chapter) {
  const found = chapters.find((entry) => entry.index === Number(chapter))
  return found?.title ?? `第 ${chapter} 章`
}

export function normalizeOverrides(overrides) {
  if (!Array.isArray(overrides)) return null
  const out = []
  for (const item of overrides) {
    const start = Number(item?.start)
    if (!Number.isInteger(start) || start < 0) continue
    out.push({ start, title: String(item?.title ?? '').trim() })
  }
  return out.length ? out : null
}

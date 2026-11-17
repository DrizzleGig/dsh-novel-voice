import test from 'node:test'
import assert from 'node:assert/strict'
import { countChars, normalizeText, quotedRanges, splitParagraphs, splitSentences } from '../lib/text.js'
import { detectChapterStarts, splitChapters, chapterBody } from '../lib/chapters.js'
import { computeStats } from '../lib/metrics.js'

test('normalizeText 统一换行、去 BOM、压空行', () => {
  const out = normalizeText('\uFEFF第一段\r\n\r\n\r\n\r\n第二段  \r\n')
  assert.equal(out, '第一段\n\n\n第二段')
})

test('splitParagraphs：有深色空行按空行分段，否则按行', () => {
  const blank = splitParagraphs('甲。\n\n乙。\n\n丙。')
  assert.equal(blank.length, 3)
  const line = splitParagraphs('甲。\n乙。')
  assert.equal(line.length, 2)
  assert.equal(line[0].text, '甲。')
  assert.equal(line[1].start, 3)
})

test('splitSentences：引号与省略号不会被拆坏', () => {
  const sentences = splitSentences('他说：「走吧。」她没有动……然后点头。')
  assert.ok(sentences.length >= 3)
  assert.ok(sentences.some((sentence) => sentence.text.includes('走吧')))
})

test('quotedRanges 能把对白与叙述分开', () => {
  const ranges = quotedRanges('他"不是这样"地说。')
  assert.equal(ranges.length, 1)
})

test('分章：识别第 N 章与中文数字，手改覆盖生效', () => {
  const text = '第一章 雪夜\n正文甲。\n第二章 旧账\n正文乙。'
  const starts = detectChapterStarts(text)
  assert.equal(starts.length, 2)
  const chapters = splitChapters(text)
  assert.equal(chapters.length, 2)
  assert.equal(chapterBody(text, chapters, 2).includes('正文乙'), true)

  const overridden = splitChapters(text, [{ start: 0, title: '上卷' }, { start: text.indexOf('正文乙'), title: '下卷' }])
  assert.equal(overridden.length, 2)
  assert.equal(overridden[0].title, '上卷')
})

test('无章节标题时整篇算一章，不硬猜', () => {
  const chapters = splitChapters('只有正文，没有标题。')
  assert.equal(chapters.length, 1)
  assert.equal(chapters[0].title, '全文')
})

test('统计可复现：同输入同输出', () => {
  const text = '他推开门。雪落在肩上，很快化了。\n\n屋里没有灯，只有灶膛里一点红。'
  const a = computeStats(text)
  const b = computeStats(text)
  assert.deepEqual(a, b)
  assert.equal(a.chars, countChars(text))
  assert.ok(a.sentence.mean > 0)
})

test('统计：对白占比与句长是画像不是判决', () => {
  const text = '「你来了。」他说。\n「嗯。」\n他站着，没有动。'
  const stats = computeStats(text)
  assert.ok(stats.dialogue.ratio > 0)
  assert.ok(stats.sentence.mean > 0)
  assert.equal(typeof stats.sentence.cv, 'number')
})

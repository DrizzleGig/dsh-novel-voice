// scripts/eval-corpus.mjs — 用真实语料跑 G1（人工正文误报）与 L1 命中密度。
// 用法：
//   node scripts/eval-corpus.mjs --human "D:/斗罗大陆/原著_utf8.txt" --ai "D:/斗罗大陆/正文" [--human-chapters 24]
//   node scripts/eval-corpus.mjs --human <目录> --ai <目录> --control <故意写满 AI 味的稿子>
// 只读本地文件，不上传、不调用模型。

import fs from 'node:fs/promises'
import path from 'node:path'
import { lint } from '../lib/check.js'
import { defaultEntries } from '../lib/watchlist.js'
import { splitChapters } from '../lib/chapters.js'
import { computeStats } from '../lib/metrics.js'
import { countChars } from '../lib/text.js'

function argOf(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const watchlist = { entries: defaultEntries() }
const humanPath = argOf('human')
const aiPath = argOf('ai')
const controlPath = argOf('control')
const chapterCount = Number(argOf('human-chapters', '24'))

async function filesOf(target) {
  const stat = await fs.stat(target)
  if (stat.isFile()) return [target]
  const names = (await fs.readdir(target)).filter((name) => /\.(txt|md)$/i.test(name)).sort()
  return names.map((name) => path.join(target, name))
}

async function humanChapters() {
  if (!humanPath) return []
  const stat = await fs.stat(humanPath)
  if (stat.isDirectory()) {
    const files = await filesOf(humanPath)
    const rows = []
    for (const file of files) {
      const text = await fs.readFile(file, 'utf8')
      rows.push({ label: path.basename(file), text })
    }
    return rows
  }
  const text = await fs.readFile(humanPath, 'utf8')
  const chapters = splitChapters(text)
  if (chapters.length <= 1) return [{ label: path.basename(humanPath), text }]
  const picked = []
  const count = Math.min(chapterCount, chapters.length)
  for (let i = 0; i < count; i += 1) {
    const index = Math.floor((i * chapters.length) / count)
    picked.push({ label: `第${chapters[index].index}章`, text: text.slice(chapters[index].start, chapters[index].end) })
  }
  return picked
}

const human = []
for (const item of await humanChapters()) {
  const result = lint(item.text, { watchlist })
  human.push({ ...item, chars: result.chars, warn: result.summary.warn, block: result.summary.block, stats: computeStats(item.text) })
}

const ai = []
if (aiPath) {
  for (const file of await filesOf(aiPath)) {
    const text = (await fs.readFile(file, 'utf8')).replace(/^#\s*[^\n]*\n+/, '')
    const result = lint(text, { watchlist })
    ai.push({ label: path.basename(file), chars: result.chars, warn: result.summary.warn, block: result.summary.block, detectors: [...new Set(result.findings.filter((f) => f.severity === 'warn').map((f) => f.detector))], stats: computeStats(text) })
  }
}

let control = null
if (controlPath) {
  const text = await fs.readFile(controlPath, 'utf8')
  const result = lint(text, { watchlist })
  control = { chars: result.chars, warn: result.summary.warn, detectors: [...new Set(result.findings.filter((f) => f.severity === 'warn').map((f) => f.detector))] }
}

const total = (rows, key) => rows.reduce((sum, row) => sum + row[key], 0)
const humanChars = total(human, 'chars')
const humanWarns = total(human, 'warn')
const aiChars = total(ai, 'chars')
const aiWarns = total(ai, 'warn')
const rate = (warns, chars) => (warns * 1000) / Math.max(1, chars)
const avg = (rows, pick) => (rows.length ? rows.reduce((sum, row) => sum + pick(row.stats), 0) / rows.length : 0)

console.log('=== G1 · 人工正文误报 ===')
console.log(`样本 ${human.length}，字符 ${humanChars}，warn ${humanWarns}，误报率 ${rate(humanWarns, humanChars).toFixed(2)} 处/千字（目标 ≤1.00）`)
if (humanWarns) {
  const byDetector = new Map()
  for (const row of human) {
    const result = lint(row.text, { watchlist })
    for (const finding of result.findings) {
      if (finding.severity === 'warn') byDetector.set(finding.detector, (byDetector.get(finding.detector) ?? 0) + 1)
    }
  }
  console.log('  按检测器:', [...byDetector.entries()].map(([key, value]) => `${key}=${value}`).join(' '))
}

if (control) {
  console.log('\n=== 正控 · 故意写满 AI 味的稿子 ===')
  console.log(`字符 ${control.chars}，warn ${control.warn}，命中密度 ${rate(control.warn, control.chars).toFixed(1)} 处/千字 [${control.detectors.join(',')}]`)
}

if (ai.length) {
  console.log('\n=== L1 · 真实 AI 初稿 ===')
  console.log(`文件 ${ai.length}，字符 ${aiChars}，warn ${aiWarns}，命中密度 ${rate(aiWarns, aiChars).toFixed(2)} 处/千字`)
  console.log(`有命中的文件 ${ai.filter((row) => row.warn > 0).length}/${ai.length}`)
}

if (human.length && ai.length) {
  const metrics = [
    ['句长均值', (s) => s.sentence.mean],
    ['句长 CV', (s) => s.sentence.cv],
    ['段长均值', (s) => s.paragraph.mean],
    ['对话占比', (s) => s.dialogue.ratio],
    ['抽象词/千字', (s) => s.abstractPer1k],
    ['解释连接/千字', (s) => s.explanationPer1k],
    ['句首重复占比', (s) => s.repetition.topOpenerShare],
  ]
  console.log('\n=== L2 画像（人工 vs AI） ===')
  for (const [label, pick] of metrics) console.log(`${label}: ${avg(human, pick).toFixed(2)} vs ${avg(ai, pick).toFixed(2)}`)
}

if (humanChars && rate(humanWarns, humanChars) > 1) {
  console.error('\n✗ G1 不通过：人工正文误报超过 1 处/千字。')
  process.exitCode = 1
}

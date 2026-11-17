// scripts/eval-deslop.mjs — 夹具回归：L1 命中召回、人工文本误报、定点改写保真。
// 夹具目录（可选）：fixtures/ai-flavored/*.txt 与 fixtures/human-approved/*.txt
// 每个 ai 文件首行可写「期望命中：cliche-density,emotion-naming」，不写就只统计总数。

import fs from 'node:fs/promises'
import path from 'node:path'
import { lint } from '../lib/check.js'
import { defaultEntries } from '../lib/watchlist.js'
import { selectWindows, retention } from '../lib/repair.js'

const root = path.resolve(import.meta.dirname, '..')
const watchlist = { entries: defaultEntries() }

async function readDir(dir) {
  try {
    const names = await fs.readdir(dir)
    const out = []
    for (const name of names.filter((item) => item.endsWith('.txt')).sort()) {
      out.push({ name, text: await fs.readFile(path.join(dir, name), 'utf8') })
    }
    return out
  } catch {
    return []
  }
}

const ai = await readDir(path.join(root, 'fixtures', 'ai-flavored'))
const human = await readDir(path.join(root, 'fixtures', 'human-approved'))

if (!ai.length && !human.length) {
  console.log('eval-deslop: 没有夹具。')
  console.log('  放 fixtures/ai-flavored/*.txt 与 fixtures/human-approved/*.txt 后重跑。')
  process.exit(0)
}

let aiHits = 0
let aiExpect = 0
let aiMissed = []
for (const sample of ai) {
  const result = lint(sample.text, { watchlist })
  const l1 = result.findings.filter((finding) => ['cliche-density', 'negation-parallel', 'paragraph-closure', 'emotion-naming'].includes(finding.detector))
  aiHits += l1.length
  const expectLine = sample.text.split('\n')[0]
  const expected = expectLine.startsWith('期望命中：')
    ? expectLine.replace('期望命中：', '').split(',').map((item) => item.trim()).filter(Boolean)
    : []
  for (const detector of expected) {
    aiExpect += 1
    if (!l1.some((finding) => finding.detector === detector)) aiMissed.push(`${sample.name}:${detector}`)
  }
}

let humanFindings = 0
let humanChars = 0
for (const sample of human) {
  const result = lint(sample.text, { watchlist })
  humanFindings += result.findings.filter((finding) => finding.severity === 'warn').length
  humanChars += result.chars
}

const recall = aiExpect ? (aiExpect - aiMissed.length) / aiExpect : null
const falsePositivePer1k = humanChars ? (humanFindings * 1000) / humanChars : null

console.log('eval-deslop')
console.log(`  AI 段 ${ai.length}，L1 命中总数 ${aiHits}，期望项召回 ${recall == null ? '—' : `${(recall * 100).toFixed(0)}%`}`)
if (aiMissed.length) console.log(`  漏检：${aiMissed.join('、')}`)
console.log(`  人工段 ${human.length}，warn ${humanFindings}，误报/千字 ${falsePositivePer1k == null ? '—' : falsePositivePer1k.toFixed(2)}`)

// 选窗与保留度：只报，不合规时给出提示（真正的改写要模型，不在回归里跑）。
const sample = ai[0]?.text ?? ''
const windows = selectWindows(lint(sample, { watchlist }).findings, sample)
console.log(`  首段选窗 ${windows.length} 个（每窗 ≤300 字）；保留度函数可用：${typeof retention === 'function'}`)

if (recall != null && recall < 0.7) {
  console.error('  ✗ 召回低于 70%：先补词表或规则，不要急着调改写。')
  process.exitCode = 1
}
if (falsePositivePer1k != null && falsePositivePer1k > 1) {
  console.error('  ✗ 人工段误报高于 1 处/千字：先收紧检测器。')
  process.exitCode = 1
}

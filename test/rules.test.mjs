import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { applyRules } from '../lib/rules/engine.js'
import { listPacks, packSummaries, setPackConfig, readPackConfig, validatePack } from '../lib/rules/index.js'
import { fingerprint } from '../lib/fingerprint.js'
import { toolDefinitions } from '../lib/tools.js'

async function workspace() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'voice-rules-'))
}

function tools() {
  return new Map(toolDefinitions().map((tool) => [tool.name, tool]))
}

test('规则包：坏 regex 在加载时拒绝，不静默跳过', () => {
  const base = {
    id: 'test-pack', license: 'MIT', source: { url: 'https://example.com' },
    rules: [{ id: 'r-1', match: { kind: 'regex', pattern: '(' } }],
  }
  assert.throws(() => validatePack(base, 'test.json'), /regex 不合法/)
  assert.doesNotThrow(() => validatePack({
    ...base,
    rules: [{ id: 'r-1', match: { kind: 'regex', pattern: '淡淡的' } }],
  }, 'test.json'))
})

test('规则包：加载、命中、scope 与来源许可字段', async () => {
  const packs = await listPacks()
  const pack = packs.find((item) => item.id === 'zh-slop-core')
  assert.ok(pack)
  assert.equal(pack.license, 'MIT')
  assert.equal(pack.rules.length, 25)
  const fiction = packs.find((item) => item.id === 'zh-fiction')
  assert.ok(fiction)
  assert.equal(fiction.license, 'MIT')
  assert.equal(fiction.rules.length, 17)
  assert.equal(fiction.defaultEnabled, false)
  const narrative = packs.find((item) => item.id === 'zh-narrative')
  assert.ok(narrative)
  assert.equal(narrative.license, 'MIT')
  assert.equal(narrative.rules.length, 12)
  assert.equal(narrative.defaultEnabled, false)
  const punctuation = packs.find((item) => item.id === 'zh-punctuation')
  assert.ok(punctuation)
  assert.equal(punctuation.license, 'MIT')
  assert.equal(punctuation.rules.length, 5)
  assert.equal(punctuation.defaultEnabled, false)

  const text = '在当今快节奏的世界中，我们不仅是读者，更是参与者。'
  const result = applyRules(text, [pack])
  assert.ok(result.findings.length >= 2)
  const stock = result.findings.find((finding) => finding.ruleId === 'ZH001')
  assert.ok(stock)
  assert.equal(stock.packId, 'zh-slop-core')
  assert.equal(stock.outcome, 'hit')
  assert.equal(stock.license, 'MIT')
  assert.equal(typeof stock.span.start, 'number')
  assert.equal(text.slice(stock.span.start, stock.span.end), stock.quote)
  assert.equal('score' in stock, false)
  assert.equal('total' in stock, false)
  assert.equal('rank' in stock, false)
})

test('规则包：叙述 scope 不误伤对白', async () => {
  const pack = (await listPacks()).find((item) => item.id === 'zh-slop-core')
  const dialogue = '「不仅是活着，更是活得有尊严。」他说。'
  const result = applyRules(dialogue, [pack])
  assert.equal(result.findings.some((finding) => finding.ruleId === 'ZH028'), false)
})

test('规则包默认关；set-packs 后 voice_check 才带回 ruleFindings', async () => {
  const dir = await workspace()
  const t = tools()
  const text = '在当今快节奏的世界中，我们不仅是读者，更是参与者。'

  const off = await t.get('voice_check').execute({ dir, book: 'book', action: 'lint', text })
  assert.equal(off.ok, true)
  assert.deepEqual(off.ruleFindings, [])
  assert.deepEqual(off.rulePacks, [])

  const configured = await t.get('voice_profile').execute({
    dir, book: 'book', action: 'set-packs', packs: ['zh-slop-core'],
  })
  assert.deepEqual(configured.enabled, ['zh-slop-core'])
  const config = await readPackConfig(dir, 'book')
  assert.deepEqual(config.enabled, ['zh-slop-core'])

  const on = await t.get('voice_check').execute({ dir, book: 'book', action: 'lint', text })
  assert.ok(on.ruleFindings.length >= 2)
  assert.deepEqual(on.rulePacks, ['zh-slop-core'])
  assert.equal('score' in on.ruleFindings[0], false)

  const listed = await t.get('voice_profile').execute({ dir, book: 'book', action: 'packs' })
  assert.equal(listed.packs.some((pack) => pack.id === 'zh-slop-core'), true)
  assert.ok(listed.packs.every((pack) => pack.license && pack.source?.url))
})

test('文体指纹：同输入同 hash、无评分、基线比较只给 close/deviate/unknown', async () => {
  const text = '他推开门，雪落在肩上，很快化了。屋里没有灯，只有灶膛里一点红。\n「回来了。」老人没抬头。'
  const first = fingerprint(text)
  const second = fingerprint(text)
  assert.equal(first.hash, second.hash)
  assert.equal(first.values.sentenceMean, second.values.sentenceMean)
  assert.equal('score' in first, false)
  assert.equal('total' in first, false)

  const { baselineFromFingerprints, compareFingerprint } = await import('../lib/fingerprint.js')
  const baseline = baselineFromFingerprints([first, fingerprint(text + '\n他站了一会儿。')])
  const compared = compareFingerprint(first, baseline)
  assert.ok(compared.dimensions.length > 5)
  assert.equal('score' in compared, false)
  assert.equal('total' in compared, false)
  for (const dimension of compared.dimensions) {
    assert.ok(['close', 'deviate', 'unknown'].includes(dimension.status))
  }
})

test('voice_check 带回 fingerprint，且不新增 score/total/rank', async () => {
  const dir = await workspace()
  const t = tools()
  const checked = await t.get('voice_check').execute({
    dir, book: 'book', action: 'lint', text: '他推开门。雪落在肩上。',
  })
  assert.equal(checked.ok, true)
  assert.equal(typeof checked.fingerprint.hash, 'string')
  assert.equal('score' in checked.fingerprint, false)
  assert.equal('score' in checked, false)
  assert.equal('total' in checked, false)
})

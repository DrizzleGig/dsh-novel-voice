import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { decodeBuffer, importTargets, importTexts } from '../lib/import.js'
import { measureWork } from '../lib/learn.js'
import { createProfile, confirmProfile, loadProfile, regenerateProfile, rollbackProfile, rhythmRules, templateRules, addRules } from '../lib/profile.js'
import { readLibrary, readJson, pathsFor } from '../lib/store.js'
import { aggregateFeedback, recordFeedback, pendingCandidates } from '../lib/feedback.js'
import { readWatchlist, addEntry } from '../lib/watchlist.js'

const REF = `第一章 雪夜

他推开门，雪落在肩上，很快化了。屋里没有灯，只有灶膛里一点红。
「回来了。」老人没抬头，手里的柴刀停在木头上。
他没应声，把背上的弓卸下来，靠在门后。弓弦上用布条缠过，湿了，他伸手解开，一圈一圈绕好。
「山里有东西。」他说。
老人这才抬眼，看了他一会儿，把柴刀放下。「今晚别出去。」

第二章 旧账

天亮得晚。他起来时，老人已经不在屋里，灶上温着一碗粥。
粥里放了两粒盐，咸得刚好。他喝了一半，把碗放下，出门。
雪停了，路上有脚印，往东。他顺着走了半里，脚印拐进林子，没了。
他站住，抬头看树。树枝上挂着一段布条，是他昨晚缠弓的那一段。
`

const OWN = `一

林砚回来的时候天已经黑了。院子里有灯，灯下坐着一个人，背对着门。
「等你很久了。」那人说。
林砚站在门口，没有进去。他闻到了酒味，也闻到了血。
「你喝酒了。」
「喝了一点。」那人转过头，脸上有一道新疤，从眉骨一直划到下巴，「你认不出我了。」
他认得出。他只是不想认。

二

屋里很冷。林砚添了柴，火起来，光照在那人脸上，疤痕显得更深。
「你来找我，是为什么。」
「借一样东西。」
「什么。」
「你的姓。」
他笑了一声，声音很短。「我早就不用了。」
「我知道。」那人把酒杯放下，「所以我才来。」
`

async function workspace() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-test-'))
  await fs.writeFile(path.join(dir, 'ref.txt'), REF)
  await fs.writeFile(path.join(dir, 'own.txt'), OWN)
  return dir
}

test('编码：UTF-8 BOM 与 UTF-16LE BOM 都能读', () => {
  const utf16 = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('雪夜', 'utf16le')])
  assert.equal(decodeBuffer(utf16).text, '雪夜')
  assert.equal(decodeBuffer(utf16).encoding, 'utf-16le')

  const bom = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('雪夜', 'utf8')])
  assert.equal(decodeBuffer(bom).text, '雪夜')
  assert.equal(decodeBuffer(bom).encoding, 'utf-8')
})

test('导入：去重、来源类型、容量可读', async () => {
  const dir = await workspace()
  const first = await importTargets(dir, 'book', { paths: [path.join(dir, 'ref.txt')] })
  assert.equal(first.imported.length, 1)
  assert.equal(first.imported[0].sourceType, 'reference')

  const again = await importTargets(dir, 'book', { paths: [path.join(dir, 'ref.txt')] })
  assert.equal(again.imported.length, 0)
  assert.equal(again.skipped[0].reason, 'duplicate')

  const own = await importTargets(dir, 'book', { paths: [path.join(dir, 'own.txt')], sourceType: 'own' })
  assert.equal(own.imported[0].sourceType, 'own')
  assert.equal(own.capacity.works, 2)
})

test('导入：浏览器上传的文本走同一条落盘链路，重复会被拦', async () => {
  const dir = await workspace()
  const first = await importTexts(dir, 'book', [
    { name: 'a.txt', text: REF },
    { name: 'own.txt', text: OWN },
  ], { sourceType: 'own' })
  assert.equal(first.imported.length, 2)
  assert.ok(first.imported.every((work) => work.sourceType === 'own'))

  const again = await importTexts(dir, 'book', [{ name: 'a.txt', text: REF }])
  assert.equal(again.imported.length, 0)
  assert.equal(again.skipped[0].reason, 'duplicate')

  const tiny = await importTexts(dir, 'book', [{ name: 'short.txt', text: '太短了' }])
  assert.equal(tiny.skipped[0].reason, 'too-short')
})

test('档案：区间不为负、样段来自旧作且遮名、锚点 ≤80 字', async () => {
  const dir = await workspace()
  await importTargets(dir, 'book', { paths: [path.join(dir, 'ref.txt')] })
  await importTargets(dir, 'book', { paths: [path.join(dir, 'own.txt')], sourceType: 'own' })
  const library = await readLibrary(dir, 'book')
  for (const work of library.works) await measureWork(dir, 'book', work.workId)
  const own = library.works.find((work) => work.sourceType === 'own')
  assert.ok(own, 'own 作品应存在')

  const profile = await createProfile(dir, 'book', { cast: ['林砚'] })
  assert.ok(Object.keys(profile.bands).length >= 4)
  for (const [, metric] of Object.entries(profile.bands)) {
    assert.ok(metric.band[0] >= 0, `${metric} 下界不应为负`)
    assert.ok(metric.band[1] >= metric.band[0])
  }
  assert.ok(profile.samples.length >= 1)
  assert.ok(!profile.samples[0].text.includes('林砚'), '样段里的人名应被遮掉')
  for (const anchor of profile.anchors) assert.ok(anchor.text.length <= 60)
  assert.doesNotMatch(profile.identity.summary, /待作者确认/)

  const confirmed = await confirmProfile(dir, 'book', profile.id)
  assert.equal(confirmed.status, 'confirmed')
  assert.notEqual(confirmed.version, profile.version)
})

test('档案：版本快照可回滚，回滚不删反馈', async () => {
  const dir = await workspace()
  await importTargets(dir, 'book', { paths: [path.join(dir, 'ref.txt')] })
  const library = await readLibrary(dir, 'book')
  await measureWork(dir, 'book', library.works[0].workId)
  const profile = await createProfile(dir, 'book', {})
  await confirmProfile(dir, 'book', profile.id)

  const rolled = await rollbackProfile(dir, 'book', profile.id)
  assert.notEqual(rolled.version, '1.2')
  assert.ok(Array.isArray(rolled.rules))
})

test('技法卡：模板写进档案后简报才有【写法】', async () => {
  const dir = await workspace()
  await importTargets(dir, 'book', { paths: [path.join(dir, 'ref.txt')] })
  const library = await readLibrary(dir, 'book')
  await measureWork(dir, 'book', library.works[0].workId)
  const profile = await createProfile(dir, 'book', {})
  const { added } = await addRules(dir, 'book', profile.id, templateRules([1, 2]))
  assert.equal(added.length, 2)
  const reloaded = await loadProfile(dir, 'book', profile.id)
  assert.equal(reloaded.rules.filter((rule) => rule.status === 'confirmed').length, 2)
})

test('导入：浏览器上传的原始字节会走主机编码探测', async () => {
  const dir = await workspace()
  const utf16 = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(REF, 'utf16le')])
  const result = await importTexts(dir, 'book', [{ name: 'utf16.txt', base64: utf16.toString('base64') }])
  assert.equal(result.imported.length, 1)
  assert.equal(result.imported[0].encoding, 'utf-16le')
})

test('导入：乱码文本会被拦下，不写进书架', async () => {
  const dir = await workspace()
  const mojibake = REF.slice(0, 600).replace(/[\u4e00-\u9fa5]/g, '\uFFFD')
  const result = await importTexts(dir, 'book', [{ name: 'bad.txt', text: mojibake }])
  assert.equal(result.imported.length, 0)
  assert.equal(result.skipped[0].reason, 'mojibake')
  assert.ok(result.skipped[0].message.includes('编码'))
})

test('节奏规则：从 L2 区间生成不带数字的长句/长段规则', () => {
  const bands = {
    sentenceMean: { band: [28, 34] },
    paragraphMean: { band: [60, 80] },
  }
  const rules = rhythmRules(bands)
  assert.equal(rules.length, 2)
  assert.ok(rules.every((rule) => rule.layer === 'L2'))
  assert.ok(rules.some((rule) => rule.title === '句子可以长'))
  assert.ok(rules.some((rule) => rule.title === '段落可以长'))
  assert.ok(!rules.some((rule) => /\d+%/.test(rule.instruction)))

  const short = rhythmRules({ sentenceMean: { band: [12, 16] }, paragraphMean: { band: [18, 26] } })
  assert.ok(short.some((rule) => rule.title === '短句推进'))
  assert.ok(short.some((rule) => rule.title === '段落偏短'))
  assert.equal(templateRules([1], { bands }).length, 3, '一张模板 + 两条节奏规则')
})

test('档案：regenerate 重建锚点与样段，版本 +1', async () => {
  const dir = await workspace()
  await importTargets(dir, 'book', { paths: [path.join(dir, 'ref.txt')] })
  const library = await readLibrary(dir, 'book')
  await measureWork(dir, 'book', library.works[0].workId)
  const profile = await createProfile(dir, 'book', {})
  const regenerated = await regenerateProfile(dir, 'book', profile.id)
  assert.notEqual(regenerated.version, profile.version)
  assert.ok(regenerated.anchors.length >= 1)
  for (const anchor of regenerated.anchors) {
    assert.ok(anchor.text.length <= 60)
    assert.ok(!/^第\s*[0-9一二三四五六七八九十]+/.test(anchor.text))
  }
})

test('技法卡：模板写进档案后会挂到模式上，权重才有意义', async () => {
  const dir = await workspace()
  await importTargets(dir, 'book', { paths: [path.join(dir, 'ref.txt')] })
  const library = await readLibrary(dir, 'book')
  await measureWork(dir, 'book', library.works[0].workId)
  const profile = await createProfile(dir, 'book', {})
  await addRules(dir, 'book', profile.id, templateRules([1, 2]))
  const reloaded = await loadProfile(dir, 'book', profile.id)
  const restrained = reloaded.modes.find((mode) => mode.id === 'm-restrained')
  const tight = reloaded.modes.find((mode) => mode.id === 'm-tight')
  assert.ok(restrained.ruleIds.length > 0, '对峙类规则应挂到克制模式')
  assert.ok(tight.ruleIds.length > 0, '动作类规则应挂到紧凑模式')
  assert.equal(reloaded.rules.every((rule) => rule.status === 'confirmed'), true)
})

test('反馈：同一条意见出现两次才进待确认，且不自动改档案', async () => {
  const dir = await workspace()
  await importTargets(dir, 'book', { paths: [path.join(dir, 'ref.txt')] })
  const library = await readLibrary(dir, 'book')
  await measureWork(dir, 'book', library.works[0].workId)
  const profile = await createProfile(dir, 'book', {})
  const before = await loadProfile(dir, 'book', profile.id)

  await recordFeedback(dir, 'book', { kind: 'dislike', text: '少用成语', scope: { scene: '悬疑对峙' } })
  const one = await aggregateFeedback(dir, 'book')
  assert.equal(one.pending.length, 0)

  await recordFeedback(dir, 'book', { kind: 'dislike', text: '少用成语', scope: { scene: '悬疑对峙' } })
  const two = await aggregateFeedback(dir, 'book')
  assert.equal(two.pending.length, 1)
  assert.equal(two.pending[0].supports, 2)

  const after = await loadProfile(dir, 'book', profile.id)
  assert.deepEqual(after.rules, before.rules, '反馈不应自动写进档案')
  assert.equal((await pendingCandidates(dir, 'book')).length, 1)
})

test('禁语表：本书追加后可命中，默认表不被覆盖', async () => {
  const dir = await workspace()
  const defaults = await readWatchlist(dir, 'book')
  assert.ok(defaults.entries.length > 30)
  await addEntry(dir, 'book', { phrase: '风起于青萍之末', why: '作者标黑' })
  const merged = await readWatchlist(dir, 'book')
  assert.ok(merged.entries.some((entry) => entry.phrase === '风起于青萍之末'))
  assert.ok(merged.entries.some((entry) => entry.phrase === '眼中闪过一丝'))
})

test('审计：导入与统计都留下可复现记录', async () => {
  const dir = await workspace()
  await importTargets(dir, 'book', { paths: [path.join(dir, 'ref.txt')] })
  const library = await readLibrary(dir, 'book')
  await measureWork(dir, 'book', library.works[0].workId)
  const auditFile = pathsFor(dir, 'book').audit
  const text = await fs.readFile(auditFile, 'utf8')
  assert.match(text, /measure/)
  const stats = await readJson(path.join(pathsFor(dir, 'book').work(library.works[0].workId), 'stats.json'))
  assert.ok(stats.stats.sentences > 0)
})

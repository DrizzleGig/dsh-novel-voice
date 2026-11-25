import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { apply } from '../index.js'
import { importTargets } from '../lib/import.js'
import { measureWork } from '../lib/learn.js'
import { createProfile, confirmProfile, readHistory, rollbackProfile, setWeights, loadProfile } from '../lib/profile.js'
import { readLibrary, readState, pathsFor } from '../lib/store.js'
import { loadContract } from '../lib/contract.js'
import { mirrorText } from '../lib/mirror.js'

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

async function workspace() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-service-'))
  await fs.writeFile(path.join(dir, 'ref.txt'), REF, 'utf8')
  await importTargets(dir, 'book', { paths: [path.join(dir, 'ref.txt')] })
  const library = await readLibrary(dir, 'book')
  await measureWork(dir, 'book', library.works[0].workId)
  return dir
}

function fakeContext(dir) {
  const provided = []
  const services = {
    workingDirectory: { ensure: async () => dir },
    agents: { list: () => [] },
    commands: { register() {} },
    skills: { register() {} },
  }
  const ctx = {
    get(name) { return services[name] },
    effect(fn) { return fn() },
    on() { return () => {} },
    provide(name) { provided.push(name) },
    tools: { register() {}, restrict() { return () => {} } },
  }
  return { ctx, provided }
}

test('服务：identity 是函数，cwd 与 dir 都能读，revision/brief 字段齐全', async () => {
  const dir = await workspace()
  const profile = await createProfile(dir, 'book', {})
  await confirmProfile(dir, 'book', profile.id)
  const { ctx, provided } = fakeContext(dir)
  await apply(ctx, {})
  assert.ok(provided.includes('novelVoice'))
  const service = ctx.novelVoice
  assert.equal(typeof service.identity, 'function')
  const identity = service.identity()
  assert.equal(identity.plugin, 'dsh-novel-voice')
  assert.equal(identity.service_version, 1)
  assert.ok(identity.capabilities.includes('voice.brief'))
  assert.ok(identity.capabilities.includes('voice.readerSignals'))
  assert.ok(identity.capabilities.includes('voice.personaBrief'))
  assert.equal(identity.readOnly, true)

  const byCwd = await service.getRevision({ cwd: dir, book: 'book' })
  const byDir = await service.getRevision({ dir, book: 'book' })
  assert.equal(byCwd.revision, byDir.revision)
  assert.ok(byCwd.revision >= 2)

  const status = await service.getStatus({ cwd: dir, book: 'book' })
  assert.equal(status.revision, byCwd.revision)
  assert.equal(status.works, 1)

  const brief = await service.getBrief({ cwd: dir, book: 'book', scene: '悬疑对峙' })
  assert.equal(brief.ok, true)
  assert.equal(brief.revision, byCwd.revision)
  assert.equal(typeof brief.generated_at, 'string')
  assert.equal(typeof brief.tokens, 'number')

  const signals = await service.getReaderSignals({ cwd: dir, book: 'book' })
  assert.equal(signals.ok, true)
  assert.equal(signals.available, false)
  assert.equal(signals.enabled, false)
  assert.equal(signals.reason, 'reader-off')
  assert.equal(signals.scope, 'book')

  const persona = await service.getPersonaBrief({ cwd: dir, book: 'book' })
  assert.equal(persona.ok, true)
  assert.equal(persona.available, false)
  assert.equal(persona.reason, 'no-confirmed')
})

test('协作：voice → fanfic 读 project.json，旧 book.json 仍兼容，显式 project 不串书', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-fanfic-'))
  const base = path.join(dir, '.dsh-novel-fanfic')
  await fs.mkdir(path.join(base, 'demo'), { recursive: true })
  await fs.writeFile(path.join(base, 'demo', 'project.json'), JSON.stringify({ forbidden: ['不许提剑'] }))
  await fs.mkdir(path.join(base, 'legacy'), { recursive: true })
  await fs.writeFile(path.join(base, 'legacy', 'book.json'), JSON.stringify({ forbidden: ['旧词'] }))

  const modern = await loadContract(dir)
  assert.equal(modern.available, true)
  assert.deepEqual(modern.forbidden, ['不许提剑'])
  assert.match(modern.source, /project\.json$/)

  const legacy = await loadContract(dir, { project: 'legacy' })
  assert.equal(legacy.available, true)
  assert.deepEqual(legacy.forbidden, ['旧词'])

  const missing = await loadContract(dir, { project: 'missing' })
  assert.equal(missing.available, false)
  assert.equal(missing.reason, 'no-project')
  assert.equal(missing.project, 'missing')
})

test('revision：写档案单调递增，历史可读，回滚建新 revision 且不重号', async () => {
  const dir = await workspace()
  const profile = await createProfile(dir, 'book', {})
  await confirmProfile(dir, 'book', profile.id)
  const first = await readState(dir, 'book')
  await setWeights(dir, 'book', profile.id, { global: { 'm-immersive': 0.7, 'm-tight': 0.2, 'm-restrained': 0.1 } })
  const second = await readState(dir, 'book')
  assert.equal(second.revision, first.revision + 1)

  const history = await readHistory(dir, 'book', profile.id)
  assert.ok(history.length >= 3)
  assert.ok(history[0].current)
  assert.ok(history[0].revision > history[1].revision)

  const before = await loadProfile(dir, 'book', profile.id)
  const rolled = await rollbackProfile(dir, 'book', profile.id)
  assert.ok(rolled.revision > before.revision)
  assert.equal(rolled.action, 'rollback')
  assert.ok(rolled.restoredFrom >= 1)
  const versions = (await readHistory(dir, 'book', profile.id)).map((item) => item.version)
  assert.equal(new Set(versions).size, versions.length, '版本号不应重复')
})

test('对照镜：只读、无评分、覆盖六项区间、可标 stale', async () => {
  const dir = await workspace()
  const profile = await createProfile(dir, 'book', {})
  await confirmProfile(dir, 'book', profile.id)
  const text = '他忽然感到一阵莫名的恐惧。那不是对黑暗的害怕，而是一种更深的、无法言说的不安。'
  const result = await mirrorText({ dir, book: 'book', text })
  assert.equal(result.ok, true)
  assert.equal(result.findings.length > 0, true)
  assert.equal(result.bands.length, 6)
  assert.equal(typeof result.textHash, 'string')
  assert.ok(result.profileRevision >= 2)
  assert.equal('score' in result, false)
  assert.equal('total' in result, false)
  assert.equal(result.stale, false)

  const stale = await mirrorText({
    dir,
    book: 'book',
    text,
    options: { textHash: 'wrong', profileRevision: result.profileRevision },
  })
  assert.equal(stale.stale, true)
  assert.ok(stale.staleReason.includes('重新对照'))
})

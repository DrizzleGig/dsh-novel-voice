import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { toolDefinitions } from '../lib/tools.js'
import { defaultEntries } from '../lib/watchlist.js'
import { repairText } from '../lib/repair.js'
import { lint } from '../lib/check.js'

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
`

const DRAFT = `他坐在桌前，眼中闪过一丝犹豫。空气中弥漫着一种说不出的压抑，他心中五味杂陈。
「你来了。」他说。
沈先生笑了，嘴角勾起一抹弧度。他没有说话，可那目光意味深长，仿佛在诉说着什么。
他知道，这一刻，自己再也无法回头了。从此，一切都将不同。
他感到无比紧张，心里充满了不安，不知道接下来应该怎么办。`

async function workspace() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-tools-'))
  await fs.writeFile(path.join(dir, 'ref.txt'), REF)
  await fs.writeFile(path.join(dir, 'own.txt'), OWN)
  return dir
}

function tools(llm) {
  return new Map(toolDefinitions(llm ? { llm } : {}).map((tool) => [tool.name, tool]))
}

test('工具：导入 → 统计 → 档案 → 模板 → 确认 → 简报，一条链走通', async () => {  const dir = await workspace()
  const t = tools()
  const importResult = await t.get('voice_import').execute({ dir, book: 'book', action: 'import', paths: [path.join(dir, 'ref.txt')] })
  assert.equal(importResult.imported.length, 1)

  const ownResult = await t.get('voice_import').execute({ dir, book: 'book', action: 'import', paths: [path.join(dir, 'own.txt')], sourceType: 'own' })
  assert.equal(ownResult.imported[0].sourceType, 'own')

  const measured = await t.get('voice_learn').execute({ dir, book: 'book', action: 'measure' })
  assert.equal(measured.measured.length, 2)
  assert.ok(measured.measured.every((item) => item.ok !== false))

  const created = await t.get('voice_profile').execute({ dir, book: 'book', action: 'create', cast: ['林砚'] })
  assert.ok(created.profile.id)
  assert.ok(created.samples >= 1)

  const applied = await t.get('voice_profile').execute({ dir, book: 'book', action: 'apply', templateIds: [1, 2, 3] })
  assert.ok(applied.added.length >= 3)

  const confirmed = await t.get('voice_profile').execute({ dir, book: 'book', action: 'confirm' })
  assert.equal(confirmed.profile.status, 'confirmed')

  const brief = await t.get('voice_brief').execute({ dir, book: 'book', chapter: 12, scene: '悬疑对峙', cast: ['林砚'] })
  assert.match(brief.markdown, /【写法】/)
  assert.match(brief.markdown, /【不要】/)
  assert.match(brief.markdown, /【样段】/)
  assert.match(brief.markdown, /【指纹】/)
  assert.ok(brief.chars <= 600)
})

test('工具：check 定位、polish 默认只报不改', async () => {
  const dir = await workspace()
  const t = tools()
  await t.get('voice_import').execute({ dir, book: 'book', action: 'import', paths: [path.join(dir, 'ref.txt')] })
  await t.get('voice_learn').execute({ dir, book: 'book', action: 'measure' })

  const checked = await t.get('voice_check').execute({ dir, book: 'book', action: 'lint', text: DRAFT })
  assert.ok(checked.summary.warn >= 3)
  assert.ok(checked.findings.every((finding) => typeof finding.span.start === 'number'))
  assert.ok(checked.findings.some((finding) => finding.detector === 'cliche-density'))

  const dry = await t.get('voice_polish').execute({ dir, book: 'book', text: DRAFT })
  assert.equal(dry.dryRun, true)
  assert.ok(dry.windows >= 1)
  assert.equal(dry.revised, undefined)
})

test('工具：rank 不判断好坏，只指出更接近档案的一份', async () => {
  const dir = await workspace()
  const t = tools()
  const ranked = await t.get('voice_check').execute({
    dir, book: 'book', action: 'rank',
    candidates: [DRAFT, '他推开门。雪落在肩上，很快化了。'],
  })
  assert.equal(ranked.closest, 1)
  assert.match(ranked.note, /不代表写得更好/)
})

test('voice_polish 写回拒绝工作区外路径，且外部文件字节不变', async () => {
  const dir = await workspace()
  const outside = path.join(path.dirname(dir), `voice-outside-${Date.now()}.txt`)
  await fs.writeFile(outside, DRAFT, 'utf8')
  try {
    await assert.rejects(
      () => tools(async () => DRAFT).get('voice_polish').execute({ dir, book: 'book', path: outside, write: true, fix: true }),
      (error) => error.code === 'path-outside',
    )
    assert.equal(await fs.readFile(outside, 'utf8'), DRAFT)
  } finally {
    await fs.rm(outside, { force: true })
  }
})

test('voice_polish 拒绝模型可控 dir 越出宿主工作区', async () => {
  const dir = await workspace()
  const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-outside-dir-'))
  const outsideFile = path.join(outsideDir, 'chapter.txt')
  await fs.writeFile(outsideFile, DRAFT, 'utf8')
  try {
    await assert.rejects(
      () => tools().get('voice_polish').execute(
        { dir: outsideDir, book: 'book', path: outsideFile, write: true, fix: true },
        { cwd: dir },
      ),
      (error) => error.code === 'dir-outside',
    )
    assert.equal(await fs.readFile(outsideFile, 'utf8'), DRAFT)
  } finally {
    await fs.rm(outsideDir, { recursive: true, force: true })
  }
})

test('定点改写：只改命中窗口，仍能过五道校验', async () => {
  const text = '他推开门，雪落在肩上。屋里没有灯，只有灶膛里一点红。他眼中闪过一丝犹豫，嘴角勾起一抹弧度。他站了一会儿，才把门带上。'
  const watchlist = { entries: defaultEntries() }
  const findings = lint(text, { watchlist }).findings
  const fakeLlm = async ({ user }) => {
    const match = user.match(/【要改的段落】\n([\s\S]*?)\n\n【必须修掉的问题】/)
    assert.ok(match, 'prompt 必须带要改的段落')
    return match[1].replace('眼中闪过一丝犹豫，嘴角勾起一抹弧度', '停了一下，把手按在门框上')
  }
  const result = await repairText({ text, findings, llm: fakeLlm, watchlist, overlap: null })
  assert.equal(result.ok, true)
  assert.equal(result.changes.length, 1)
  assert.match(result.revised, /把手按在门框上/)
  assert.ok(!result.revised.includes('眼中闪过一丝'))
  assert.equal(result.after.warn <= result.before.warn, true)
})

test('定点改写：模型编数字时整窗回退，标 needs-author', async () => {
  const text = '他推开门，雪落在肩上。屋里没有灯，只有灶膛里一点红。他眼中闪过一丝犹豫，嘴角勾起一抹弧度。他站了一会儿，才把门带上。'
  const watchlist = { entries: defaultEntries() }
  const findings = lint(text, { watchlist }).findings
  const badLlm = async ({ user }) => {
    const match = user.match(/【要改的段落】\n([\s\S]*?)\n\n【必须修掉的问题】/)
    return `${match[1]}他数到第 7 下。`
  }
  const result = await repairText({ text, findings, llm: badLlm, watchlist, overlap: null })
  assert.equal(result.changes.length, 0)
  assert.ok(result.needsAuthor >= 1)
  assert.equal(result.revised, text)
  assert.ok(result.rejected.some((item) => ['new-fact', 'length', 'rewrote-too-much'].includes(item.reason)))
})

test('工具：书架移除会删目录并从索引摘掉', async () => {
  const dir = await workspace()
  const t = tools()
  const imported = await t.get('voice_import').execute({ dir, book: 'book', action: 'import', paths: [path.join(dir, 'ref.txt')] })
  const workId = imported.imported[0].workId

  const listed = await t.get('voice_import').execute({ dir, book: 'book', action: 'list' })
  assert.equal(listed.works.length, 1)

  const removed = await t.get('voice_import').execute({ dir, book: 'book', action: 'remove', workId })
  assert.equal(removed.ok, true)
  assert.equal(removed.works, 0)

  const after = await t.get('voice_import').execute({ dir, book: 'book', action: 'list' })
  assert.equal(after.works.length, 0)
  await assert.rejects(async () => {
    await fs.access(path.join(dir, '.dsh-novel-voice', 'book', 'works', workId))
  })

  await assert.rejects(
    () => t.get('voice_import').execute({ dir, book: 'book', action: 'remove', workId }),
    (error) => error.code === 'no-work',
  )
})

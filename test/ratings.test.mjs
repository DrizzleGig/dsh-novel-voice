import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { toolDefinitions } from '../lib/tools.js'
import { readerSignals } from '../lib/ratings.js'

const REF = `第一章 雪夜

他推开门，雪落在肩上，很快化了。屋里没有灯，只有灶膛里一点红。
「回来了。」老人没抬头，手里的柴刀停在木头上。
他没应声，把背上的弓卸下来，靠在门后。弓弦上用布条缠过，湿了，他伸手解开，一圈一圈绕好。
「山里有东西。」他说。
老人这才抬眼，看了他一会儿，把柴刀放下。「今晚别出去。」
他没问为什么。窗纸被风顶得鼓起来，又落回去。灶里的火不旺，屋里有一层薄薄的烟。
他坐在门槛上，把湿鞋脱了，脚趾冻得发木。雪还在下，落在院子里，没有声音。

第二章 旧账

天亮得晚。他起来时，老人已经不在屋里，灶上温着一碗粥。
粥里放了两粒盐，咸得刚好。他喝了一半，把碗放下，出门。
雪停了，路上有脚印，往东。他顺着走了半里，脚印拐进林子，没了。
他站了一会儿，转身回去。院门开着，老人在磨刀，磨石上全是水。
`

async function workspace() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-rating-'))
  await fs.writeFile(path.join(dir, 'ref.txt'), REF)
  return dir
}

function tools() {
  return new Map(toolDefinitions().map((tool) => [tool.name, tool]))
}

async function setupProfile(t, dir, workId) {
  await t.get('voice_learn').execute({ dir, book: 'book', action: 'measure' })
  await t.get('voice_profile').execute({ dir, book: 'book', action: 'create' })
  await t.get('voice_profile').execute({ dir, book: 'book', action: 'apply', templateIds: [1, 2, 3] })
  await t.get('voice_profile').execute({ dir, book: 'book', action: 'confirm' })
  return workId
}

test('读者评分：默认关、引用回查、确认后才进简报', async () => {
  const dir = await workspace()
  const t = tools()
  const imported = await t.get('voice_import').execute({
    dir, book: 'book', action: 'import', paths: [path.join(dir, 'ref.txt')],
  })
  const workId = imported.imported[0].workId
  await setupProfile(t, dir, workId)

  const off = await t.get('voice_rating').execute({ dir, book: 'book', action: 'status' })
  assert.equal(off.enabled, false)

  const like = await t.get('voice_rating').execute({
    dir, book: 'book', action: 'record', workId, chapter: 1,
    quote: '他推开门，雪落在肩上，很快化了。', polarity: 'like', strength: 5,
    reader: 'r1', tags: ['短句'], note: '喜欢这个开头',
  })
  assert.ok(like.recorded.id)
  assert.equal(like.recorded.polarity, 'like')
  assert.equal(like.recorded.status, undefined)

  const dislike = await t.get('voice_rating').execute({
    dir, book: 'book', action: 'record', workId, chapter: 1,
    quote: '屋里没有灯，只有灶膛里一点红。', polarity: 'dislike', strength: 2,
    reader: 'r2', tags: ['环境描写'],
  })
  assert.ok(dislike.recorded.id)
  assert.notEqual(like.recorded.id, dislike.recorded.id)

  const listed = await t.get('voice_rating').execute({ dir, book: 'book', action: 'list' })
  assert.equal(listed.total, 2)
  assert.equal(listed.pending, 2)
  assert.equal(listed.confirmed, 0)

  const before = await t.get('voice_brief').execute({ dir, book: 'book', chapter: 1 })
  assert.doesNotMatch(before.markdown, /读者偏好/)

  const confirmed = await t.get('voice_rating').execute({
    dir, book: 'book', action: 'confirm', ids: [like.recorded.id, dislike.recorded.id],
  })
  assert.deepEqual(confirmed.updated.sort(), [like.recorded.id, dislike.recorded.id].sort())

  const retried = await t.get('voice_rating').execute({
    dir, book: 'book', action: 'record', workId, chapter: 1,
    quote: '他推开门，雪落在肩上，很快化了。', polarity: 'like', strength: 5,
    reader: 'r1', tags: ['短句'], note: '喜欢这个开头',
  })
  assert.equal(retried.recorded.duplicate, true)
  const afterRetry = await t.get('voice_rating').execute({ dir, book: 'book', action: 'list' })
  const retriedItem = afterRetry.items.find((item) => item.id === like.recorded.id)
  assert.equal(retriedItem.status, 'confirmed')
  assert.equal(retriedItem.strength, 5)

  const changed = await t.get('voice_rating').execute({
    dir, book: 'book', action: 'record', workId, chapter: 1,
    quote: '他推开门，雪落在肩上，很快化了。', polarity: 'like', strength: 3,
    reader: 'r1', tags: ['短句'], note: '喜欢这个开头',
  })
  assert.equal(changed.recorded.duplicate, true)
  const afterChanged = await t.get('voice_rating').execute({ dir, book: 'book', action: 'list' })
  const changedItem = afterChanged.items.find((item) => item.id === like.recorded.id)
  assert.equal(changedItem.status, 'pending')
  assert.equal(changedItem.strength, 3)
  await t.get('voice_rating').execute({ dir, book: 'book', action: 'confirm', ids: [like.recorded.id] })

  await t.get('voice_rating').execute({ dir, book: 'book', action: 'enable', reason: '试读者反馈' })
  const pending = await t.get('voice_rating').execute({
    dir, book: 'book', action: 'record', workId, chapter: 2,
    quote: '天亮得晚。他起来时，老人已经不在屋里，灶上温着一碗粥。', polarity: 'dislike', strength: 1,
  })
  assert.ok(pending.recorded.id)
  const signals = await readerSignals(dir, 'book')
  assert.equal(signals.available, true)
  assert.equal(signals.count, 2)
  assert.equal(signals.likes.length, 1)
  assert.equal(signals.dislikes.length, 1)

  const after = await t.get('voice_brief').execute({ dir, book: 'book', chapter: 1 })
  assert.match(after.markdown, /读者偏好/)
  assert.match(after.markdown, /喜欢/)
  assert.match(after.markdown, /不喜欢/)
  assert.match(after.markdown, /仅建议/)

  const disabled = await t.get('voice_rating').execute({ dir, book: 'book', action: 'disable' })
  assert.equal(disabled.on, false)
  const again = await t.get('voice_brief').execute({ dir, book: 'book', chapter: 1 })
  assert.doesNotMatch(again.markdown, /读者偏好/)
})

test('读者评分：引用必须能在该章原文找到', async () => {
  const dir = await workspace()
  const t = tools()
  const imported = await t.get('voice_import').execute({
    dir, book: 'book', action: 'import', paths: [path.join(dir, 'ref.txt')],
  })
  const workId = imported.imported[0].workId

  await assert.rejects(
    () => t.get('voice_rating').execute({
      dir, book: 'book', action: 'record', workId, chapter: 1,
      quote: '这句话原文里没有。', polarity: 'like', strength: 3,
    }),
    /没有在该章原文中找到/,
  )
  await assert.rejects(
    () => t.get('voice_rating').execute({
      dir, book: 'book', action: 'record', workId, chapter: 1,
      quote: '他推开门，雪落在肩上，很快化了。', polarity: 'like', strength: 3, start: 1,
    }),
    /start/,
  )
})

test('匿名读者同一段可以留下多条评分，不会互相覆盖', async () => {
  const dir = await workspace()
  const t = tools()
  const imported = await t.get('voice_import').execute({
    dir, book: 'book', action: 'import', paths: [path.join(dir, 'ref.txt')],
  })
  const workId = imported.imported[0].workId

  const first = await t.get('voice_rating').execute({
    dir, book: 'book', action: 'record', workId, chapter: 1,
    quote: '他推开门，雪落在肩上，很快化了。', polarity: 'like', strength: 4,
  })
  const second = await t.get('voice_rating').execute({
    dir, book: 'book', action: 'record', workId, chapter: 1,
    quote: '他推开门，雪落在肩上，很快化了。', polarity: 'like', strength: 2,
  })
  assert.notEqual(first.recorded.id, second.recorded.id)
  const listed = await t.get('voice_rating').execute({ dir, book: 'book', action: 'list' })
  assert.equal(listed.total, 2)
})

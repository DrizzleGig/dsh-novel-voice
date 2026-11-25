import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { toolDefinitions } from '../lib/tools.js'

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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-persona-'))
  await fs.writeFile(path.join(dir, 'ref.txt'), REF)
  return dir
}

function tools(llm) {
  return new Map(toolDefinitions(llm ? { llm } : {}).map((tool) => [tool.name, tool]))
}

async function imported(t) {
  const dir = await workspace()
  const result = await t.get('voice_import').execute({
    dir, book: 'book', action: 'import', paths: [path.join(dir, 'ref.txt')],
  })
  return { dir, workId: result.imported[0].workId }
}

test('人物画像：提议 → 候选 → 作者确认', async () => {
  const t = tools()
  const { dir, workId } = await imported(t)

  const proposed = await t.get('voice_persona').execute({
    dir, book: 'book', action: 'propose', workId, name: '老人', aliases: ['守门人'],
    claims: [{
      field: 'behavior',
      text: '对陌生来客保持距离，但会给出实际警告。',
      situation: '雪夜来客',
      confidence: 0.7,
      evidence: [{
        chapter: 1,
        quote: '老人这才抬眼，看了他一会儿，把柴刀放下。「今晚别出去。」',
        channel: 'action',
      }],
    }],
  })
  assert.equal(proposed.persona.status, 'candidate')
  assert.equal(proposed.persona.claims.length, 1)
  assert.equal(proposed.persona.claims[0].evidence[0].channel, 'action')

  const listed = await t.get('voice_persona').execute({ dir, book: 'book', action: 'list' })
  assert.equal(listed.personas.length, 1)
  assert.equal(listed.personas[0].status, 'candidate')

  const confirmed = await t.get('voice_persona').execute({
    dir, book: 'book', action: 'confirm', personaId: proposed.persona.personaId,
  })
  assert.equal(confirmed.persona.status, 'confirmed')
  assert.ok(confirmed.persona.revision >= 2)

  const { personaBrief } = await import('../lib/personas.js')
  const brief = await personaBrief(dir, 'book', { cast: ['老人'] })
  assert.equal(brief.available, true)
  assert.match(brief.markdown, /老人/)
  assert.match(brief.markdown, /行为倾向/)
  const missing = await personaBrief(dir, 'book', { cast: ['不存在的人'] })
  assert.equal(missing.available, false)
  assert.equal(missing.reason, 'no-cast-match')
})

test('人物画像：extract 分批提案，证据回查后落 candidate', async () => {
  const payload = JSON.stringify({
    characters: [{
      name: '老人',
      aliases: ['守门人'],
      claims: [{
        field: 'behavior',
        text: '对陌生来客保持距离，但会给出实际警告。',
        situation: '雪夜来客',
        confidence: 0.7,
        evidence: [{
          chapter: 1,
          quote: '老人这才抬眼，看了他一会儿，把柴刀放下。「今晚别出去。」',
          channel: 'action',
        }],
      }],
    }],
  })
  const t = tools(async (request) => {
    const text = JSON.stringify(request)
    assert.match(text, /雪夜|推开门|灶膛/)
    return payload
  })
  const { dir, workId } = await imported(t)
  const extracted = await t.get('voice_persona').execute({
    dir, book: 'book', action: 'extract', workId, maxBatches: 1, maxChars: 3000,
  })
  assert.equal(extracted.ok, true)
  assert.equal(extracted.batches, 1)
  assert.equal(extracted.proposed.length, 1)
  assert.equal(extracted.proposed[0].status, 'candidate')
  assert.equal(extracted.proposed[0].claims[0].evidence[0].channel, 'action')
})

test('人物画像：A/B/C 绑定并列冲突，不合并', async () => {
  const t = tools()
  const { dir, workId } = await imported(t)

  const first = await t.get('voice_persona').execute({
    dir, book: 'book', action: 'propose', workId, name: '老人',
    claims: [{
      field: 'behavior', text: '先观察，再给出实际警告。',
      evidence: [{ chapter: 1, quote: '老人这才抬眼，看了他一会儿，把柴刀放下。「今晚别出去。」', channel: 'action' }],
    }],
  })
  const second = await t.get('voice_persona').execute({
    dir, book: 'book', action: 'propose', workId, name: '少年',
    claims: [{
      field: 'behavior', text: '直接冲出去查看脚印。',
      evidence: [{ chapter: 2, quote: '他站了一会儿，转身回去。', channel: 'action' }],
    }],
  })
  await t.get('voice_persona').execute({ dir, book: 'book', action: 'confirm', personaId: first.persona.personaId })
  await t.get('voice_persona').execute({ dir, book: 'book', action: 'confirm', personaId: second.persona.personaId })

  const { personaBrief } = await import('../lib/personas.js')
  const brief = await personaBrief(dir, 'book', {
    characterStyles: [
      { role: 'protagonist', personaId: first.persona.personaId, cast: ['老人'], weight: 1 },
      { role: 'supporting', personaId: second.persona.personaId, cast: ['少年'], weight: 1 },
    ],
  })
  assert.equal(brief.available, true)
  assert.deepEqual(brief.personas.map((persona) => persona.role), ['protagonist', 'supporting'])
  assert.equal(brief.conflicts.length, 1)
  assert.equal(brief.conflicts[0].field, 'behavior')
  assert.match(brief.markdown, /主角/)
  assert.match(brief.markdown, /【冲突（并列，不合并）】/)

  const castBrief = await personaBrief(dir, 'book', {
    cast: ['老人'],
    characterStyles: [
      { role: 'protagonist', personaId: first.persona.personaId, cast: ['老人'], weight: 1 },
      { role: 'supporting', personaId: second.persona.personaId, cast: ['少年'], weight: 1 },
    ],
  })
  assert.deepEqual(castBrief.personas.map((persona) => persona.name), ['老人'])
})

test('人物画像：全部对白证据不能确认', async () => {
  const t = tools()
  const { dir, workId } = await imported(t)
  const proposed = await t.get('voice_persona').execute({
    dir, book: 'book', action: 'propose', workId, name: '老人',
    claims: [{
      field: 'personality',
      text: '说话简短。',
      evidence: [{ chapter: 1, quote: '「回来了。」', channel: 'dialogue' }],
    }],
  })
  await assert.rejects(
    () => t.get('voice_persona').execute({ dir, book: 'book', action: 'confirm', personaId: proposed.persona.personaId }),
    /对白/,
  )
})

test('人物画像：对白引用伪报 narration 也不能确认', async () => {
  const t = tools()
  const { dir, workId } = await imported(t)
  const proposed = await t.get('voice_persona').execute({
    dir, book: 'book', action: 'propose', workId, name: '老人',
    claims: [{
      field: 'personality',
      text: '说话简短。',
      evidence: [{ chapter: 1, quote: '「回来了。」', channel: 'narration' }],
    }],
  })
  assert.equal(proposed.persona.claims[0].evidence[0].channel, 'dialogue')
  await assert.rejects(
    () => t.get('voice_persona').execute({ dir, book: 'book', action: 'confirm', personaId: proposed.persona.personaId }),
    /对白/,
  )
})

test('人物画像：start 错位不按首处匹配', async () => {
  const t = tools()
  const { dir, workId } = await imported(t)
  await assert.rejects(
    () => t.get('voice_persona').execute({
      dir, book: 'book', action: 'propose', workId, name: '老人',
      claims: [{
        field: 'behavior', text: '错位。',
        evidence: [{ chapter: 1, quote: '他推开门，雪落在肩上，很快化了。', start: 1, channel: 'narration' }],
      }],
    }),
    /start/,
  )
})

test('人物画像：证据引用必须能在原文找到', async () => {
  const t = tools()
  const { dir, workId } = await imported(t)
  await assert.rejects(
    () => t.get('voice_persona').execute({
      dir, book: 'book', action: 'propose', workId, name: '老人',
      claims: [{
        field: 'behavior',
        text: '不存在的证据。',
        evidence: [{ chapter: 1, quote: '这句原文没有。', channel: 'narration' }],
      }],
    }),
    /没有在该章原文中找到/,
  )
})

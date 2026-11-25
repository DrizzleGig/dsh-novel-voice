import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../index.js'

function fakeContext(dir) {
  const registered = []
  const commands = []
  const skills = []
  const provided = []
  const commandsApi = { register(command) { commands.push(command) } }
  const skillsApi = { register(skill) { skills.push(skill) } }
  const services = {
    workingDirectory: { ensure: async () => dir },
    agents: { list: () => [] },
    commands: commandsApi,
    skills: skillsApi,
  }
  const ctx = {
    get(name) { return services[name] },
    effect(fn) { return fn() },
    on() { return () => {} },
    provide(name) { provided.push(name) },
    tools: {
      register(definition, options) { registered.push({ definition, options }) },
      restrict() { return () => {} },
    },
  }
  return { ctx, registered, commands, skills, provided }
}

test('插件：默认关闭，/voice on 之后工具才可见，/voice off 又隐藏', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-plugin-'))
  const { ctx, registered, commands, skills, provided } = fakeContext(dir)
  await apply(ctx, {})

  assert.equal(registered.length, 9)
  assert.equal(commands.length, 1)
  assert.equal(commands[0].name, 'voice')
  assert.equal(skills.length, 1)
  assert.ok(provided.includes('novelVoice'))
  assert.equal(typeof ctx.novelVoice?.identity, 'function')
  assert.equal(ctx.novelVoice.identity().plugin, 'dsh-novel-voice')
  assert.ok(ctx.novelVoice.identity().capabilities.includes('voice.brief'))

  const agent = { id: 'agent-1' }
  const visible = () => registered.every(({ options }) => options.when({ agent }) === true)
  assert.equal(visible(), false, '默认应当是隐藏的')

  const on = await commands[0].handler({ agent, rawInput: 'on' })
  assert.equal(on.kind, 'success')
  assert.equal(visible(), true)

  const status = await commands[0].handler({ agent, rawInput: 'status' })
  assert.match(status.text, /开/)

  const off = await commands[0].handler({ agent, rawInput: 'off' })
  assert.equal(off.kind, 'success')
  assert.equal(visible(), false)

  const bad = await commands[0].handler({ agent, rawInput: 'wat' })
  assert.equal(bad.kind, 'error')
})

test('插件：skill 文案包含四步闭环与红线', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-plugin-'))
  const { ctx, skills } = fakeContext(dir)
  await apply(ctx, {})
  const skill = skills[0]
  assert.equal(skill.name, 'novel-voice')
  assert.match(skill.content, /voice_brief/)
  assert.match(skill.content, /voice_polish/)
  assert.match(skill.content, /不要.*补具体/s)
})

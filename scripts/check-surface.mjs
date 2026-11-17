// scripts/check-surface.mjs — 发布前的表面检查：文件、清单、工具数、命名、契约同步。

import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = path.resolve(import.meta.dirname, '..')
const read = (file) => fs.readFile(path.join(root, file), 'utf8')

const REQUIRED = [
  'package.json',
  'index.js',
  'client.js',
  'cordis.patch.yml',
  'icon.svg',
  'locale/zh.json',
  'locale/en.json',
  'lib/tools.js',
  'lib/remote.js',
  'lib/remote-contract.js',
  'lib/store.js',
  'lib/compiler.js',
  'lib/check.js',
  'lib/repair.js',
]
for (const file of REQUIRED) {
  await fs.access(path.join(root, file))
}

const pkg = JSON.parse(await read('package.json'))
assert.equal(pkg.name, 'dsh-novel-voice')
assert.equal(pkg.version, '0.1.0')
assert.equal(pkg.type, 'module')
assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-sidebar-right'))
assert.ok(pkg.exports['./remote'])

const locale = JSON.parse(await read('locale/zh.json'))
assert.equal(locale.meta.title, '创作风格')
assert.ok(locale.meta.description.length >= 60)

const client = await read('client.js')
assert.ok(client.includes("const TAB_TITLE = '创作风格'"))
assert.ok(client.includes('风格工作室'))
assert.ok(client.includes("id: 'dsh-novel-voice'"))
assert.ok(client.includes('sidebar.right.pane.tab'))
assert.ok(client.includes('conversation.session.header.utilities'))
assert.doesNotMatch(client, /文笔分|相似度|AI 味 \d+ 分/)

const { toolDefinitions } = await import('../lib/tools.js')
const tools = toolDefinitions()
assert.equal(tools.length, 7)
assert.deepEqual(tools.map((tool) => tool.name), [
  'voice_import', 'voice_learn', 'voice_profile', 'voice_brief', 'voice_check', 'voice_polish', 'voice_feedback',
])
for (const tool of tools) {
  assert.ok(tool.description.length >= 30, `${tool.name} 描述太短`)
  assert.equal(tool.parameters.type, 'object')
  assert.equal(typeof tool.execute, 'function')
}

const { DESCRIPTORS } = await import('../lib/remote-contract.js')
const remoteSource = await read('lib/remote.js')
for (const descriptor of DESCRIPTORS) {
  assert.equal(descriptor.namespace, 'voiceStudio')
  assert.ok(descriptor.id.startsWith('dsh-novel-voice#voiceStudio/'))
  assert.ok(remoteSource.includes(`${descriptor.method}: '${descriptor.method}'`), `remote.js 没有标记 ${descriptor.method}`)
}

const index = await read('index.js')
assert.ok(index.includes("name: 'voice'"))
assert.ok(index.includes('novelVoice'))
assert.ok(index.includes('novel-voice'))

console.log('check-surface: ok')
console.log(`  files ${REQUIRED.length}, tools ${tools.length}, remote ${DESCRIPTORS.length}`)

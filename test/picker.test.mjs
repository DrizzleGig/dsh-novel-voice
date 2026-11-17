import test from 'node:test'
import assert from 'node:assert/strict'
import { pickDirectory, pickerCapability } from '../lib/picker.js'

test('picker：native capability 的 pick 被调用并返回路径', async () => {
  let called = 0
  const picker = {
    capability: () => ({
      kind: 'native',
      pick: async () => {
        called += 1
        return 'C:/novels'
      },
    }),
  }
  assert.equal(pickerCapability(picker).kind, 'native')
  assert.equal(await pickDirectory(picker, new AbortController().signal), 'C:/novels')
  assert.equal(called, 1)
})

test('picker：取消返回 null，不抛错', async () => {
  const picker = { capability: () => ({ kind: 'native', pick: async () => null }) }
  assert.equal(await pickDirectory(picker), null)
})

test('picker：browse 后端给出可执行的替代路径', async () => {
  const picker = { capability: () => ({ kind: 'browse', list() {}, createDirectory() {} }) }
  await assert.rejects(() => pickDirectory(picker), (error) => {
    assert.equal(error.code, 'picker-browse')
    assert.match(error.message, /浏览器选择文件|输入路径/)
    return true
  })
})

test('picker：服务不存在时不假装成功', async () => {
  await assert.rejects(() => pickDirectory(undefined), (error) => {
    assert.equal(error.code, 'picker-unavailable')
    return true
  })
  const broken = { capability() { throw new Error('boom') } }
  assert.equal(pickerCapability(broken), null)
})

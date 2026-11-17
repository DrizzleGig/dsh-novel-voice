import test from 'node:test'
import assert from 'node:assert/strict'
import { createLlm, resolveRoute } from '../lib/llm.js'

function ctxOf({ llm, model } = {}) {
  return {
    get(name) {
      if (name === 'llm') return llm
      if (name === 'agentDefaultModel') return model
      return undefined
    },
  }
}

function streamOf(chunks) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

test('路由：显式配置优先', () => {
  const route = resolveRoute(ctxOf({ model: { currentSelection: () => ({ provider: 'a', model: 'a1' }) } }), { provider: 'b', model: 'b1' })
  assert.deepEqual(route, { provider: 'b', model: 'b1' })
})

test('路由：跟随会话默认模型，再退到 provider 列表', () => {
  assert.deepEqual(resolveRoute(ctxOf({ model: { currentSelection: () => ({ provider: 'deepseek', model: 'flash' }) } })), { provider: 'deepseek', model: 'flash' })
  const llm = { listProviders: () => [{ id: 'p1' }], listModels: () => [{ id: 'm1' }] }
  assert.deepEqual(resolveRoute(ctxOf({ llm })), { provider: 'p1', model: 'm1' })
  assert.equal(resolveRoute(ctxOf({})), null)
})

test('调用：把 text-delta 拼起来，忽略非文本块', async () => {
  const llm = {
    stream() {
      return streamOf([
        { type: 'block-start', index: 0, blockType: 'text' },
        { type: 'text-delta', index: 0, text: '他推开门，' },
        { type: 'text-delta', index: 0, text: '雪落下来。' },
        { type: 'finish', reason: { kind: 'stop' } },
      ])
    },
  }
  const run = createLlm(ctxOf({ llm, model: { currentSelection: () => ({ provider: 'p', model: 'm' }) } }))
  assert.equal(await run({ system: 's', user: 'u' }), '他推开门，雪落下来。')
})

test('调用：空输出与错误 finish 都变成可读失败', async () => {
  const empty = { stream: () => streamOf([{ type: 'finish', reason: { kind: 'stop' } }]) }
  await assert.rejects(
    () => createLlm(ctxOf({ llm: empty, model: { currentSelection: () => ({ provider: 'p', model: 'm' }) } }))({ system: 's', user: 'u' }),
    (error) => error.code === 'model-output-invalid',
  )

  const failed = {
    stream: () => streamOf([{ type: 'finish', reason: { kind: 'error', failure: { message: 'boom' } } }]),
  }
  await assert.rejects(
    () => createLlm(ctxOf({ llm: failed, model: { currentSelection: () => ({ provider: 'p', model: 'm' }) } }))({ system: 's', user: 'u' }),
    (error) => error.code === 'model-error' && /boom/.test(error.message),
  )
})

test('调用：没有 llm 服务时明确报 model-unavailable', async () => {
  await assert.rejects(
    () => createLlm(ctxOf({}))({ system: 's', user: 'u' }),
    (error) => error.code === 'model-unavailable' && /llm/.test(error.message),
  )
})

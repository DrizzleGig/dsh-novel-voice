// lib/llm.js — 插件对 DSH 模型服务的唯一入口：解析路由、流式收集文本。
// index.js（工具）与 remote.js（面板）共用，避免两套实现漂移。

import { fail } from './store.js'

export function resolveRoute(ctx, config = {}) {
  if (typeof config?.provider === 'string' && typeof config?.model === 'string') {
    return { provider: config.provider, model: config.model }
  }
  try {
    const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
    if (selection?.provider && selection?.model) return { provider: selection.provider, model: selection.model }
  } catch {
    // 没有默认模型服务
  }
  try {
    const llm = ctx.get('llm')
    const providers = llm?.listProviders?.() ?? []
    for (const provider of providers) {
      const models = llm?.listModels?.(provider.id) ?? []
      if (models.length) return { provider: provider.id, model: models[0].id }
    }
  } catch {
    // 没有 llm 服务
  }
  return null
}

export function createLlm(ctx, config = {}) {
  let cached = null
  return async ({ system, user, temperature = 0.4, maxTokens = 1200 }) => {
    const llm = ctx.get('llm')
    if (typeof llm?.stream !== 'function') fail('model-unavailable', '本机没有 llm 服务，无法调用模型。')
    const route = cached ?? resolveRoute(ctx, config)
    if (!route) fail('model-unavailable', '没有可用的 provider/model；先在设置里选一个默认模型。')
    cached = route
    const chunks = []
    let failure = null
    const stream = llm.stream({
      provider: route.provider,
      model: route.model,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
      temperature,
      maxTokens,
      reasoningEffort: config?.reasoningEffort ?? 'off',
      purpose: 'novel-voice',
    })
    for await (const chunk of stream) {
      const kind = chunk?.type ?? chunk?.kind
      if (kind === 'text-delta') {
        chunks.push(String(chunk.text ?? chunk.delta ?? ''))
        continue
      }
      if (kind !== 'finish') continue
      // DSH 的 finish.reason 是 {kind} 对象，不是字符串。
      const reason = chunk.reason
      const reasonKind = typeof reason === 'string' ? reason : reason?.kind
      if (reasonKind === 'error' || reasonKind === 'aborted') failure = reason?.failure ?? reasonKind
      else if (reasonKind === 'max-tokens') failure = reason
    }
    if (failure) {
      const detail = typeof failure === 'string' ? failure : (failure.message ?? JSON.stringify(failure))
      fail('model-error', `模型调用失败：${detail}`)
    }
    const text = chunks.join('').trim()
    if (!text) fail('model-output-invalid', '模型返回空文本。')
    return text
  }
}

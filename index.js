// dsh-novel-voice · 创作风格（入口名）/ 风格工作室（面板名）
// 独立运行：不 import beat / fade / fanfic，不读它们的运行时。

import { VERSION, PLUGIN_NAME, ROOT_DIR } from './lib/consts.js'
import { toolDefinitions } from './lib/tools.js'
import { getSessionMode, setSessionMode, readLibrary, readState, subscribeChanges } from './lib/store.js'
import { createLlm } from './lib/llm.js'
import { briefForProfile } from './lib/compiler.js'
import { listProfiles, loadProfile, summaryOf } from './lib/profile.js'
import { readWatchlist } from './lib/watchlist.js'
import { loadContract } from './lib/contract.js'

export const name = 'novel-voice'
export const inject = ['tools', 'commands']

const SKILL = {
  name: 'novel-voice',
  description: '创作风格：导入小说学写法，写前生成文风简报，写后把 AI 味定位到句子、只改那一句。默认关闭，作者说 /voice on 才启用。当作者要“学某本书的写法”“写出来别那么像 AI”“按我的文风写”时使用。',
  whenToUse: '要写/续写一章之前（先 voice_brief）、写完一节之后（voice_check，必要时 voice_polish）、导入参考作品或作者旧稿时。',
  source: 'runtime',
  content: [
    '# 创作风格（dsh-novel-voice）',
    '',
    '## 开关',
    '',
    '默认关闭。作者说 /voice on 之后 `voice_*` 工具才可用；没开就提示作者开。',
    '',
    '## 四步闭环（不要跳步）',
    '',
    '1. `voice_import`：导入参考作品（别人写的，学技法）与作者旧稿（sourceType=own，学“你的呼吸”）。先 `preview` 看分章，不对就 `fixChapters`。',
    '2. `voice_learn measure`：全本地统计，0 模型。`sample` 先看会发送什么，再决定 `analyze`（可选，花钱）。',
    '3. `voice_profile create` → `templates`/`apply`（local 模式用模板）或 `commit`（模型提取的卡）→ `confirm`。',
    '4. 写前 `voice_brief`；写后 `voice_check`；要改才 `voice_polish fix:true`；作者的意见用 `voice_feedback record` 记账。',
    '',
    '## 简报怎么用（硬规矩）',
    '',
    '- 简报是写前最后一次校准，不是正文摘要；写正文时把它当约束，不要抄简报里的句子。',
    '- 简报里【样段】是作者自己的旧作，只学语气，不要搬它的情节、人名、对话。',
    '- 【不要】那一行是禁语，命中就换写法，不要只删词。',
    '- 【硬约束】（视角/称呼/禁忌）永远优先于其他条目。',
    '',
    '## 检查与改写（硬规矩）',
    '',
    '- `voice_check` 只给线索，不给分：warn 逐条看，info 只是画像，block（20 字重合/契约禁忌）必须改。',
    '- `voice_polish` 默认只报不改；要改必须显式 fix:true。它只改命中窗口，窗口外不动；校验不过会回退并标 needs-author。',
    '- 不要“为参差而拆句”，不要“让模型补具体”，不要整章重写——这两件事比 AI 味更糟。',
    '- 改写后必须复检；新增命中、新增数字/人名、与参考作品 20 字重合，都算失败。',
    '',
    '## 汇报口径',
    '',
    '- 不说“文笔分”“作家相似度”“AI 味 43 分”；只说“这几处值得看”“这几处已改”“这条没过校验”。',
    '- 不承诺“保证检测器判不出”；只承诺“可定位、可回滚、未命中的地方没动”。',
  ].join('\n'),
}

/** 舞台监督是否已安装（装了它就是总开关，本插件自己的开关降级为「独立模式」的偏好）。 */
function conductorInstalled(ctx) {
  try {
    const conductor = ctx.get?.('novelConductor')
    return typeof conductor?.isDriving === 'function'
  } catch {
    return false
  }
}

/**
 * 本会话的实际生效状态：
 *   装了 conductor → 只看它接管没接管（beat 自己的按钮优先级更低，此时不生效）；
 *   没装 conductor → 看本插件自己的开关（独立模式，和以前完全一样）。
 */
function effectiveOn(ctx, manualOn, key) {
  if (!conductorInstalled(ctx)) return manualOn
  if (!key) return false
  try {
    return ctx.get('novelConductor').isDriving(key) === true
  } catch {
    return false
  }
}
function sessionKey(context) {
  return context?.agent?.id
    ?? context?.session?.agent?.id
    ?? context?.session?.id
    ?? context?.sessionId
    ?? null
}

const TOOL_NAMES = toolDefinitions().map((definition) => definition.name)

function serviceRoot(args = {}) {
  const root = args.cwd ?? args.dir
  if (typeof root !== 'string' || !root.trim()) {
    throw new Error('cwd 必须是工作区根目录的绝对路径')
  }
  return root
}

function buildService(ctx) {
  return {
    identity() {
      return {
        plugin: PLUGIN_NAME,
        version: VERSION,
        service_version: 1,
        capabilities: ['voice.brief', 'voice.status', 'voice.revision'],
        dir: ROOT_DIR,
        readOnly: true,
      }
    },

    async getStatus({ cwd, dir, book } = {}) {
      const root = serviceRoot({ cwd, dir })
      const library = await readLibrary(root, book)
      const profiles = await listProfiles(root, book)
      const profile = profiles.length ? await loadProfile(root, book, null) : null
      const state = await readState(root, book)
      const contract = await loadContract(root)
      return {
        book: book ?? null,
        works: library.works.length,
        profiles,
        profile: profile ? summaryOf(profile) : null,
        revision: state.revision,
        updatedAt: state.updatedAt,
        contract: { available: Boolean(contract.available), project: contract.project ?? null, count: (contract.forbidden ?? []).length },
      }
    },

    async getRevision({ cwd, dir, book } = {}) {
      const root = serviceRoot({ cwd, dir })
      const state = await readState(root, book)
      return { revision: state.revision, updatedAt: state.updatedAt, revisionDrift: false }
    },

    async getBrief({ cwd, dir, book, chapter, scene, cast, task, budget, sampleBudget, profileId } = {}) {
      const root = serviceRoot({ cwd, dir })
      const result = await briefForProfile(root, book, {
        chapter, scene, cast, task, budget, sampleBudget, profileId,
      })
      if (result?.ok === false) return result
      const state = await readState(root, book)
      return {
        ...result,
        tokens: result.tokensEstimate,
        revision: state.revision,
        generated_at: new Date().toISOString(),
      }
    },

    async getRules({ cwd, dir, book, profileId } = {}) {
      const root = serviceRoot({ cwd, dir })
      const profile = await loadProfile(root, book, profileId ?? null)
      return { ok: Boolean(profile), profile: profile ? summaryOf(profile) : null, rules: profile?.rules ?? [] }
    },

    async getWatchlist({ cwd, dir, book } = {}) {
      const root = serviceRoot({ cwd, dir })
      return readWatchlist(root, book)
    },

    onDidChange: subscribeChanges,
  }
}

export async function apply(ctx, config = {}) {
  const commands = ctx.get('commands')
  const workingDirectory = ctx.get('workingDirectory')
  const agents = ctx.get('agents')
  const modeCache = new Map()
  const restrictions = new Map()

  const dirFor = async (agent) => {
    if (!workingDirectory?.ensure) return null
    try {
      return await workingDirectory.ensure(agent)
    } catch {
      return null
    }
  }

  const applyAgentMode = async (agent) => {
    if (!agent?.id) return false
    const dir = await dirFor(agent)
    if (!dir) return false
    const { mode } = await getSessionMode(dir, agent.id)
    const on = effectiveOn(ctx, mode === 'on', agent.id)
    modeCache.set(agent.id, on)

    const previous = restrictions.get(agent.id)
    if (previous) {
      try {
        previous()
      } catch {
        // 旧的 restrict 已随 agent 作用域释放
      }
      restrictions.delete(agent.id)
    }
    if (!on) {
      const agentCtx = agent.ctx
      if (agentCtx?.tools?.restrict) {
        const install = () => agentCtx.tools.restrict({ deny: TOOL_NAMES })
        const dispose = typeof agentCtx.effect === 'function' ? agentCtx.effect(install) : install()
        restrictions.set(agent.id, dispose)
      }
    }
    return on
  }

  const deps = { llm: createLlm(ctx, config) }

  for (const definition of toolDefinitions(deps)) {
    ctx.effect(() => ctx.tools.register(definition, {
      when: (context) => effectiveOn(ctx, modeCache.get(sessionKey(context)) === true, sessionKey(context)),
    }))
  }

  if (commands?.register) {
    ctx.effect(() => commands.register({
      name: 'voice',
      description: '开关创作风格：/voice on、/voice off、/voice status',
      input: { hint: 'on | off | status' },
      handler: async (invocation) => {
        const raw = String(invocation?.rawInput ?? '').trim().replace(/^\/?voice\b/i, '').trim()
        const action = (raw.split(/\s+/)[0] || 'status').toLowerCase()
        const agent = invocation?.agent
        if (!agent?.id) return { kind: 'error', text: '拿不到当前会话，无法切换创作风格。' }
        const dir = await dirFor(agent)
        if (!dir) return { kind: 'error', text: '拿不到当前工作区，无法切换创作风格。' }

        if (action === 'status') {
          const on = await applyAgentMode(agent)
          return { kind: 'success', text: `创作风格：${on ? '开' : '关'}（/voice on 开，/voice off 关）` }
        }
        if (action !== 'on' && action !== 'off') {
          return { kind: 'error', text: '用法：/voice on | /voice off | /voice status' }
        }
        await setSessionMode(dir, agent.id, action)
        const on = await applyAgentMode(agent)
        return {
          kind: 'success',
          text: on
            ? '创作风格已开。写前先 voice_brief，写完 voice_check；要改传 fix:true。'
            : '创作风格已关。voice_* 工具已从本会话隐藏。',
        }
      },
    }))
  }

  const skills = ctx.get('skills')
  if (skills?.register) {
    ctx.effect(() => skills.register(SKILL))
  }

  try {
    const service = buildService(ctx)
    if (typeof ctx.provide === 'function') {
      ctx.provide('novelVoice')
      ctx.novelVoice = service
    }
  } catch {
    // 服务是可选能力：有人读就提供，没人读也不影响工具。
  }

  if (typeof ctx.on === 'function') {
    ctx.effect(() => ctx.on('agent/created', async ({ agent }) => {
      await applyAgentMode(agent)
    }))
    ctx.effect(() => ctx.on('novel-conductor/drive', async ({ agent }) => {
      if (agent?.id) await applyAgentMode(agent)
    }))
    ctx.effect(() => ctx.on('agent/disposed', ({ agent }) => {
      modeCache.delete(agent?.id)
      restrictions.delete(agent?.id)
    }))
  }

  if (agents?.list) {
    for (const agent of agents.list()) {
      await applyAgentMode(agent)
    }
  }

  ctx.effect(() => () => {
    for (const dispose of restrictions.values()) {
      try {
        dispose()
      } catch {
        // agent 作用域可能已经先释放
      }
    }
    restrictions.clear()
  })
}

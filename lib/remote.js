/**
 * Host half of the 创作风格 sidebar. The Client cannot read the workspace by
 * itself; it mounts this Typert remote instead. Reads resolve the Agent from the
 * session id and the book from the workspace; writes go through the same
 * modules the tools use, so the panel and the agent never disagree.
 */

import fs from 'node:fs/promises'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { SessionId } from '@deepseek-ai/dsh-session'
import { DESCRIPTORS } from './remote-contract.js'
import { LIMITS } from './consts.js'
import { bookSlug, defaultBook, getSessionMode, libraryChars, pathsFor, readLibrary, writeLibrary } from './store.js'
import { addRules, confirmProfile, createProfile, listProfiles, loadProfile, setRuleStatus, setWeights, summaryOf, templateRules } from './profile.js'
import { briefForProfile } from './compiler.js'
import { acceptCandidate, aggregateFeedback, pendingCandidates, readFeedback, rejectCandidate } from './feedback.js'
import { importTargets, importTexts } from './import.js'
import { analyzeWithModel, measureWork } from './learn.js'
import { createLlm } from './llm.js'
import { pickDirectory } from './picker.js'
import { addEntry } from './watchlist.js'
import { loadContract } from './contract.js'
import { bindRemoteMethods, runRemoteInitializers } from './typert-bind.js'

class VoiceStudioRemote extends TypertRemoteService {
  static inject = ['agents', 'commands', 'workingDirectory', 'typert']

  constructor(ctx) {
    super(ctx, 'voiceStudio')
    runRemoteInitializers(this)
    ctx.typert.register({
      package: 'dsh-novel-voice',
      face: 'host',
      schemas: [],
      model: { services: [], events: [], objects: [] },
      invocations: DESCRIPTORS,
    })
  }

  agent(id) {
    const agent = this.ctx.agents.get(SessionId(id))
    if (!agent) throw new Error('会话尚未加载或已关闭，请重新打开会话后重试。')
    return agent
  }

  async workspace(id) {
    const agent = this.agent(id)
    const dir = await this.ctx.workingDirectory.ensure(agent)
    return { agent, dir }
  }

  async status(id) {
    const { agent, dir } = await this.workspace(id)
    const { mode } = await getSessionMode(dir, agent.id)
    return { on: mode === 'on' }
  }

  async setMode(id, on) {
    if (typeof on !== 'boolean') throw new Error('on 必须是布尔值。')
    const agent = this.agent(id)
    const result = await this.ctx.commands.execute(agent, on ? '/voice on' : '/voice off', [], new AbortController().signal)
    if (!result) throw new Error('/voice 命令未注册，请重载后端。')
    if (result.result.kind !== 'success') throw new Error(result.result.text || '/voice 命令执行失败。')
    return { on }
  }

  async panel(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const library = await readLibrary(dir, book)
    const profiles = await listProfiles(dir, book)
    const profile = profiles.length ? await loadProfile(dir, book, options?.profileId ?? null) : null
    const pending = profiles.length ? await pendingCandidates(dir, book) : []
    const feedback = profiles.length ? await readFeedback(dir, book, 6) : []
    const contract = await loadContract(dir)
    return {
      ok: true,
      snapshotVersion: 1,
      exists: library.works.length > 0 || Boolean(profile),
      book,
      bookDir: pathsFor(dir, book).bookDir,
      capacity: {
        works: library.works.length,
        worksLimit: LIMITS.works,
        chars: libraryChars(library),
        charsLimit: LIMITS.libraryChars,
      },
      works: library.works.map((work) => ({
        workId: work.workId,
        title: work.title,
        sourceType: work.sourceType,
        chars: work.chars,
        chapters: work.chapters,
        status: work.status,
      })),
      profile: profile ? publicProfile(profile) : null,
      profiles,
      pending: pending.slice(0, 6).map((candidate) => ({
        id: candidate.id,
        kind: candidate.kind,
        text: candidate.text,
        scope: candidate.scope ?? {},
        supports: candidate.supports ?? 1,
      })),
      feedback: feedback.map((event) => ({ id: event.id, kind: event.kind, text: event.text, at: event.at })),
      contract: { available: Boolean(contract.available), project: contract.project ?? null, count: (contract.forbidden ?? []).length },
      limits: { briefChars: LIMITS.briefChars, sampleChars: LIMITS.sampleChars },
    }
  }

  async brief(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const brief = await briefForProfile(dir, book, {
      chapter: options?.chapter,
      scene: options?.scene,
      cast: options?.cast,
      budget: options?.budget,
      sampleBudget: options?.sampleBudget,
      profileId: options?.profileId,
    })
    return { ok: true, book, ...brief }
  }

  async saveWeights(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const profiles = await listProfiles(dir, book)
    if (!profiles.length) throw new Error('还没有档案。')
    const profile = await loadProfile(dir, book, options?.profileId ?? null)
    const saved = await setWeights(dir, book, profile.id, options?.blend ?? {})
    return { ok: true, profile: publicProfile(saved) }
  }

  async setRuleStatus(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const profiles = await listProfiles(dir, book)
    if (!profiles.length) throw new Error('还没有档案。')
    const profile = await loadProfile(dir, book, options?.profileId ?? null)
    const result = await setRuleStatus(dir, book, profile.id, String(options?.ruleId ?? ''), String(options?.status ?? 'confirmed'))
    return { ok: true, profile: publicProfile(await loadProfile(dir, book, profile.id)), rule: result.rule }
  }

  async addBan(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const phrase = String(options?.phrase ?? '').trim()
    if (!phrase) throw new Error('phrase 不能为空。')
    const result = await addEntry(dir, book, { phrase, tier: 'book', why: '作者在面板标黑' })
    return { ok: true, added: result.added, count: result.watchlist.entries.length }
  }

  async aggregate(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const result = await aggregateFeedback(dir, book)
    return { ok: true, pending: result.pending.length }
  }

  /** 面板里的导入入口：呼出宿主文件夹选择器，递归导入其中的 txt/md。 */
  async importFolder(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const picker = this.ctx.get?.('directoryPicker') ?? this.ctx.root?.get?.('directoryPicker')
    const picked = await pickDirectory(picker, new AbortController().signal)
    if (!picked) return { ok: true, cancelled: true }
    const result = await importTargets(dir, book, { folder: picked, sourceType: options?.sourceType })
    return { ok: true, cancelled: false, folder: picked, ...result }
  }

  /** 浏览器侧的兜底：客户端读文件文本，这里落盘。不依赖任何宿主选择器。 */
  async importTexts(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const files = Array.isArray(options?.files) ? options.files : []
    if (!files.length) throw new Error('没有收到文件。')
    const result = await importTexts(dir, book, files, { sourceType: options?.sourceType })
    return { ok: true, ...result }
  }

  /** 手动路径兜底：没有选择器、或想一次加一个文件时用。 */
  async importPath(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const target = String(options?.path ?? '').trim()
    if (!target) throw new Error('path 不能为空。')
    const result = await importTargets(dir, book, { path: target, sourceType: options?.sourceType })
    return { ok: true, ...result }
  }

  /** 从书架作品提取技法卡：调模型、引文逐个回查，写进档案时是 candidate，要作者在「学习」里确认。 */
  async extractTechniques(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const profiles = await listProfiles(dir, book)
    if (!profiles.length) throw new Error('还没有档案：先在「风格」里用模板建档案。')
    const profile = await loadProfile(dir, book, options?.profileId ?? null)
    const result = await analyzeWithModel({
      dir,
      book,
      workIds: options?.workIds,
      mode: options?.mode === 'deep' ? 'deep' : 'quick',
      llm: createLlm(this.ctx, {}),
    })
    const cards = result.accepted.map((card) => ({ ...card, status: 'candidate' }))
    const { added } = await addRules(dir, book, profile.id, cards)
    return {
      ok: true,
      samples: result.samples.length,
      accepted: cards.length,
      rejected: result.rejected.length,
      added: added.length,
      profile: publicProfile(await loadProfile(dir, book, profile.id)),
    }
  }

  /** 统计：导入之后跑一次（全本地、零模型）；面板导入成功后会自动调用。 */
  async measureWorks(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const library = await readLibrary(dir, book)
    const ids = Array.isArray(options?.workIds) && options.workIds.length
      ? options.workIds
      : library.works.filter((work) => work.status !== 'measured').map((work) => work.workId)
    const measured = []
    for (const workId of ids) {
      try {
        const result = await measureWork(dir, book, workId)
        measured.push({ workId, ok: true, chars: result.chars, scenes: result.scenes })
      } catch (error) {
        measured.push({ workId, ok: false, error: String(error?.message ?? error) })
      }
    }
    return { ok: true, measured }
  }

  /** 移除一本书：删本地作品目录 + 从书架索引里摘掉。档案不动（它可能引用了别的作品）。 */
  async removeWork(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const workId = String(options?.workId ?? '').trim()
    if (!workId) throw new Error('workId 不能为空。')
    const library = await readLibrary(dir, book)
    const found = library.works.find((work) => work.workId === workId)
    if (!found) throw new Error(`书架里没有 ${workId}。`)
    const removed = await fs.rm(pathsFor(dir, book).work(workId), { recursive: true, force: true }).then(() => true).catch(() => false)
    if (!removed) throw new Error('删除作品目录失败。')
    library.works = library.works.filter((work) => work.workId !== workId)
    await writeLibrary(dir, book, library)
    return { ok: true, removed: workId, title: found.title, works: library.works.length }
  }

  /** 一键：统计还没统计的作品 → 建档案 → 写入模板 → 确认。作者点一次就是确认一次。 */
  async createProfile(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const library = await readLibrary(dir, book)
    if (!library.works.length) throw new Error('书架还是空的：先导入参考作品或旧稿。')
    for (const work of library.works) {
      if (work.status !== 'measured') {
        try {
          await measureWork(dir, book, work.workId)
        } catch {
          // 单部失败不阻塞其余作品；建档案用的是已统计的部分。
        }
      }
    }
    const profile = await createProfile(dir, book, {
      name: options?.name ?? '我的叙事风格',
      cast: Array.isArray(options?.cast) ? options.cast : [],
    })
    await addRules(dir, book, profile.id, templateRules(null, { bands: profile.bands }))
    const confirmed = await confirmProfile(dir, book, profile.id)
    return { ok: true, profile: publicProfile(confirmed) }
  }

  async acceptCandidate(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const profiles = await listProfiles(dir, book)
    if (!profiles.length) throw new Error('还没有档案。')
    const profile = await loadProfile(dir, book, options?.profileId ?? null)
    const candidate = await acceptCandidate(dir, book, profile.id, String(options?.candidateId ?? ''))
    await addRules(dir, book, profile.id, [{
      layer: 'L3',
      title: candidate.text.slice(0, 20) || '来自反馈的规则',
      observation: candidate.text,
      instruction: candidate.text,
      scope: [candidate.scope?.scene].filter(Boolean),
      status: 'confirmed',
      evidence: [],
    }])
    return { ok: true, profile: publicProfile(await loadProfile(dir, book, profile.id)) }
  }

  async rejectCandidate(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    await rejectCandidate(dir, book, String(options?.candidateId ?? ''), String(options?.reason ?? ''))
    const pending = await pendingCandidates(dir, book)
    return { ok: true, pending: pending.length }
  }
}

bindRemoteMethods(VoiceStudioRemote, {
  status: 'status',
  setMode: 'setMode',
  panel: 'panel',
  brief: 'brief',
  saveWeights: 'saveWeights',
  setRuleStatus: 'setRuleStatus',
  addBan: 'addBan',
  aggregate: 'aggregate',
  acceptCandidate: 'acceptCandidate',
  rejectCandidate: 'rejectCandidate',
  importFolder: 'importFolder',
  importPath: 'importPath',
  importTexts: 'importTexts',
  extractTechniques: 'extractTechniques',
  measureWorks: 'measureWorks',
  removeWork: 'removeWork',
  createProfile: 'createProfile',
}, (method, name) => Remote(name))

function publicProfile(profile) {
  return {
    ...summaryOf(profile),
    sourceCount: (profile.sources ?? []).length,
    sources: (profile.sources ?? []).map((source) => ({ role: source.role, weight: source.weight, workId: source.workId })),
    identity: profile.identity ?? {},
    blend: profile.blend ?? {},
    modes: (profile.modes ?? []).map((mode) => ({ id: mode.id, name: mode.name, when: mode.when })),
    bands: profile.bands ?? {},
    rules: (profile.rules ?? []).map((rule) => ({
      id: rule.id,
      title: rule.title,
      instruction: rule.instruction,
      layer: rule.layer,
      status: rule.status,
      scope: rule.scope?.sceneTypes ?? [],
      evidence: (rule.supporting_evidence ?? []).length,
      evidenceItems: (rule.supporting_evidence ?? []).slice(0, 3).map((item) => ({
        chapter: item?.chapter ?? null,
        quote: String(item?.quote ?? '').slice(0, 60),
      })),
      counterexamples: (rule.contradicting_evidence ?? []).length,
      check: rule.check?.detector ?? null,
    })),
    anchors: (profile.anchors ?? []).map((anchor) => ({ scene: anchor.scene, text: anchor.text })),
    samples: (profile.samples ?? []).map((sample) => ({ scene: sample.scene, chars: (sample.text ?? '').length })),
    warnings: profile.provisional ? ['样本偏少，区间只表示方向。'] : [],
  }
}

export default VoiceStudioRemote

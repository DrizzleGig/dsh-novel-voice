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
import { bookSlug, defaultBook, getSessionMode, libraryChars, pathsFor, readLibrary, readState, sha256, writeLibrary } from './store.js'
import { addRules, confirmProfile, createProfile, listProfiles, loadProfile, readHistory, setRuleStatus, setWeights, summaryOf, templateRules } from './profile.js'
import { briefForProfile } from './compiler.js'
import { acceptCandidate, aggregateFeedback, pendingCandidates, readFeedback, rejectCandidate } from './feedback.js'
import { importTargets, importTexts, readWorkSource } from './import.js'
import { chapterBody } from './chapters.js'
import { analyzeWithModel, measureWork } from './learn.js'
import { createLlm } from './llm.js'
import { pickDirectory } from './picker.js'
import { addEntry } from './watchlist.js'
import { loadContract } from './contract.js'
import { mirrorText } from './mirror.js'
import { packSummaries, readPackConfig, setPackConfig } from './rules/index.js'
import { decidePersona, listPersonas, showPersona } from './personas.js'
import { decideRatings, listRatings, readReaderConfig, recordRating, setReaderOn } from './ratings.js'
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
    const contract = await loadContract(dir, { project: options?.project })
    const state = await readState(dir, book)
    const packConfig = await readPackConfig(dir, book)
    const packs = await packSummaries()
    const personas = await listPersonas(dir, book)
    const readerConfig = await readReaderConfig(dir, book)
    const reader = await listRatings(dir, book, { limit: 60 })
    const history = profile ? await readHistory(dir, book, profile.id) : []
    const evidenceCountByWork = new Map()
    for (const rule of profile?.rules ?? []) {
      for (const item of [...(rule.supporting_evidence ?? []), ...(rule.contradicting_evidence ?? [])]) {
        if (!item?.workId) continue
        evidenceCountByWork.set(item.workId, (evidenceCountByWork.get(item.workId) ?? 0) + 1)
      }
    }
    const totalChars = library.works.reduce((sum, work) => sum + (Number(work.chars) || 0), 0)
    const sources = library.works.map((work) => {
      const weight = (profile?.sources ?? []).find((source) => source.workId === work.workId)?.weight ?? null
      return {
        workId: work.workId,
        title: work.title,
        role: work.sourceType === 'own' ? 'own' : 'reference',
        chars: Number(work.chars) || 0,
        chapters: Number(work.chapters) || 0,
        weight,
        evidenceCount: evidenceCountByWork.get(work.workId) ?? 0,
        charShare: totalChars ? Number(((Number(work.chars) || 0) / totalChars).toFixed(3)) : 0,
      }
    })
    return {
      ok: true,
      snapshotVersion: 2,
      exists: library.works.length > 0 || Boolean(profile),
      book,
      bookDir: pathsFor(dir, book).bookDir,
      revision: state.revision,
      updatedAt: state.updatedAt,
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
      sources,
      history,
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
      packs,
      enabledPacks: packConfig.enabled,
      personas,
      reader: { enabled: readerConfig.on, ...reader },
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

  async setRulePacks(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const result = await setPackConfig(dir, book, options?.packs ?? [])
    return { ok: true, enabled: result.enabled }
  }

  async setPersonaStatus(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const persona = await decidePersona(
      dir,
      book,
      String(options?.personaId ?? ''),
      String(options?.status ?? ''),
      String(options?.reason ?? ''),
    )
    return { ok: true, persona: { personaId: persona.personaId, name: persona.name, status: persona.status, revision: persona.revision } }
  }

  async personaDetail(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const card = await showPersona(dir, book, String(options?.personaId ?? ''))
    return {
      ok: true,
      persona: {
        personaId: card.personaId,
        name: card.name,
        aliases: card.aliases ?? [],
        workId: card.workId,
        status: card.status,
        revision: card.revision,
        decisionReason: card.decisionReason ?? null,
        claims: (card.claims ?? []).map((claim) => ({
          id: claim.id,
          field: claim.field,
          text: claim.text,
          situation: claim.situation ?? null,
          confidence: claim.confidence ?? null,
          evidence: (claim.evidence ?? []).map((item) => ({
            chapter: item.chapter,
            channel: item.channel,
            quote: item.quote,
            quoteHash: item.quoteHash,
            start: item.start,
            end: item.end,
          })),
          counterEvidence: (claim.counterEvidence ?? []).map((item) => ({
            chapter: item.chapter,
            channel: item.channel,
            quote: item.quote,
            quoteHash: item.quoteHash,
          })),
        })),
      },
    }
  }

  async readerToggle(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const value = await setReaderOn(dir, book, options?.on === true, String(options?.reason ?? '面板开关'))
    return { ok: true, enabled: value.on }
  }

  async readerRecord(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const recorded = await recordRating(dir, book, {
      workId: options?.workId,
      chapter: options?.chapter,
      quote: options?.quote,
      start: options?.start,
      polarity: options?.polarity,
      strength: options?.strength,
      reader: options?.reader,
      tags: options?.tags,
      note: options?.note,
    })
    return { ok: true, recorded }
  }

  async readerDecide(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const ids = Array.isArray(options?.ids) ? options.ids : []
    const status = String(options?.status ?? 'confirmed')
    return { ok: true, ...(await decideRatings(dir, book, ids, status, String(options?.reason ?? ''))) }
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

  /** 只读对照：不写档案、不改正文、不返回任何分数。 */
  async mirror(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    return await mirrorText({
      dir,
      book,
      text: options?.text,
      options: {
        profileId: options?.profileId,
        scene: options?.scene,
        cast: options?.cast,
        textHash: options?.textHash,
        profileRevision: options?.profileRevision,
      },
    })
  }

  /** 选一章送进对照镜：只读作品正文，不写档案。 */
  async chapterText(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const workId = String(options?.workId ?? '').trim()
    const chapter = Number(options?.chapter ?? 1)
    if (!workId) throw new Error('先选一部作品。')
    if (!Number.isInteger(chapter) || chapter < 1) throw new Error('章号必须是正整数。')
    const library = await readLibrary(dir, book)
    const work = library.works.find((entry) => entry.workId === workId)
    if (!work) throw new Error(`书架里没有 ${workId}。`)
    const source = await readWorkSource(dir, book, workId)
    const text = chapterBody(source.text, source.chapters, chapter)
    const meta = source.chapters.find((entry) => entry.index === chapter)
    return {
      ok: true,
      workId,
      title: work.title,
      chapter,
      chapterTitle: meta?.title ?? `第 ${chapter} 章`,
      chapters: source.chapters.length,
      text,
    }
  }

  /** 回查一条证据的原文；只读，不修档案。 */
  async verifyEvidence(id, options = {}) {
    const { dir } = await this.workspace(id)
    const book = bookSlug(options?.book ?? defaultBook(dir))
    const workId = String(options?.workId ?? '').trim()
    const quote = String(options?.quote ?? '').trim()
    if (!workId) return { ok: true, found: false, reason: 'no-work-id' }
    if (!quote) return { ok: true, found: false, reason: 'no-quote' }
    const source = await readWorkSource(dir, book, workId)
    const found = source.text.includes(quote)
    const hash = sha256(quote)
    return {
      ok: true,
      found,
      stale: !found,
      workId,
      chapter: Number.isInteger(options?.chapter) ? options.chapter : null,
      hash,
      hashMatch: typeof options?.hash === 'string' ? options.hash === hash : null,
    }
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
  mirror: 'mirror',
  chapterText: 'chapterText',
  verifyEvidence: 'verifyEvidence',
  saveWeights: 'saveWeights',
  setRuleStatus: 'setRuleStatus',
  setRulePacks: 'setRulePacks',
  setPersonaStatus: 'setPersonaStatus',
  personaDetail: 'personaDetail',
  readerToggle: 'readerToggle',
  readerRecord: 'readerRecord',
  readerDecide: 'readerDecide',
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
    revision: Number.isInteger(profile.revision) ? profile.revision : null,
    parentRevision: Number.isInteger(profile.parentRevision) ? profile.parentRevision : null,
    action: profile.action ?? null,
    reason: profile.reason ?? null,
    at: profile.at ?? null,
    restoredFrom: profile.restoredFrom ?? null,
    sourceCount: (profile.sources ?? []).length,
    sources: (profile.sources ?? []).map((source) => ({ role: source.role, weight: source.weight, workId: source.workId })),
    identity: profile.identity ?? {},
    blend: profile.blend ?? {},
    characterStyles: (profile.characterStyles ?? []).map((item) => ({
      role: item.role,
      personaId: item.personaId,
      cast: item.cast ?? [],
      weight: item.weight ?? 1,
    })),
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
      evidenceItems: (rule.supporting_evidence ?? []).slice(0, 40).map((item) => ({
        workId: item?.workId ?? null,
        chapter: Number.isInteger(item?.chapter) ? item.chapter : null,
        start: Number.isInteger(item?.start) ? item.start : null,
        end: Number.isInteger(item?.end) ? item.end : null,
        hash: item?.hash ?? (item?.quote ? sha256(String(item.quote)) : null),
        quote: String(item?.quote ?? '').slice(0, 120),
        role: 'support',
      })),
      counterexamples: (rule.contradicting_evidence ?? []).length,
      counterEvidenceItems: (rule.contradicting_evidence ?? []).slice(0, 20).map((item) => ({
        workId: item?.workId ?? null,
        chapter: Number.isInteger(item?.chapter) ? item.chapter : null,
        quote: String(item?.quote ?? '').slice(0, 120),
        hash: item?.hash ?? (item?.quote ? sha256(String(item.quote)) : null),
        role: 'counter',
      })),
      check: rule.check?.detector ?? null,
    })),
    anchors: (profile.anchors ?? []).map((anchor) => ({ scene: anchor.scene, text: anchor.text, workId: anchor.workId ?? null, chapter: anchor.chapter ?? null })),
    samples: (profile.samples ?? []).map((sample) => ({ scene: sample.scene, chars: (sample.text ?? '').length })),
    warnings: profile.provisional ? ['样本偏少，区间只表示方向。'] : [],
  }
}

export default VoiceStudioRemote

// lib/compiler.js — Style Compiler：把档案编译成当前章节能直接用的写前简报。
// 纯函数优先；读盘只在 briefForProfile 一处。统计数字一律不进简报。

import { LIMITS } from './consts.js'
import { countChars, estimateTokens } from './text.js'
import { loadProfile } from './profile.js'
import { readWatchlist } from './watchlist.js'

const MODE_NAMES = { 'm-immersive': '沉浸', 'm-tight': '紧凑', 'm-restrained': '克制' }

function matchesScene(rule, scene) {
  const scopes = rule?.scope?.sceneTypes ?? []
  if (!scopes.length) return true
  if (!scene) return true
  return scopes.includes(scene)
}

function modeWeightFor(profile, scene, ruleId) {
  const weights = profile?.blend?.sceneWeights?.[scene] ?? profile?.blend?.global ?? {}
  let best = 0
  for (const mode of profile?.modes ?? []) {
    if (!Array.isArray(mode.ruleIds) || !mode.ruleIds.includes(ruleId)) continue
    best = Math.max(best, Number(weights[mode.id] ?? 0))
  }
  return best
}

function rankRules(profile, scene) {
  const rules = (profile?.rules ?? []).filter((rule) => rule.status === 'confirmed' && matchesScene(rule, scene))
  return rules
    .map((rule) => ({
      rule,
      score: (Number(rule.confidence) || 0.5) * 2
        + (matchesScene(rule, scene) && rule.scope?.sceneTypes?.length ? 1 : 0)
        + modeWeightFor(profile, scene, rule.id) * 2.5
        + (rule.layer === 'L2' && rule.check?.detector === 'rhythm' ? 1.5 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, LIMITS.maxRules)
    .map((item) => item.rule)
}

function maskNames(text, cast) {
  let out = String(text ?? '')
  for (const name of cast ?? []) {
    if (!name || name.length < 2) continue
    out = out.split(name).join('他')
  }
  return out
}

function pickModes(profile, scene) {
  const weights = profile?.blend?.sceneWeights?.[scene] ?? profile?.blend?.global ?? {}
  return Object.entries(weights)
    .filter(([, value]) => Number(value) > 0.15)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 2)
    .map(([id]) => MODE_NAMES[id] ?? id)
}

function pickAnchor(profile, scene) {
  const anchors = (profile?.anchors ?? []).filter((anchor) => anchor?.text)
  if (!anchors.length) return null
  return anchors.find((anchor) => anchor.scene === scene) ?? anchors[0]
}

function pickSample(profile, scene, cast) {
  const samples = (profile?.samples ?? []).filter((sample) => sample?.text)
  if (!samples.length) return null
  const found = samples.find((sample) => sample.scene === scene) ?? samples[0]
  return { ...found, text: maskNames(found.text, cast) }
}

function cutSample(text, max) {
  const body = String(text ?? '')
  if (countChars(body) <= max) return body
  let out = ''
  for (const sentence of body.split(/(?<=[。！？…])/)) {
    if (countChars(out + sentence) > max) break
    out += sentence
  }
  return out || body.slice(0, max)
}

export function buildBrief(profile, options = {}) {
  if (!profile) {
    return { ok: false, code: 'no-profile', message: '还没有档案；先导入作品并跑 voice_learn measure，再建档案。' }
  }
  const scene = String(options.scene ?? '').trim() || '日常过渡'
  const budget = Number(options.budget) > 0 ? Number(options.budget) : LIMITS.briefChars
  const sampleBudget = Number(options.sampleBudget) > 0 ? Number(options.sampleBudget) : LIMITS.sampleChars
  const cast = Array.isArray(options.cast) ? options.cast : []
  const rules = rankRules(profile, scene)
  const modes = pickModes(profile, scene)
  const anchor = pickAnchor(profile, scene)
  const sample = pickSample(profile, scene, cast)
  const hard = options.hardConstraints ?? {}

  const bans = []
  for (const item of hard.forbidden ?? []) if (bans.length < LIMITS.maxBans) bans.push(String(item))
  for (const item of profile.identity?.avoid ?? []) if (bans.length < LIMITS.maxBans) bans.push(String(item))
  for (const item of options.bans ?? []) if (bans.length < LIMITS.maxBans) bans.push(String(item))

  const lines = []
  lines.push(`# 创作风格简报｜第 ${options.chapter ?? '—'} 章 · ${scene}`)
  lines.push('')
  const summary = String(profile.identity?.summary ?? '').trim()
  lines.push(`【总则】${summary || '按这一版档案里确认的写法来；没确认的不要当规矩。'}`)
  if (modes.length) lines.push('')
  if (modes.length) lines.push(`【这一场】${scene}：偏${modes.join(' / ')}。${options.task ? `本章任务：${String(options.task).slice(0, 80)}` : ''}`.trim())
  if (rules.length) {
    lines.push('')
    lines.push('【写法】')
    rules.forEach((rule, index) => lines.push(`${index + 1}. ${rule.instruction || rule.rule || rule.title}`))
  }
  if (bans.length) {
    lines.push('')
    lines.push(`【不要】${bans.join(' / ')}`)
  }
  if (anchor) {
    lines.push('')
    lines.push(`【语感】「${anchor.text}」（参考·${scene}）`)
  }
  if (sample) {
    lines.push('')
    lines.push(`【样段】（你自己的旧作·${sample.scene}；学语气，不要搬情节）`)
    lines.push(cutSample(sample.text, sampleBudget))
  }
  const hardLines = []
  if (hard.pov) hardLines.push(`视角：${hard.pov}`)
  if (Array.isArray(hard.address) && hard.address.length) hardLines.push(`称呼：${hard.address.join('；')}`)
  if (Array.isArray(hard.forbidden) && hard.forbidden.length) hardLines.push(`禁忌：${hard.forbidden.join('、')}`)
  if (hardLines.length) {
    lines.push('')
    lines.push(`【硬约束】${hardLines.join('；')}`)
  }

  let markdown = lines.join('\n')

  // 预算裁剪：先删参考锚点，再从最后一条规则往前删，永不删硬约束。
  while (countChars(markdown) > budget) {
    const rows = markdown.split('\n')
    const anchorIndex = rows.findIndex((line) => line.startsWith('【语感】'))
    if (anchorIndex >= 0) {
      rows.splice(anchorIndex, 1)
      if (rows[anchorIndex - 1] === '') rows.splice(anchorIndex - 1, 1)
      markdown = rows.join('\n')
      continue
    }
    const writingIndex = rows.findIndex((line) => line.startsWith('【写法】'))
    if (writingIndex >= 0) {
      let lastRule = -1
      for (let i = writingIndex + 1; i < rows.length; i += 1) {
        if (/^\d+\. /.test(rows[i])) lastRule = i
        else if (rows[i].startsWith('【')) break
      }
      if (lastRule > writingIndex + 1) {
        rows.splice(lastRule, 1)
        markdown = rows.join('\n')
        continue
      }
    }
    break
  }

  const warnings = []
  if (!rules.length) warnings.push('档案里还没有 confirmed 技法卡：简报只有总则与禁语表。先用 voice_profile templates/apply 或 commit 让技法进档案。')
  if (profile.provisional) warnings.push('样本偏少（<3 万字），区间只表示方向，不当判据。')
  if (!sample) warnings.push('书架里没有作者旧稿（sourceType=own），所以没有样段；想“像你”而不只是“像你喜欢的写法”，先导入 3–5 万字自己的旧稿。')
  else if (sample.scene !== scene) warnings.push(`样段来自「${sample.scene}」，与本章「${scene}」不完全匹配；只学语气，不要搬它的场景。`)
  if (profile.status !== 'confirmed') warnings.push('这份档案还没确认（provisional），确认后再当长期规矩用。')

  const keptRuleCount = markdown.split('\n').filter((line) => /^\d+\. /.test(line)).length

  return {
    ok: true,
    markdown,
    warnings,
    chars: countChars(markdown),
    tokensEstimate: estimateTokens(countChars(markdown)),
    scene,
    modes,
    rules: rules.slice(0, keptRuleCount).map((rule) => rule.id),
    anchors: anchor ? 1 : 0,
    sample: sample ? countChars(sample.text) : 0,
    sources: {
      profileId: profile.id,
      profileVersion: profile.version,
      status: profile.status,
      provisional: profile.provisional,
    },
    conflicts: profile.conflicts ?? [],
  }
}

export async function briefForProfile(dir, book, options = {}) {
  const profile = await loadProfile(dir, book, options.profileId ?? null)
  if (!profile) return { ok: false, code: 'no-profile', message: '还没有档案；先导入作品并建档案。' }
  const watchlist = await readWatchlist(dir, book).catch(() => ({ entries: [] }))
  const bans = watchlist.entries
    .filter((entry) => entry.tier === 'default')
    .slice(0, LIMITS.maxBans)
    .map((entry) => entry.phrase)
  return buildBrief(profile, { ...options, bans: options.bans ?? bans })
}

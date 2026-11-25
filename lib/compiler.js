// lib/compiler.js — Style Compiler：把档案编译成当前章节能直接用的写前简报。
// 纯函数优先；读盘只在 briefForProfile 一处。统计数字一律不进简报。

import { LIMITS } from './consts.js'
import { countChars, estimateTokens } from './text.js'
import { loadProfile } from './profile.js'
import { readWatchlist } from './watchlist.js'
import { readerSignals } from './ratings.js'

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
  const ranked = rules
    .map((rule) => ({
      rule,
      score: (Number(rule.confidence) || 0.5) * 2
        + (matchesScene(rule, scene) && rule.scope?.sceneTypes?.length ? 1 : 0)
        + modeWeightFor(profile, scene, rule.id) * 2.5
        + (rule.layer === 'L2' && rule.check?.detector === 'rhythm' ? 1.5 : 0),
    }))
    .sort((a, b) => b.score - a.score)
  const seen = new Set()
  const unique = []
  for (const item of ranked) {
    const key = String(item.rule.instruction || item.rule.rule || item.rule.title || '').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(item.rule)
    if (unique.length >= LIMITS.maxRules) break
  }
  return unique
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
  const reader = options.reader?.available === true ? options.reader : null

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
  if (rules.length || reader) {
    lines.push('')
    lines.push('【写法】')
    let ruleNumber = 1
    if (reader) {
      const parts = []
      if (reader.likes?.length) {
        const liked = reader.likes.map((item) => item.tags?.[0] || String(item.quote ?? '').slice(0, 20)).filter(Boolean)
        if (liked.length) parts.push(`喜欢：${liked.slice(0, 3).join('、')}`)
      }
      if (reader.dislikes?.length) {
        const disliked = reader.dislikes.map((item) => item.tags?.[0] || String(item.quote ?? '').slice(0, 20)).filter(Boolean)
        if (disliked.length) parts.push(`不喜欢：${disliked.slice(0, 3).join('、')}`)
      }
      if (parts.length) {
        lines.push(`${ruleNumber}. 读者偏好（已确认 ${Number(reader.count) || 0} 条，仅建议）：${parts.join('；')}`)
        ruleNumber += 1
      }
    }
    rules.forEach((rule) => {
      lines.push(`${ruleNumber}. ${rule.instruction || rule.rule || rule.title}`)
      ruleNumber += 1
    })
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
  if (profile.stylometry?.values) {
    const value = profile.stylometry.values
    const pct = (ratio) => `${Math.round(Number(ratio ?? 0) * 100)}%`
    lines.push('')
    lines.push(`【指纹】句长均值 ${value.sentenceMean} 字 · 句长波动 ${value.sentenceCv} · 对白 ${pct(value.dialogueRatio)}`)
    lines.push(`标点：破折号 ${value.dashPer1k}/千字 · 省略号 ${value.ellipsisPer1k}/千字 · 问号 ${value.questionPer1k}/千字`)
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
    const fingerprintIndex = rows.findIndex((line) => line.startsWith('【指纹】'))
    if (fingerprintIndex >= 0) {
      const removable = rows[fingerprintIndex + 1]?.startsWith('标点：') ? 2 : 1
      rows.splice(fingerprintIndex, removable)
      if (rows[fingerprintIndex - 1] === '') rows.splice(fingerprintIndex - 1, 1)
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
  const readerKept = reader && markdown.includes('读者偏好') ? 1 : 0

  return {
    ok: true,
    markdown,
    warnings,
    chars: countChars(markdown),
    tokensEstimate: estimateTokens(countChars(markdown)),
    scene,
    modes,
    rules: rules.slice(0, Math.max(0, keptRuleCount - readerKept)).map((rule) => rule.id),
    reader: reader ? { count: reader.count, likes: reader.likes, dislikes: reader.dislikes } : null,
    anchors: anchor ? 1 : 0,
    sample: sample ? countChars(sample.text) : 0,
    sources: {
      profileId: profile.id,
      profileVersion: profile.version,
      status: profile.status,
      provisional: profile.provisional,
      reader: reader ? { count: reader.count, updatedAt: reader.updatedAt ?? null } : null,
      stylometry: profile.stylometry ? { samples: profile.stylometry.samples ?? 0 } : null,
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
  const reader = options.reader === false
    ? null
    : (options.reader ?? await readerSignals(dir, book, { chapter: options.chapter }).catch(() => null))
  return buildBrief(profile, { ...options, bans: options.bans ?? bans, reader })
}

// lib/watchlist.js — 三级禁语表：default（内置）/ book（本书）/ author（作者标黑）。

import { readJson, pathsFor, writeJson, fail } from './store.js'

const PHRASES = [
  ['眼中闪过一丝', '套话：情绪 + 身体反应公式'],
  ['眼底闪过一丝', '套话：情绪 + 身体反应公式'],
  ['嘴角勾起一抹', '套话：表情模板'],
  ['嘴角微微上扬', '套话：表情模板'],
  ['勾起一抹弧度', '套话：表情模板'],
  ['空气中弥漫着', '套话：环境填充'],
  ['空气仿佛凝固', '套话：环境反应公式'],
  ['心中五味杂陈', '套话：情绪四字格'],
  ['五味杂陈', '套话：情绪四字格'],
  ['心头一紧', '套话：身体反应公式'],
  ['心中一紧', '套话：身体反应公式'],
  ['倒吸一口凉气', '套话：身体反应公式'],
  ['瞳孔骤缩', '套话：身体反应公式'],
  ['脸色煞白', '套话：身体反应公式'],
  ['不寒而栗', '套话：成语替代具体反应'],
  ['后背发凉', '套话：身体反应公式'],
  ['骨节分明', '套话：外貌模板'],
  ['修长的手指', '套话：外貌模板'],
  ['薄唇轻启', '套话：外貌模板'],
  ['眸光微闪', '套话：眼睛模板'],
  ['一种说不出的', '套话：抽象情绪'],
  ['难以言喻', '套话：抽象情绪'],
  ['无法形容', '套话：抽象情绪'],
  ['说不清道不明', '套话：抽象情绪'],
  ['仿佛整个世界', '套话：拔高'],
  ['在这一刻', '套话：时间强调'],
  ['那一刻，他', '套话：时间强调 + 主语'],
  ['不知为何', '套话：模糊归因'],
  ['莫名地', '套话：模糊副词'],
  ['意味深长', '套话：表情解读'],
  ['若有所思', '套话：表情解读'],
  ['总而言之', '套话：总结腔'],
  ['由此可见', '套话：总结腔'],
  ['不禁让人', '套话：评论腔'],
  ['而这，只是开始', '套话：章末钩子模板'],
  ['他不知道的是', '套话：全知提示'],
  ['殊不知', '套话：全知提示'],
]

const PATTERNS = [
  ['不是[^。！？\\n]{1,25}而是', '否定-修正句：先否定再纠正，中文 AI 文本高频句式'],
  ['与其说[^。！？\\n]{1,25}不如说', '否定-修正句变体'],
  ['仿佛[^。！？\\n]{1,20}一般', '比喻模板'],
  ['像[^。！？\\n]{1,15}一样', '比喻模板'],
  ['一种[^。！？\\n]{1,12}的[^。！？\\n]{1,6}', '抽象名词堆叠（低置信）'],
]

export function defaultEntries() {
  return [
    ...PHRASES.map(([phrase, why]) => ({ phrase, tier: 'default', pattern: false, why })),
    ...PATTERNS.map(([phrase, why]) => ({ phrase, tier: 'default', pattern: true, why })),
  ]
}

export async function readWatchlist(dir, book) {
  const file = pathsFor(dir, book).watchlist
  const stored = await readJson(file, null)
  const bookEntries = Array.isArray(stored?.entries) ? stored.entries.filter((entry) => entry?.tier !== 'default') : []
  const disabled = new Set(Array.isArray(stored?.disabled) ? stored.disabled : [])
  const entries = [...defaultEntries(), ...bookEntries].filter((entry) => !disabled.has(entry.phrase) || entry.tier === 'default')
  return { schemaVersion: 1, defaultVersion: '2026-11', entries, disabled: [...disabled], updatedAt: stored?.updatedAt ?? null }
}

export async function addEntry(dir, book, { phrase, tier = 'book', why = '', ttl = null }) {
  const text = String(phrase ?? '').trim()
  if (!text) fail('bad-phrase', 'phrase 不能为空')
  if (text.length > 40) fail('bad-phrase', 'phrase 最长 40 字')
  const file = pathsFor(dir, book).watchlist
  const stored = await readJson(file, { entries: [], disabled: [] })
  const entries = Array.isArray(stored.entries) ? stored.entries : []
  if (entries.some((entry) => entry.phrase === text && entry.tier === tier)) {
    return { added: false, watchlist: await readWatchlist(dir, book) }
  }
  entries.push({ phrase: text, tier, why: String(why ?? '').slice(0, 80), ttl, addedAt: new Date().toISOString() })
  await writeJson(file, { schemaVersion: 1, defaultVersion: '2026-11', entries, disabled: stored.disabled ?? [] })
  return { added: true, watchlist: await readWatchlist(dir, book) }
}

export async function removeEntry(dir, book, phrase) {
  const file = pathsFor(dir, book).watchlist
  const stored = await readJson(file, { entries: [], disabled: [] })
  const entries = (stored.entries ?? []).filter((entry) => entry.phrase !== phrase)
  await writeJson(file, { schemaVersion: 1, defaultVersion: '2026-11', entries, disabled: stored.disabled ?? [] })
  return { removed: true, watchlist: await readWatchlist(dir, book) }
}

export function compileEntry(entry) {
  if (!entry?.pattern) return null
  try {
    return new RegExp(entry.phrase, 'g')
  } catch {
    return null
  }
}

/** 命中：返回 [{ entry, start, end, quote }]，同一位置只留最长的一条。 */
export function matchWatchlist(text, entries) {
  const found = []
  const seen = new Set()
  for (const entry of entries ?? []) {
    if (entry?.pattern) {
      const re = compileEntry(entry)
      if (!re) continue
      let match
      while ((match = re.exec(text))) {
        const key = `${match.index}:${match[0].length}`
        if (!seen.has(key)) {
          seen.add(key)
          found.push({ entry, start: match.index, end: match.index + match[0].length, quote: match[0] })
        }
        if (match.index === re.lastIndex) re.lastIndex += 1
      }
      continue
    }
    const needle = String(entry?.phrase ?? '')
    if (!needle) continue
    let from = 0
    for (;;) {
      const index = text.indexOf(needle, from)
      if (index < 0) break
      const key = `${index}:${needle.length}`
      if (!seen.has(key)) {
        seen.add(key)
        found.push({ entry, start: index, end: index + needle.length, quote: needle })
      }
      from = index + 1
    }
  }
  return found.sort((a, b) => a.start - b.start || b.end - a.end)
}

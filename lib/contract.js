// lib/contract.js — 可选：读同人插件的契约（只读、保守）。没有契约就明确说"不可用"。

import path from 'node:path'
import fs from 'node:fs/promises'
import { readJson } from './store.js'

const KEYS = new Set(['forbidden', 'banned', 'bans', '禁忌', 'forbiddenPhrases'])

function collect(node, depth = 0) {
  if (depth > 6 || !node || typeof node !== 'object') return []
  const out = []
  if (Array.isArray(node)) {
    for (const item of node) {
      if (typeof item === 'string' && item.trim().length >= 2 && item.length <= 30) out.push(item.trim())
      else out.push(...collect(item, depth + 1))
    }
    return out
  }
  for (const [key, value] of Object.entries(node)) {
    if (KEYS.has(key) && Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.trim().length >= 2 && item.length <= 30) out.push(item.trim())
      }
      continue
    }
    out.push(...collect(value, depth + 1))
  }
  return out
}

export async function loadContract(dir, options = {}) {
  const base = path.join(path.resolve(String(dir)), '.dsh-novel-fanfic')
  let projects = []
  try {
    projects = (await fs.readdir(base, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return { available: false, reason: 'no-fanfic', forbidden: [] }
  }
  if (!projects.length) return { available: false, reason: 'no-project', forbidden: [] }
  const project = options.project && projects.includes(options.project) ? options.project : projects[0]
  const file = path.join(base, project, 'book.json')
  const book = await readJson(file, null)
  if (!book) return { available: false, reason: 'no-book-json', project, forbidden: [] }
  const forbidden = [...new Set(collect(book))].slice(0, 30)
  return {
    available: forbidden.length > 0,
    project,
    forbidden,
    source: path.relative(path.resolve(String(dir)), file),
  }
}

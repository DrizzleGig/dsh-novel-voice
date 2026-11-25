// lib/rules/index.js — 规则包加载与每本书的启用配置（默认关）。
// 规则包是内置 JSON；作者通过 voice_profile action=packs/set-packs 开关。

import fs from 'node:fs/promises'
import path from 'node:path'
import { audit, fail, pathsFor, readJson, writeJson } from '../store.js'

const PACK_DIR = path.join(import.meta.dirname, 'packs')
let cache = null

export function validatePack(pack, file) {
  if (!pack || typeof pack.id !== 'string' || !pack.id) fail('bad-pack', `${file} 缺 id`)
  if (!Array.isArray(pack.rules) || !pack.rules.length) fail('bad-pack', `${pack.id} 没有 rules`)
  if (!pack.license) fail('bad-pack', `${pack.id} 缺 license`)
  if (!pack.source?.url) fail('bad-pack', `${pack.id} 缺 source.url`)
  const ids = new Set()
  for (const rule of pack.rules) {
    if (!rule || typeof rule.id !== 'string' || !rule.id) fail('bad-pack', `${pack.id} 有规则缺 id`)
    if (ids.has(rule.id)) fail('bad-pack', `${pack.id} 规则 id 重复：${rule.id}`)
    ids.add(rule.id)
    const kind = rule.match?.kind
    if (!['phrase', 'regex', 'metric'].includes(kind)) fail('bad-pack', `${pack.id}/${rule.id} match.kind 不支持`)
    if ((kind === 'phrase' || kind === 'regex') && !rule.match.pattern) fail('bad-pack', `${pack.id}/${rule.id} 缺 pattern`)
    if (kind === 'regex') {
      const flags = String(rule.match.flags ?? 'u')
      try {
        new RegExp(String(rule.match.pattern), flags.includes('g') ? flags : `${flags}g`) // eslint-disable-line no-new
      } catch (error) {
        fail('bad-pack', `${pack.id}/${rule.id} regex 不合法：${error.message}`)
      }
    }
    if (kind === 'metric' && (!rule.match.metric || !Number.isFinite(Number(rule.match.value)))) {
      fail('bad-pack', `${pack.id}/${rule.id} metric 规则缺 metric/value`)
    }
  }
  return pack
}

export async function listPacks() {
  if (cache) return cache
  const files = (await fs.readdir(PACK_DIR)).filter((file) => file.endsWith('.json')).sort()
  const packs = []
  for (const file of files) {
    const value = JSON.parse(await fs.readFile(path.join(PACK_DIR, file), 'utf8'))
    packs.push(validatePack(value, file))
  }
  cache = packs
  return packs
}

export function clearPackCache() {
  cache = null
}

export async function getPack(id) {
  return (await listPacks()).find((pack) => pack.id === id) ?? null
}

export async function packSummaries() {
  return (await listPacks()).map((pack) => ({
    id: pack.id,
    title: pack.title ?? pack.id,
    version: pack.version ?? null,
    license: pack.license,
    source: pack.source ?? null,
    ruleCount: pack.rules.length,
    defaultEnabled: pack.defaultEnabled === true,
  }))
}

export async function readPackConfig(dir, book) {
  const value = await readJson(pathsFor(dir, book).rules, null)
  const enabled = Array.isArray(value?.enabled)
    ? value.enabled.filter((id) => typeof id === 'string')
    : []
  return { enabled, updatedAt: value?.updatedAt ?? null }
}

export async function setPackConfig(dir, book, ids = []) {
  const packs = await listPacks()
  const known = new Set(packs.map((pack) => pack.id))
  const enabled = []
  for (const id of Array.isArray(ids) ? ids : []) {
    const value = String(id ?? '').trim()
    if (!value) continue
    if (!known.has(value)) fail('bad-pack', `没有规则包 ${value}`)
    if (!enabled.includes(value)) enabled.push(value)
  }
  const value = { enabled, updatedAt: new Date().toISOString() }
  await writeJson(pathsFor(dir, book).rules, value)
  await audit(dir, book, { kind: 'rule-packs', enabled })
  return value
}

/** 解析本次要跑的包：显式传入优先，否则读本书配置；默认空。 */
export async function resolvePacks(dir, book, requested = null) {
  const packs = await listPacks()
  const ids = Array.isArray(requested) ? requested : (await readPackConfig(dir, book)).enabled
  const wanted = new Set(ids)
  return packs.filter((pack) => wanted.has(pack.id))
}

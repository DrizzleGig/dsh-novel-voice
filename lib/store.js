// lib/store.js — 路径、原子写、审计、会话开关。插件里所有磁盘 IO 都从这里走。

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { ROOT_DIR } from './consts.js'

export function fail(code, message) {
  const error = new Error(message)
  error.code = code
  throw error
}

export function bookSlug(book) {
  const raw = String(book ?? '').trim()
  const cleaned = raw
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 48)
  return cleaned || 'default'
}

export function defaultBook(dir) {
  const base = path.basename(path.resolve(String(dir ?? process.cwd())))
  return bookSlug(base)
}

export function rootOf(dir) {
  return path.join(path.resolve(String(dir ?? process.cwd())), ROOT_DIR)
}

export function bookDirOf(dir, book) {
  return path.join(rootOf(dir), bookSlug(book))
}

export function pathsFor(dir, book) {
  const root = rootOf(dir)
  const bookDir = path.join(root, bookSlug(book))
  return {
    root,
    bookDir,
    library: path.join(bookDir, 'library.json'),
    works: path.join(bookDir, 'works'),
    work: (workId) => path.join(bookDir, 'works', workId),
    profiles: path.join(bookDir, 'profiles'),
    profile: (profileId) => path.join(bookDir, 'profiles', profileId),
    watchlist: path.join(bookDir, 'watchlist.json'),
    audit: path.join(bookDir, 'audit.jsonl'),
    sessions: path.join(root, '_sessions.json'),
    state: path.join(bookDir, 'state.json'),
  }
}

export async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true })
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    if (error instanceof SyntaxError) fail('bad-json', `${path.basename(file)} 不是合法 JSON，已停止读取。`)
    throw error
  }
}

export async function writeJson(file, value) {
  await ensureDir(path.dirname(file))
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await fs.rename(tmp, file)
}

export async function appendJsonl(file, value) {
  await ensureDir(path.dirname(file))
  await fs.appendFile(file, `${JSON.stringify(value)}\n`, 'utf8')
}

export function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

export async function audit(dir, book, event) {
  try {
    await appendJsonl(pathsFor(dir, book).audit, { at: new Date().toISOString(), ...event })
  } catch {
    // 审计失败不能打断创作动作。
  }
}

/** 账本 revision 的单一写入口；旧数据按 audit.jsonl 行数兜底，不写盘。 */
const CHANGE_KEY = Symbol.for('dsh-novel-voice.changes')

function changeListeners() {
  let set = globalThis[CHANGE_KEY]
  if (!(set instanceof Set)) {
    set = new Set()
    globalThis[CHANGE_KEY] = set
  }
  return set
}

export function subscribeChanges(listener) {
  if (typeof listener !== 'function') return () => {}
  const set = changeListeners()
  set.add(listener)
  return () => set.delete(listener)
}

export function publishChange(event) {
  for (const listener of [...changeListeners()]) {
    try {
      Promise.resolve(listener(Object.freeze({ ...event }))).catch(() => {})
    } catch {
      // 订阅者异常不能影响已经落盘的写。
    }
  }
}

export async function countAudit(dir, book) {
  try {
    const text = await fs.readFile(pathsFor(dir, book).audit, 'utf8')
    return text.split('\n').filter((line) => line.trim()).length
  } catch (error) {
    if (error?.code === 'ENOENT') return 0
    throw error
  }
}

export async function readState(dir, book) {
  const state = await readJson(pathsFor(dir, book).state, null)
  if (state && Number.isInteger(state.revision) && state.revision >= 0) {
    return {
      schemaVersion: Number(state.schemaVersion) || 1,
      revision: state.revision,
      updatedAt: state.updatedAt ?? null,
      legacy: false,
    }
  }
  return {
    schemaVersion: 1,
    revision: await countAudit(dir, book),
    updatedAt: null,
    legacy: true,
  }
}

export async function bumpRevision(dir, book, meta = {}) {
  const current = await readState(dir, book)
  const revision = Math.max(0, Number(current.revision) || 0) + 1
  const updatedAt = new Date().toISOString()
  await writeJson(pathsFor(dir, book).state, {
    schemaVersion: 1,
    revision,
    updatedAt,
  })
  publishChange({
    book: bookSlug(book),
    revision,
    at: updatedAt,
    kind: String(meta.kind ?? 'write'),
  })
  return { revision, updatedAt }
}

export async function readSessions(dir) {
  const file = pathsFor(dir, 'x').sessions
  const value = await readJson(file, {})
  return value && typeof value === 'object' ? value : {}
}

export async function getSessionMode(dir, agentId) {
  const sessions = await readSessions(dir)
  return { mode: sessions[agentId] === 'on' ? 'on' : 'off' }
}

export async function setSessionMode(dir, agentId, mode) {
  const file = pathsFor(dir, 'x').sessions
  const sessions = await readSessions(dir)
  if (mode === 'on') sessions[agentId] = 'on'
  else delete sessions[agentId]
  await writeJson(file, sessions)
}

export async function readLibrary(dir, book) {
  const { library } = pathsFor(dir, book)
  const value = await readJson(library, null)
  if (!value || !Array.isArray(value.works)) return { schemaVersion: 1, book: bookSlug(book), works: [] }
  return value
}

export async function writeLibrary(dir, book, library) {
  const { library: file } = pathsFor(dir, book)
  await writeJson(file, { schemaVersion: 1, book: bookSlug(book), updatedAt: new Date().toISOString(), ...library })
}

export function libraryChars(library) {
  return (library.works ?? []).reduce((sum, work) => sum + (Number(work.chars) || 0), 0)
}

export async function fileInfo(target) {
  const stat = await fs.stat(target)
  return { bytes: stat.size, mtimeMs: stat.mtimeMs }
}

export async function listFiles(target) {
  const stat = await fs.stat(target)
  if (stat.isFile()) return [target]
  const entries = await fs.readdir(target, { withFileTypes: true })
  const out = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(target, entry.name)
    if (entry.isDirectory()) out.push(...await listFiles(full))
    else if (/\.(txt|md|markdown)$/i.test(entry.name)) out.push(full)
  }
  return out.sort()
}

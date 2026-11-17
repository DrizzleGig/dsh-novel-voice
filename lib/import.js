// lib/import.js — 编码探测、去重、分章、写入书架。模型不参与。

import fs from 'node:fs/promises'
import path from 'node:path'
import { LIMITS } from './consts.js'
import { chapterBody, splitChapters } from './chapters.js'
import { countChars, normalizeText, round } from './text.js'
import {
  bookDirOf, ensureDir, fail, libraryChars, listFiles, pathsFor, readLibrary,
  sha256, writeJson, writeLibrary,
} from './store.js'

export function decodeBuffer(buf) {
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return { text: buf.subarray(3).toString('utf8'), encoding: 'utf-8' }
  }
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    return { text: new TextDecoder('utf-16le').decode(buf.subarray(2)), encoding: 'utf-16le' }
  }
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    return { text: new TextDecoder('utf-16be').decode(buf.subarray(2)), encoding: 'utf-16be' }
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'utf-8' }
  } catch {
    // continue
  }
  try {
    return { text: new TextDecoder('gb18030', { fatal: true }).decode(buf), encoding: 'gb18030' }
  } catch {
    // continue
  }
  return { text: new TextDecoder('utf-8').decode(buf), encoding: 'utf-8-lossy' }
}

export async function resolveTargets(options) {
  const list = []
  const push = async (target) => {
    const stat = await fs.stat(target)
    if (stat.isDirectory()) list.push(...await listFiles(target))
    else list.push(target)
  }
  if (Array.isArray(options?.paths)) {
    for (const item of options.paths) {
      if (typeof item === 'string' && item.trim()) await push(path.resolve(item))
    }
  }
  if (typeof options?.folder === 'string' && options.folder.trim()) await push(path.resolve(options.folder))
  if (typeof options?.path === 'string' && options.path.trim()) await push(path.resolve(options.path))
  return [...new Set(list)]
}

function capacityOf(library) {
  return {
    works: library.works.length,
    worksLimit: LIMITS.works,
    chars: libraryChars(library),
    charsLimit: LIMITS.libraryChars,
  }
}

/** 已经解码好的正文：去重、容量、分章、落盘。导入文件与浏览器上传共用这一段。 */
export async function storeImportedText(dir, book, input = {}) {
  const text = normalizeText(input.text)
  const chars = countChars(text)
  const name = String(input.name ?? '未命名').slice(0, 160)
  if (chars < 200) fail('too-short', `${name} 只有 ${chars} 字，疑似不是正文。`)
  const replacement = (text.match(/\uFFFD/g) ?? []).length
  if (replacement > Math.max(5, chars * 0.002)) {
    fail('mojibake', `${name} 里有 ${replacement} 个乱码字符（U+FFFD），编码可能不是 UTF-8。请用「选文件夹」让主机按 GB18030 读取，或先转成 UTF-8。`)
  }

  const library = await readLibrary(dir, book)
  const hash = sha256(text)
  const duplicate = library.works.find((work) => work.hash === hash)
  if (duplicate) return { skipped: true, reason: 'duplicate', work: duplicate }

  const existingWorks = library.works.length
  if (existingWorks >= LIMITS.works) {
    fail('too-many-works', `书架已有 ${existingWorks} 部，上限 ${LIMITS.works} 部。先移除一部再加。`)
  }
  const totalChars = libraryChars(library)
  if (totalChars + chars > LIMITS.libraryChars) {
    fail('over-capacity', `书架容量 ${LIMITS.libraryChars / 10000} 万字，再加这部会超出。先移除旧作品。`)
  }

  const workId = `w-${hash.slice(0, 8)}`
  const workDir = pathsFor(dir, book).work(workId)
  await ensureDir(workDir)

  const chapters = splitChapters(text)
  const title = String(input.title ?? '').trim() || path.basename(name, path.extname(name))
  const sourceType = input.sourceType === 'own' ? 'own' : 'reference'

  await writeJson(path.join(workDir, 'meta.json'), {
    schemaVersion: 1,
    workId,
    title,
    sourceType,
    chars,
    chapters: chapters.length,
    hash,
    encoding: input.encoding ?? 'utf-8',
    bytes: Number(input.bytes) || Buffer.byteLength(text, 'utf8'),
    file: input.file ?? null,
    importedAt: new Date().toISOString(),
  })
  await writeJson(path.join(workDir, 'chapters.json'), { schemaVersion: 1, workId, chapters })
  if (input.keepSource !== false) {
    await fs.writeFile(path.join(workDir, 'source.txt'), text, 'utf8')
  }

  const work = {
    workId,
    title,
    sourceType,
    chars,
    chapters: chapters.length,
    hash,
    encoding: input.encoding ?? 'utf-8',
    status: 'imported',
    addedAt: new Date().toISOString(),
  }
  library.works.push(work)
  await writeLibrary(dir, book, library)

  return { skipped: false, work, text, chapters }
}

export async function importFile(dir, book, file, options = {}) {
  const stat = await fs.stat(file)
  if (stat.size > LIMITS.fileBytes) {
    fail('too-large', `${path.basename(file)} 有 ${round(stat.size / 1024 / 1024, 1)} MB，超过单文件 ${LIMITS.fileBytes / 1024 / 1024} MB 上限。`)
  }
  const buf = await fs.readFile(file)
  const { text, encoding } = decodeBuffer(buf)
  return await storeImportedText(dir, book, {
    text,
    name: path.basename(file),
    title: options.title,
    sourceType: options.sourceType,
    encoding,
    bytes: stat.size,
    file,
    keepSource: options.keepSource,
  })
}

export async function importTargets(dir, book, options = {}) {
  const targets = await resolveTargets(options)
  if (!targets.length) fail('no-target', '没有找到可导入的 txt / md 文件。')
  const imported = []
  const skipped = []
  for (const target of targets) {
    const result = await importFile(dir, book, target, {
      ...options,
      title: targets.length > 1 ? '' : options.title,
    })
    if (result.skipped) skipped.push({ file: target, reason: result.reason, workId: result.work?.workId })
    else imported.push(result.work)
  }
  const library = await readLibrary(dir, book)
  return { imported, skipped, capacity: { ...capacityOf(library), bookDir: bookDirOf(dir, book) } }
}

/** 浏览器上传：客户端可以送文本（UTF-8），也可以送 base64 原始字节（走主机编码探测）。 */
export async function importTexts(dir, book, files, options = {}) {
  const list = Array.isArray(files) ? files : []
  if (!list.length) fail('no-target', '没有收到文件。')
  const imported = []
  const skipped = []
  for (const file of list) {
    const name = String(file?.name ?? '未命名.txt').slice(0, 160)
    let text = String(file?.text ?? '')
    let encoding = 'utf-8'
    let bytes = Buffer.byteLength(text, 'utf8')
    if (!text.trim() && typeof file?.base64 === 'string' && file.base64) {
      let buffer
      try {
        buffer = Buffer.from(file.base64, 'base64')
      } catch {
        skipped.push({ file: name, reason: 'empty' })
        continue
      }
      if (buffer.length > LIMITS.fileBytes) {
        skipped.push({ file: name, reason: 'too-large' })
        continue
      }
      const decoded = decodeBuffer(buffer)
      text = decoded.text
      encoding = decoded.encoding
      bytes = buffer.length
    }
    if (!text.trim()) {
      skipped.push({ file: name, reason: 'empty' })
      continue
    }
    if (bytes > LIMITS.fileBytes) {
      skipped.push({ file: name, reason: 'too-large' })
      continue
    }
    try {
      const result = await storeImportedText(dir, book, {
        text,
        name,
        title: list.length > 1 ? '' : (options.title ?? ''),
        sourceType: options.sourceType,
        encoding,
        bytes,
        file: null,
        keepSource: options.keepSource,
      })
      if (result.skipped) skipped.push({ file: name, reason: result.reason, workId: result.work?.workId })
      else imported.push(result.work)
    } catch (error) {
      skipped.push({ file: name, reason: error?.code ?? 'failed', message: String(error?.message ?? error) })
    }
  }
  const library = await readLibrary(dir, book)
  return { imported, skipped, capacity: { ...capacityOf(library), bookDir: bookDirOf(dir, book) } }
}

export async function readWorkSource(dir, book, workId) {
  const workDir = pathsFor(dir, book).work(workId)
  const meta = await fs.readFile(path.join(workDir, 'meta.json'), 'utf8').then(JSON.parse)
  try {
    const text = await fs.readFile(path.join(workDir, 'source.txt'), 'utf8')
    return { meta, text, chapters: (await fs.readFile(path.join(workDir, 'chapters.json'), 'utf8').then(JSON.parse)).chapters }
  } catch {
    if (meta?.file) {
      const buf = await fs.readFile(meta.file)
      const { text } = decodeBuffer(buf)
      const normalized = normalizeText(text)
      return { meta, text: normalized, chapters: splitChapters(normalized) }
    }
    fail('no-source', `作品 ${workId} 没有本地源文，也没有可回读的原始路径。`)
  }
}

export function workChapterText(source, chapter) {
  return chapterBody(source.text, source.chapters, chapter)
}

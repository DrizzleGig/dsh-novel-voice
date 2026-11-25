// scripts/check-licenses.mjs — 第三方来源/许可审计：不联网，CI 与本地一致。
// - manifest 里每个 vendored 文件必须有许可、来源、固定 sha256；
// - GPL/AGPL/UNLICENSED/NOASSERTION 不能作为 vendored/planned 采用；
// - Apache-2.0 vendored 项必须有 LICENSES/<name>/NOTICE；
// - 发布包 files 必须包含 THIRD_PARTY_NOTICES.md、LICENSES/、vendor/。

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const root = path.resolve(import.meta.dirname, '..')
const readText = (file) => fs.readFile(path.join(root, file), 'utf8')
const readJson = async (file) => JSON.parse((await readText(file)).replace(/^\uFEFF/u, ''))

const ALLOWED = new Set(['MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'ISC', 'CC0-1.0', 'Unlicense'])
const DENIED = new Set(['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'LGPL-2.1', 'LGPL-3.0', 'UNLICENSED', 'NOASSERTION', 'UNKNOWN'])
const STATUSES = new Set(['planned', 'vendored', 'ported', 'idea-only'])

function fail(message) {
  throw new Error(`check-licenses: ${message}`)
}

function baseLicense(value) {
  return String(value ?? '').trim().split(/[\s(]/)[0]
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

const manifest = await readJson('vendor/manifest.json')
if (!manifest || !Array.isArray(manifest.items)) fail('vendor/manifest.json 缺少 items 数组。')

await fs.access(path.join(root, 'THIRD_PARTY_NOTICES.md')).catch(() => fail('缺少 THIRD_PARTY_NOTICES.md'))
await fs.access(path.join(root, 'LICENSES')).catch(() => fail('缺少 LICENSES/'))

const pkg = await readJson('package.json')
const files = Array.isArray(pkg.files) ? pkg.files : []
for (const required of ['THIRD_PARTY_NOTICES.md', 'LICENSES', 'vendor']) {
  if (!files.includes(required)) fail(`package.json files 缺少 ${required}`)
}

const summary = []
for (const item of manifest.items) {
  const name = String(item?.name ?? '').trim()
  if (!name) fail('manifest 有项目缺 name。')
  const status = String(item?.status ?? '').trim()
  if (!STATUSES.has(status)) fail(`${name}: status 只能是 planned/vendored/idea-only。`)
  if (!String(item?.upstream ?? '').startsWith('https://')) fail(`${name}: 缺 upstream https 地址。`)
  const license = baseLicense(item?.license)
  if (status !== 'idea-only' && !ALLOWED.has(license)) {
    fail(`${name}: 许可 ${item?.license} 不在允许清单（${[...ALLOWED].join(', ')}）。`)
  }
  if (status !== 'idea-only' && DENIED.has(license)) fail(`${name}: 禁用许可 ${license}。`)
  if (status === 'vendored') {
    if (!Array.isArray(item.files) || item.files.length === 0) fail(`${name}: vendored 但没有 files[]。`)
    for (const file of item.files) {
      const rel = String(file?.path ?? '')
      if (!rel.startsWith('lib/vendor/')) fail(`${name}: vendored 文件必须放在 lib/vendor/ 下，收到 ${rel || '(空)'}。`)
      const buffer = await fs.readFile(path.join(root, rel)).catch(() => fail(`${name}: 缺文件 ${rel}`))
      const got = sha256(buffer)
      if (got !== file.sha256) fail(`${name}: ${rel} 的 sha256 不匹配（manifest ${file.sha256}，实际 ${got}）。`)
    }
    if (license === 'Apache-2.0') {
      await fs.access(path.join(root, 'LICENSES', name, 'NOTICE')).catch(() => fail(`${name}: Apache-2.0 缺 LICENSES/${name}/NOTICE。`))
    }
    await fs.access(path.join(root, 'LICENSES', name)).catch(() => fail(`${name}: vendored 缺 LICENSES/${name}/。`))
  }
  summary.push(`${name}: ${status} / ${license}`)
}

// 运行依赖只查直接依赖；voice 目前没有 npm 运行依赖。将来加依赖时，这里会读 node_modules 的 license。
const deps = Object.keys(pkg.dependencies ?? {})
const deniedDeps = []
for (const dep of deps) {
  try {
    const depPkg = JSON.parse(await fs.readFile(path.join(root, 'node_modules', dep, 'package.json'), 'utf8'))
    const license = baseLicense(depPkg.license)
    if (DENIED.has(license) || !ALLOWED.has(license)) deniedDeps.push(`${dep} (${depPkg.license ?? 'UNKNOWN'})`)
  } catch {
    // 没装依赖时留给 npm ci；不把“没装”当成许可问题。
  }
}
if (deniedDeps.length) fail(`运行依赖含不允许的许可：${deniedDeps.join(', ')}`)

console.log('check-licenses: ok')
console.log(`  items ${summary.length}, vendored ${manifest.items.filter((item) => item.status === 'vendored').length}, ported ${manifest.items.filter((item) => item.status === 'ported').length}, planned ${manifest.items.filter((item) => item.status === 'planned').length}, idea-only ${manifest.items.filter((item) => item.status === 'idea-only').length}`)
for (const line of summary) console.log(`  ${line}`)

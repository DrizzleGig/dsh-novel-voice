import test from 'node:test'
import assert from 'node:assert/strict'
import { lint, rank } from '../lib/check.js'
import { defaultEntries } from '../lib/watchlist.js'
import { buildOverlapIndex } from '../lib/overlap.js'
import { buildBrief } from '../lib/compiler.js'
import { retention, selectWindows, validateWindow } from '../lib/repair.js'

const watchlist = { entries: defaultEntries() }

test('否定-修正句：叙述里是 warn，对白里降为 info', () => {
  const narration = lint('他不是不想去，而是不敢去。', { watchlist })
  const found = narration.findings.find((finding) => finding.detector === 'negation-parallel')
  assert.equal(found?.severity, 'warn')

  const dialogue = lint('「不是不想去，而是不敢去。」他说。', { watchlist })
  const soft = dialogue.findings.find((finding) => finding.detector === 'negation-parallel')
  assert.equal(soft?.severity, 'info')
})

test('段末升华会被定位到结尾', () => {
  const text = '他推开门，走了出去。从此，一切都不同了。'
  const result = lint(text, { watchlist })
  const found = result.findings.find((finding) => finding.detector === 'paragraph-closure')
  assert.ok(found)
  assert.equal(found.span.end, text.length)
  assert.match(found.quote, /从此/)
})

test('抽象情绪直述会被指出，并给出可执行的替换建议', () => {
  const result = lint('他感到无比紧张，心里充满了不安。', { watchlist })
  const found = result.findings.find((finding) => finding.detector === 'emotion-naming')
  assert.ok(found)
  assert.match(found.fix, /动作|生理|删掉/)
})

test('套话按段报，不逐词报', () => {
  const text = '他眼中闪过一丝犹豫，嘴角勾起一抹弧度。\n\n她站在门口，没有动。'
  const result = lint(text, { watchlist })
  const density = result.findings.filter((finding) => finding.detector === 'cliche-density')
  assert.equal(density.length, 1)
  assert.ok(result.portrait.clichePer1k > 0)
})

test('20 字重合是 block，且能定位', () => {
  const source = '他指尖停在门把上，迟迟没有转动。窗外的雪落了一整夜，天亮时才停。'
  const overlap = buildOverlapIndex([{ workId: 'w-1', text: source }])
  const draft = `前面是一些自己的话。他指尖停在门把上，迟迟没有转动。窗外的雪落了一整夜。后面也是自己的。`
  const result = lint(draft, { watchlist, overlap })
  const found = result.findings.find((finding) => finding.detector === 'overlap')
  assert.equal(found?.severity, 'block')
  assert.ok(draft.includes(found.quote))
})

test('节奏偏离只进 deviations，不进 findings', () => {
  const profile = { bands: { sentenceMean: { band: [10, 20], n: 100, provisional: false } } }
  const result = lint('短句。短句。短句。短句。', { watchlist, profile })
  assert.equal(result.findings.some((finding) => finding.detector === 'rhythm'), false)
  assert.ok(Array.isArray(result.deviations))
})

test('rank 只给指针，不给好坏', () => {
  const clean = '他推开门。雪落在肩上。'
  const dirty = '他眼中闪过一丝犹豫，空气中弥漫着压抑。'
  const result = rank([dirty, clean], { watchlist })
  assert.equal(result.closest, 1)
  assert.match(result.note, /不代表写得更好/)
})

test('选窗：合并相邻命中，限制窗口大小', () => {
  const text = '第一句。第二句。第三句。第四句。第五句。第六句。'
  const findings = [
    { detector: 'emotion-naming', severity: 'warn', span: { start: 4, end: 7 }, quote: '第二句' },
    { detector: 'paragraph-closure', severity: 'warn', span: { start: 8, end: 11 }, quote: '第三句' },
  ]
  const windows = selectWindows(findings, text, { windowChars: 60 })
  assert.equal(windows.length, 1)
  assert.ok(windows[0].end - windows[0].start <= 60)
})

test('选窗：findings 乱序也能正确合并', () => {
  const text = '第一句。第二句。第三句。第四句。第五句。第六句。'
  const findings = [
    { detector: 'paragraph-closure', severity: 'warn', span: { start: 8, end: 11 } },
    { detector: 'emotion-naming', severity: 'warn', span: { start: 4, end: 7 } },
  ]
  const windows = selectWindows(findings, text, { windowChars: 60 })
  assert.equal(windows.length, 1)
  assert.ok(windows[0].start <= 4)
  assert.ok(windows[0].end >= 11)
})

test('保留度：整段重写会被算出来', () => {
  assert.ok(retention('他感到非常紧张，心里充满了不安。', '他指尖停在门把上，迟迟没有转动。') < 0.45)
  assert.ok(retention('他指尖停在门把上，迟迟没有转动。', '他指尖停在门把上，很久没有转动。') >= 0.45)
})

test('校验：新增数字直接拒；新增引号直接拒；长度超 15% 拒', () => {
  const context = { watchlist, overlap: null, cast: [] }
  const before = '他推开门，屋里没有灯。'
  assert.equal(validateWindow(before, '他推开门，屋里第3盏灯。', context).reason, 'new-fact')
  assert.equal(validateWindow(before, '他推开门，屋里没有人。', context).ok, true)
  assert.equal(validateWindow(before, '他推开门，她说「没灯」。', context).reason, 'new-quote')
  assert.equal(validateWindow(before, '他推开门，屋里没有灯，风从门缝里进来，吹得桌上的纸响了一下。', context).reason, 'length')
})

test('简报：预算内、无百分比、硬约束不裁、样段遮名', () => {
  const profile = {
    id: 'p-1', version: '1.0', status: 'confirmed', provisional: false,
    identity: { summary: '克制白描。', avoid: [] },
    bands: {},
    blend: { global: { 'm-restrained': 1 }, sceneWeights: { 悬疑对峙: { 'm-restrained': 1 } } },
    rules: [
      { id: 'r-001', status: 'confirmed', layer: 'L3', instruction: '紧张时写动作，不写"他很紧张"。', scope: { sceneTypes: ['悬疑对峙'] }, confidence: 0.9 },
      { id: 'r-002', status: 'confirmed', layer: 'L3', instruction: '段末不要总结。', scope: { sceneTypes: [] }, confidence: 0.8 },
    ],
    anchors: [{ kind: 'reference', scene: '悬疑对峙', text: '老人正在磨刀，磨石发出很轻的声音。' }],
    samples: [{ kind: 'own', scene: '悬疑对峙', text: '林砚推开门。雪落在肩上，很快化了。' }],
    conflicts: [],
  }
  const brief = buildBrief(profile, {
    chapter: 7, scene: '悬疑对峙', cast: ['林砚'],
    hardConstraints: { pov: '第三人称限知', address: ['林砚→沈砚「沈大人」'] },
  })
  assert.equal(brief.ok, true)
  assert.ok(brief.chars <= 600)
  assert.doesNotMatch(brief.markdown, /\d+%/)
  assert.match(brief.markdown, /【硬约束】/)
  assert.match(brief.markdown, /第三人称限知/)
  assert.ok(!brief.markdown.includes('林砚推开门'))
})

test('简报：模式权重会改变规则排序', () => {
  const profile = {
    id: 'p-mw', version: '1.0', status: 'confirmed', provisional: false,
    identity: { summary: '测试。', avoid: [] },
    bands: {},
    blend: {
      global: { 'm-immersive': 0, 'm-tight': 0, 'm-restrained': 1 },
      sceneWeights: { 悬疑对峙: { 'm-immersive': 0, 'm-tight': 0, 'm-restrained': 1 } },
    },
    modes: [
      { id: 'm-immersive', name: '沉浸', when: ['悬疑对峙'], ruleIds: ['r-002'] },
      { id: 'm-tight', name: '紧凑', when: [], ruleIds: [] },
      { id: 'm-restrained', name: '克制', when: ['悬疑对峙'], ruleIds: ['r-001'] },
    ],
    rules: [
      { id: 'r-001', status: 'confirmed', layer: 'L3', title: '克制规则', instruction: '克制规则的内容', scope: { sceneTypes: ['悬疑对峙'] }, confidence: 0.5 },
      { id: 'r-002', status: 'confirmed', layer: 'L3', title: '沉浸规则', instruction: '沉浸规则的内容', scope: { sceneTypes: ['悬疑对峙'] }, confidence: 0.5 },
    ],
    anchors: [], samples: [], conflicts: [],
  }
  const brief = buildBrief(profile, { chapter: 1, scene: '悬疑对峙' })
  assert.equal(brief.rules[0], 'r-001', '权重高的模式应先出它的规则')
  assert.ok(brief.markdown.indexOf('克制规则的内容') < brief.markdown.indexOf('沉浸规则的内容'))
})

test('简报：L2 节奏规则有保底名额', () => {
  const templates = Array.from({ length: 5 }, (_, index) => ({
    id: `t-${index}`, status: 'confirmed', layer: 'L3', title: `模板 ${index}`,
    instruction: `模板内容 ${index}`, scope: { sceneTypes: ['动作战斗'] }, confidence: 0.9,
  }))
  const rhythms = [0, 1].map((index) => ({
    id: `l2-${index}`, status: 'confirmed', layer: 'L2', title: `节奏 ${index}`,
    instruction: `节奏内容 ${index}`, scope: { sceneTypes: [] }, confidence: 0.7,
    check: { detector: 'rhythm' },
  }))
  const profile = {
    id: 'p-l2', version: '1', status: 'confirmed', provisional: false,
    identity: { summary: '测试。', avoid: [] }, bands: {},
    blend: { global: {}, sceneWeights: {} }, modes: [],
    rules: [...templates, ...rhythms], anchors: [], samples: [], conflicts: [],
  }
  const brief = buildBrief(profile, { chapter: 1, scene: '动作战斗' })
  assert.ok(brief.rules.includes('l2-0'))
  assert.ok(brief.rules.includes('l2-1'))
  assert.equal(brief.rules.length, 5)
})

test('简报：预算不够时先删锚点、再删规则，硬约束仍在', () => {
  const profile = {
    id: 'p-1', version: '1.0', status: 'confirmed', provisional: true,
    identity: { summary: '克制。', avoid: ['眼中闪过一丝'] },
    bands: {}, blend: { global: { 'm-tight': 1 }, sceneWeights: {} },
    rules: Array.from({ length: 5 }, (_, index) => ({
      id: `r-${index}`, status: 'confirmed', layer: 'L3',
      instruction: `这是一条很长的写法说明，用来占满预算，第 ${index + 1} 条。`, scope: { sceneTypes: [] }, confidence: 0.5,
    })),
    anchors: [{ kind: 'reference', scene: '动作战斗', text: '刀锋擦过石面，火星溅起来。' }],
    samples: [], conflicts: [],
  }
  const brief = buildBrief(profile, { chapter: 3, scene: '动作战斗', budget: 120, hardConstraints: { pov: '第三人称限知' } })
  assert.ok(brief.chars <= 120)
  assert.match(brief.markdown, /【硬约束】/)
  assert.ok(brief.rules.length < 5)
  assert.ok(brief.chars <= 200)
})

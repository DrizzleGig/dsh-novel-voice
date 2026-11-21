// lib/consts.js — 全部可调常数集中在这里，测试直接引用。

export const PLUGIN_NAME = 'dsh-novel-voice'
export const VERSION = '0.2.0'
export const ROOT_DIR = '.dsh-novel-voice'

export const LIMITS = {
  fileBytes: 20 * 1024 * 1024,
  bookChars: 5_000_000,
  libraryChars: 20_000_000,
  works: 20,
  minChars: 8_000,
  recommendChars: 30_000,
  usableChars: 30_000,
  sliceChars: 1_200,
  quickSamples: 4,
  deepSamples: 12,
  maxSamples: 120,
  maxSamplesPerCall: 40,
  windowPad: 24,
  windowChars: 300,
  maxWindows: 20,
  maxRounds: 2,
  briefChars: 600,
  sampleChars: 400,
  anchorChars: 80,
  maxRules: 5,
  maxBans: 8,
  temperature: 0.4,
  maxTokensPerWindow: 900,
  overlapChars: 20,
}

export const SCENES = ['对话', '动作战斗', '心理情感', '描写环境', '日常过渡', '悬疑对峙']

export const SCENE_KEYWORDS = {
  日常过渡: ['吃', '睡', '走', '回', '屋', '街', '茶', '饭', '笑', '聊'],
  动作战斗: ['刀', '剑', '拳', '冲', '扑', '闪', '退', '砍', '血', '杀', '撞', '抓'],
  心理情感: ['想', '觉得', '心里', '记得', '害怕', '难过', '喜欢', '恨', '回忆', '明白'],
  描写环境: ['光', '风', '雨', '雪', '雾', '味', '声', '色', '冷', '热', '山', '水'],
  悬疑对峙: ['问', '停', '沉默', '盯', '却', '为什么', '谁', '秘密', '等', '忽然'],
  对话: ['「', '」', '“', '”', '说', '道', '问', '答'],
}

export const MODES = [
  { id: 'm-immersive', name: '沉浸', when: ['日常过渡', '心理情感', '描写环境'] },
  { id: 'm-tight', name: '紧凑', when: ['动作战斗'] },
  { id: 'm-restrained', name: '克制', when: ['悬疑对峙', '对话'] },
]

export const DEFAULT_BLEND = {
  global: { 'm-immersive': 0.4, 'm-tight': 0.35, 'm-restrained': 0.25 },
  sceneWeights: {
    日常过渡: { 'm-immersive': 0.6, 'm-tight': 0.2, 'm-restrained': 0.2 },
    动作战斗: { 'm-immersive': 0.1, 'm-tight': 0.75, 'm-restrained': 0.15 },
    悬疑对峙: { 'm-immersive': 0.2, 'm-tight': 0.15, 'm-restrained': 0.65 },
  },
}

export const DETECTOR_IDS = [
  'negation-parallel',
  'paragraph-closure',
  'emotion-naming',
  'cliche-density',
  'overlap',
  'repetition',
  'contract',
  'rhythm',
  'abstraction',
  'explanation',
  'triple-parallel',
  'stale-metaphor',
]

export const SEVERITY_ORDER = { block: 0, warn: 1, info: 2, hint: 3 }

export const LANE_LABEL = {
  block: '硬伤',
  warn: '值得看',
  info: '画像',
  hint: '候选',
}

export const BAND_MIN_HALF = {
  sentenceMean: 2.5,
  sentenceCv: 0.08,
  paragraphMean: 8,
  dialogueRatio: 0.06,
  clichePer1k: 0.5,
  explanationPer1k: 0.5,
  abstractPer1k: 0.8,
}

export const REPAIR_SYSTEM = [
  '你是一个中文小说文字编辑。只改给定的片段，其他什么都不做。',
  '硬性规则：',
  '1. 不改人名、称呼、数字、时间、地点、视角；',
  '2. 不新增任何事实、细节、比喻、动作；不要"补具体"；',
  '3. 不解释人物动机，不加作者评论；',
  '4. 只删改被标出的问题，其余原样保留；',
  '5. 字数变化不超过 15%；',
  '6. 只输出改写后的这一段文字，不要 JSON、不要解释、不要引号包裹。',
].join('\n')


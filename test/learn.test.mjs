import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyCandidates, parseCandidates } from '../lib/learn.js'

const samples = [
  { workId: 'w-1', chapter: 1, text: '他指尖停在门把上，迟迟没有转动。雪落在肩上，很快化了。' },
  { workId: 'w-2', chapter: 3, text: '她把碗放下，站起身，又坐下。' },
]

test('技法提取：引文逐字回查，找不到的卡整张丢弃', () => {
  const good = {
    title: '用动作承接情绪',
    layer: 'L3',
    observation: '紧张时先写动作',
    instruction: '紧张场景写手做什么，不写"他很紧张"。',
    scope: ['悬疑对峙'],
    evidence: [{ sample: 1, quote: '他指尖停在门把上' }],
  }
  const bad = {
    title: '编出来的卡',
    layer: 'L3',
    observation: 'x',
    instruction: 'y',
    scope: [],
    evidence: [{ sample: 1, quote: '他慢慢推开门走了出去' }],
  }
  const ok = verifyCandidates([good], samples)
  assert.equal(ok.accepted.length, 1)
  assert.equal(ok.accepted[0].evidence[0].workId, 'w-1')

  const rejected = verifyCandidates([bad], samples)
  assert.equal(rejected.accepted.length, 0)
  assert.equal(rejected.rejected[0].reason, 'evidence-not-found')

  // 空引文、超长引文、样本序号不对，都算证据不成立
  const invalid = verifyCandidates([
    { title: 'a', evidence: [{ sample: 1, quote: '' }] },
    { title: 'b', evidence: [{ sample: 99, quote: '他指尖' }] },
    { title: 'c', evidence: [{ sample: 1, quote: '一'.repeat(50) }] },
  ], samples)
  assert.equal(invalid.accepted.length, 0)
  assert.equal(invalid.rejected.length, 3)
})

test('技法提取：模型输出不是 JSON 数组时给出稳定错误码', () => {
  assert.throws(() => parseCandidates('好的，我来写几条技法：'), (error) => error.code === 'model-output-invalid')
  assert.throws(() => parseCandidates('not json'), (error) => error.code === 'model-output-invalid')
  assert.deepEqual(parseCandidates('[{"title":"x"}]'), [{ title: 'x' }])
})

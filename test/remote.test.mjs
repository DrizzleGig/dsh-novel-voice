import test from 'node:test'
import assert from 'node:assert/strict'
import { bindRemoteMethods, runRemoteInitializers } from '../lib/typert-bind.js'

const KEY = '@deepseek-ai/dsh-typert-protocol/remote-methods'

// 与 dsh-typert-protocol 的 addMarkerInitializer 同语义：只读 private/static/name/addInitializer，
// marker 在实例化时写到原型上。
function fakeRemote(exportName) {
  return (method, context) => {
    assert.equal(context.private, false)
    assert.equal(context.static, false)
    assert.equal(typeof context.name, 'string')
    assert.equal(typeof context.addInitializer, 'function')
    context.addInitializer(function initialize() {
      const prototype = Object.getPrototypeOf(this)
      const current = Object.getOwnPropertyDescriptor(prototype, KEY)?.value ?? { version: 1, methods: [] }
      Object.defineProperty(prototype, KEY, {
        configurable: true,
        value: {
          version: 1,
          methods: [...current.methods, { method: context.name, ...(exportName === context.name ? {} : { exportName }) }],
        },
      })
    })
  }
}

test('remote 装饰器复刻：marker 写到原型，实例化时执行一次', () => {
  class Demo {
    alpha() { return 1 }
    beta() { return 2 }
  }
  bindRemoteMethods(Demo, { alpha: 'alpha', beta: 'betaEndpoint' }, (method, name) => fakeRemote(name))
  const instance = new Demo()
  runRemoteInitializers(instance)
  const descriptor = Object.getOwnPropertyDescriptor(Demo.prototype, KEY).value
  assert.deepEqual(descriptor.methods.map((marker) => marker.method), ['alpha', 'beta'])
  assert.equal(descriptor.methods[1].exportName, 'betaEndpoint')
})

test('remote 装饰器复刻：不跑初始化时原型上没有 marker', () => {
  class Demo {
    only() {}
  }
  bindRemoteMethods(Demo, { only: 'only' }, (method, name) => fakeRemote(name))
  setImmediate(() => {})
  const key = Object.getOwnPropertyDescriptor(Demo.prototype, KEY)
  assert.equal(key, undefined)
  const instance = new Demo()
  runRemoteInitializers(instance)
  assert.ok(Object.getOwnPropertyDescriptor(Demo.prototype, KEY)?.value.methods.length === 1)
})

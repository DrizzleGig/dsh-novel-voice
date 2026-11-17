// lib/typert-bind.js — 把 `@Remote` 装饰器用在普通 JS 类上。
// 复刻 tsc 装饰器输出：装饰器在定义时拿到 context，把 marker 写进
// addInitializer 排队的初始化函数里；实例化时用 this 跑一遍。
// 单独成文件是为了可单测（测试注入一个语义相同的假装饰器）。

export const REMOTE_INITIALIZERS = Symbol.for('dsh-novel-voice.remote.initializers')

export function bindRemoteMethods(klass, names, decorate) {
  const initializers = []
  const proto = klass.prototype
  for (const [method, exportName] of Object.entries(names)) {
    const context = {
      kind: 'method',
      name: method,
      static: false,
      private: false,
      access: { has: (object) => method in object, get: (object) => object[method] },
      addInitializer(fn) {
        if (typeof fn === 'function') initializers.push(fn)
      },
      metadata: undefined,
    }
    const result = decorate(method, exportName ?? method)(proto[method], context)
    if (typeof result === 'function') proto[method] = result
  }
  Object.defineProperty(klass, REMOTE_INITIALIZERS, { value: initializers })
}

export function runRemoteInitializers(instance) {
  const initializers = instance?.constructor?.[REMOTE_INITIALIZERS] ?? []
  for (const initializer of initializers) initializer.call(instance)
}

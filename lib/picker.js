// lib/picker.js — 调宿主的目录选择器。服务暴露的是 capability()，不是 pick()。

export function pickerCapability(picker) {
  if (!picker || typeof picker.capability !== 'function') return null
  try {
    const capability = picker.capability()
    return capability && typeof capability === 'object' ? capability : null
  } catch {
    return null
  }
}

export async function pickDirectory(picker, signal) {
  const capability = pickerCapability(picker)
  if (!capability) {
    const error = new Error('没有找到目录选择服务（directoryPicker）；请在对话里用 voice_import，或改用「从浏览器选择文件」。')
    error.code = 'picker-unavailable'
    throw error
  }
  if (capability.kind !== 'native' || typeof capability.pick !== 'function') {
    const error = new Error('这台机器用的是应用内目录浏览，没有原生选择框；请用「从浏览器选择文件」或「输入路径」。')
    error.code = 'picker-browse'
    throw error
  }
  return await capability.pick(signal)
}

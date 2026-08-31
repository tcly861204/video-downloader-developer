/**
 * 封禁门禁（gate）后端封装：对齐 src-tauri/src/gate.rs。
 *
 * 后端命中封禁后发出 `gate-blocked` 事件，前端收到后先 ack（停止原生弹窗兜底），
 * 再渲染封禁界面；用户点「退出应用」时调用 exitApp 结束进程。
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

const dev = import.meta.env.DEV

/** 仅开发环境打印 invoke 请求/响应日志，生产环境原样透传 */
async function devLog<T>(name: string, run: () => Promise<T>): Promise<T> {
  if (!dev) return run()
  const started = performance.now()
  console.log(`[gate] → ${name}`)
  try {
    const res = await run()
    console.log(`[gate] ← ${name}`, res ?? '', `(${Math.round(performance.now() - started)}ms)`)
    return res
  } catch (err) {
    console.error(`[gate] ← ${name} 失败`, err)
    throw err
  }
}

/** 封禁事件负载 */
export interface GateBlockedPayload {
  reason: string
}

/** 订阅封禁事件，返回取消监听函数 */
export function onGateBlocked(cb: (p: GateBlockedPayload) => void): Promise<UnlistenFn> {
  return listen<GateBlockedPayload>('gate-blocked', (e) => {
    if (dev) console.log('[gate] ⇐ 收到 gate-blocked 事件', e.payload)
    cb(e.payload)
  })
}

/** 确认前端已渲染出封禁遮罩，避免原生弹窗兜底再弹出 */
export function ackGateBlocked(): Promise<void> {
  return devLog('gate_ack_blocked', () => invoke('gate_ack_blocked'))
}

/** 封禁界面「退出应用」按钮：结束进程 */
export function exitApp(): Promise<void> {
  return devLog('gate_exit', () => invoke('gate_exit'))
}

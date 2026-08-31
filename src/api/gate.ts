/**
 * 封禁门禁（gate）后端封装：对齐 src-tauri/src/gate.rs。
 *
 * 后端命中封禁后发出 `gate-blocked` 事件，前端收到后先 ack（停止原生弹窗兜底），
 * 再渲染封禁界面；用户点「退出应用」时调用 exitApp 结束进程。
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

/** 封禁事件负载 */
export interface GateBlockedPayload {
  reason: string
}

/** 订阅封禁事件，返回取消监听函数 */
export function onGateBlocked(cb: (p: GateBlockedPayload) => void): Promise<UnlistenFn> {
  return listen<GateBlockedPayload>('gate-blocked', (e) => cb(e.payload))
}

/** 确认前端已渲染出封禁遮罩，避免原生弹窗兜底再弹出 */
export function ackGateBlocked(): Promise<void> {
  return invoke('gate_ack_blocked')
}

/** 封禁界面「退出应用」按钮：结束进程 */
export function exitApp(): Promise<void> {
  return invoke('gate_exit')
}

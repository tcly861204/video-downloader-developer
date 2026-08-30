/**
 * 下载任务状态机
 *
 * 职责：
 * - 解析链接（调后端 parse_video）→ 入队
 * - 按「并发数」配置启停任务（调后端 start_download / cancel_download）
 * - 订阅后端事件：进度 / 完成 / 失败 → 更新任务状态与速度
 *
 * 任务 ID 由前端 nanoid 生成，后端所有事件都带着它回传，据此路由。
 */
import { create } from 'zustand'
import { nanoid } from 'nanoid'
import {
  cancelDownload,
  onDownloadDone,
  onDownloadError,
  onDownloadProgress,
  parseVideo,
  startDownload,
  type DownloadDone,
  type DownloadError,
  type DownloadProgress,
} from '@/api/video'
import { qualityLabel, useSettingsStore } from '@/store/settings'

export type TaskStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'failed'

export interface DownloadTask {
  id: string
  title: string
  platform: string
  quality: string
  /** 总大小（字节），下载开始时由后端进度事件给出 */
  size: number
  /** 已下载（字节） */
  downloaded: number
  /** 当前速度（字节/秒），由前后两次进度事件差分算出 */
  speed: number
  status: TaskStatus
  createdAt: number
  awemeId: string
  playUrl: string
  /** 视频封面图 URL，解析时带回，任务行缩略图使用 */
  cover?: string
  savePath?: string
  error?: string
}

interface DownloadState {
  tasks: DownloadTask[]
  /** 首页粘贴后待解析的链接，跳转前写入、下载页消费后清空 */
  pendingUrl: string | null
  setPendingUrl: (url: string | null) => void
  /** 解析链接并入队（自动尝试下载）；失败时抛出给页面显示 */
  parseAndAdd: (text: string) => Promise<void>
  start: (id: string) => Promise<void>
  pause: (id: string) => Promise<void>
  resume: (id: string) => Promise<void>
  retry: (id: string) => Promise<void>
  remove: (id: string) => void
  clearCompleted: () => void
  pauseAll: () => void
  resumeAll: () => void
}

// 速度采样：taskId → 上次进度字节 + 时间戳
const samples: Record<string, { bytes: number; time: number }> = {}

/** 计算并更新某个任务的速度 */
function applyProgress(p: DownloadProgress) {
  const now = Date.now()
  const prev = samples[p.taskId]
  let speed = 0
  if (prev) {
    const dt = (now - prev.time) / 1000
    const db = p.downloaded - prev.bytes
    if (dt > 0 && db >= 0) speed = db / dt
  }
  samples[p.taskId] = { bytes: p.downloaded, time: now }

  useDownloadStore.setState((s) => ({
    tasks: s.tasks.map((t) =>
      t.id === p.taskId
        ? { ...t, downloaded: p.downloaded, size: Math.max(t.size, p.total), speed }
        : t,
    ),
  }))
}

function applyDone(p: DownloadDone) {
  delete samples[p.taskId]
  useDownloadStore.setState((s) => ({
    tasks: s.tasks.map((t) =>
      t.id === p.taskId
        ? { ...t, status: 'completed', savePath: p.path, downloaded: t.size, speed: 0, error: undefined }
        : t,
    ),
  }))
  kickQueue()
}

function applyError(p: DownloadError) {
  delete samples[p.taskId]
  useDownloadStore.setState((s) => ({
    tasks: s.tasks.map((t) =>
      t.id === p.taskId
        ? { ...t, status: 'failed', error: p.error, speed: 0 }
        : t,
    ),
  }))
  kickQueue()
}

/**
 * 有空闲并发槽位时，依次启动排队中的任务。
 * 在任何任务结束 / 暂停后调用，让队列自动接力。
 */
function kickQueue() {
  const s = useDownloadStore.getState()
  const concurrency = useSettingsStore.getState().concurrency || 1
  let active = s.tasks.filter((t) => t.status === 'downloading').length
  for (const t of s.tasks) {
    if (t.status !== 'queued' || active >= concurrency) continue
    void s.start(t.id)
    active += 1
  }
}

/** 模块加载时订阅一次后端事件（带防重入） */
let eventsReady = false
function initEvents() {
  if (eventsReady) return
  eventsReady = true
  try {
    void onDownloadProgress(applyProgress).catch(() => {})
    void onDownloadDone(applyDone).catch(() => {})
    void onDownloadError(applyError).catch(() => {})
  } catch {
    // 非 Tauri 环境（纯浏览器预览）没有事件源，静默即可
  }
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  tasks: [],
  pendingUrl: null,

  setPendingUrl: (url) => set({ pendingUrl: url }),

  parseAndAdd: async (text) => {
    const info = await parseVideo(text)
    const settings = useSettingsStore.getState()
    const task: DownloadTask = {
      id: nanoid(),
      title: info.title || '抖音视频',
      platform: '抖音',
      quality: qualityLabel(settings.defaultQuality),
      size: 0,
      downloaded: 0,
      speed: 0,
      status: 'queued',
      createdAt: Date.now(),
      awemeId: info.awemeId,
      playUrl: info.playUrl,
      cover: info.cover || undefined,
    }
    // 解析后仅入队，由用户在任务行点击「下载」再开始
    set((s) => ({ tasks: [task, ...s.tasks] }))
  },

  start: async (id) => {
    const task = get().tasks.find((t) => t.id === id)
    if (!task || task.status === 'downloading') return

    // 并发槽位检查：已满则保持 queued，等 kickQueue 自动启动
    const concurrency = useSettingsStore.getState().concurrency || 1
    const active = get().tasks.filter((t) => t.status === 'downloading').length
    if (active >= concurrency) return

    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, status: 'downloading', error: undefined } : t,
      ),
    }))

    try {
      await startDownload({
        taskId: id,
        playUrl: task.playUrl,
        title: task.title,
        awemeId: task.awemeId,
        platform: task.platform,
        quality: task.quality,
      })
    } catch (e) {
      // 启动失败（如无法建连）→ 置失败，并让队列接力
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === id ? { ...t, status: 'failed', error: String(e) } : t,
        ),
      }))
      kickQueue()
    }
  },

  pause: async (id) => {
    const task = get().tasks.find((t) => t.id === id)
    if (!task || task.status !== 'downloading') return
    // 通知后端中断请求；任务立即标记为已暂停（进度可能还有余量事件，会被忽略）
    void cancelDownload(id).catch(() => {})
    delete samples[id]
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: 'paused', speed: 0 } : t)),
    }))
    kickQueue()
  },

  resume: async (id) => {
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: 'queued', error: undefined } : t)),
    }))
    await get().start(id)
  },

  retry: async (id) => {
    await get().resume(id)
  },

  remove: (id) => {
    const task = get().tasks.find((t) => t.id === id)
    if (task?.status === 'downloading') void cancelDownload(id).catch(() => {})
    delete samples[id]
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }))
    kickQueue()
  },

  clearCompleted: () =>
    set((s) => ({ tasks: s.tasks.filter((t) => t.status !== 'completed') })),

  pauseAll: () => {
    const ids = get().tasks.filter((t) => t.status === 'downloading').map((t) => t.id)
    ids.forEach((id) => void cancelDownload(id).catch(() => {}))
    ids.forEach((id) => delete samples[id])
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.status === 'downloading' ? { ...t, status: 'paused', speed: 0 } : t,
      ),
    }))
  },

  resumeAll: () => {
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.status === 'paused' ? { ...t, status: 'queued', error: undefined } : t,
      ),
    }))
    kickQueue()
  },
}))

// 模块加载即订阅事件（下载中心 / 首页都 import 本 store）
initEvents()

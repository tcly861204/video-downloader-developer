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
  type PostItem,
  type QualityOption,
} from '@/api/video'
import { qualityLabel, useSettingsStore, type Quality } from '@/store/settings'

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
  /** 播放地址；批量任务由后端按 awemeId 解析，创建时可为空 */
  playUrl?: string
  /** 视频封面图 URL，解析时带回，任务行缩略图使用 */
  cover?: string
  /**
   * 是否被用户「点过下载」。
   * 只有 requested 的任务才会在并发槽位空闲时自动接力，
   * 解析出来的未点击任务不会被顺带下载。
   */
  requested?: boolean
  savePath?: string
  error?: string
  /** 可选清晰度档位（Pornhub 等多档平台），非空时任务行展示清晰度下拉 */
  qualityOptions?: QualityOption[]
}

interface DownloadState {
  tasks: DownloadTask[]
  /** 首页粘贴后待解析的链接，跳转前写入、下载页消费后清空 */
  pendingUrl: string | null
  setPendingUrl: (url: string | null) => void
  /** 解析链接并入队（不自动下载）；失败时抛出给页面显示 */
  parseAndAdd: (text: string) => Promise<void>
  /** 切换某任务的清晰度档位：同步更新播放地址与档位标签 */
  setQuality: (id: string, label: string) => void
  /** 批量入队：把主页作品创建为已请求的下载任务，返回任务 id 列表 */
  enqueueBatch: (posts: PostItem[]) => string[]
  start: (id: string) => Promise<void>
  pause: (id: string) => Promise<void>
  resume: (id: string) => Promise<void>
  retry: (id: string) => Promise<void>
  remove: (id: string) => void
  clearCompleted: () => void
  pauseAll: () => void
  resumeAll: () => void
}

// 从档位标签里解析分辨率（'1080P' → 1080），取不到返回 0
function optionNum(label: string): number {
  const m = label.match(/(\d+)/)
  return m ? Number(m[1]) : 0
}

/**
 * 按全局默认清晰度在真实档位里挑最合适的一项：
 * - 原画 → 取最高档
 * - 指定 1080/720/480 → 取「不超过该值」里最高的；全都不满足则取最低档
 */
function pickQualityOption(options: QualityOption[], requested: Quality): QualityOption {
  const sorted = [...options].sort((a, b) => optionNum(b.label) - optionNum(a.label))
  if (requested === 'original') return sorted[0]
  const cap = optionNum(requested)
  return sorted.find((o) => optionNum(o.label) <= cap) ?? sorted[sorted.length - 1]
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
  kickArmed()
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
  kickArmed()
}

/**
 * 有空闲并发槽位时，依次启动「用户点击过下载」且仍排队的任务。
 * 纯解析出来的任务（requested=false）不会被顺带下载；
 * 只有「全部开始」会主动把未下载的任务都标记为 requested。
 * 在任务结束 / 暂停 / 移除后调用，让已请求的任务自动接力。
 */
function kickArmed() {
  const s = useDownloadStore.getState()
  const concurrency = useSettingsStore.getState().concurrency || 1
  let active = s.tasks.filter((t) => t.status === 'downloading').length
  for (const t of s.tasks) {
    if (t.status !== 'queued' || !t.requested || active >= concurrency) continue
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
    // 去重：同 awemeId 已在列表（含已完成/失败）则不再重复入队，抛错让页面提示
    if (get().tasks.some((t) => t.awemeId === info.awemeId)) {
      throw `该视频已在下载列表中，无需重复添加`
    }
    const settings = useSettingsStore.getState()
    // 有清晰度档位时按全局默认清晰度挑一项，同步更新播放地址与档位标签
    const options = info.qualityOptions || []
    let playUrl = info.playUrl
    let quality = qualityLabel(settings.defaultQuality)
    if (options.length > 0) {
      const picked = pickQualityOption(options, settings.defaultQuality)
      playUrl = picked.playUrl
      quality = picked.label
    }
    const task: DownloadTask = {
      id: nanoid(),
      title: info.title || '抖音视频',
      platform: info.platform || '抖音',
      quality,
      size: 0,
      downloaded: 0,
      speed: 0,
      status: 'queued',
      createdAt: Date.now(),
      awemeId: info.awemeId,
      playUrl,
      cover: info.cover || undefined,
      qualityOptions: options.length > 0 ? options : undefined,
      // 解析出来的任务默认不自动下载，等用户点击「下载」才标记 requested
      requested: false,
    }
    set((s) => ({ tasks: [task, ...s.tasks] }))
  },

  setQuality: (id, label) => {
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== id) return t
        const opt = t.qualityOptions?.find((o) => o.label === label)
        if (!opt) return t
        return { ...t, quality: opt.label, playUrl: opt.playUrl }
      }),
    }))
  },

  // 批量入队：主页作品 → 下载任务（queued + requested）。
  // 不自动开始，由页面逐条调用 start(id)；并发槽位不足时由 kickArmed 排队接力。
  enqueueBatch: (posts) => {
    const settings = useSettingsStore.getState()
    const quality = qualityLabel(settings.defaultQuality)
    // 去重：跳过已在下载列表中的作品（含已完成/失败）
    const existingIds = new Set(get().tasks.map((t) => t.awemeId))
    const fresh = posts.filter((p) => !existingIds.has(p.awemeId))
    const created = fresh.map((p): DownloadTask => {
      const id = nanoid()
      return {
        id,
        title: p.desc || '抖音视频',
        platform: '抖音',
        quality,
        size: 0,
        downloaded: 0,
        speed: 0,
        status: 'queued',
        createdAt: Date.now(),
        awemeId: p.awemeId,
        cover: p.cover || undefined,
        requested: true,
      }
    })
    set((s) => ({ tasks: [...created, ...s.tasks] }))
    return created.map((t) => t.id)
  },

  start: async (id) => {
    const task = get().tasks.find((t) => t.id === id)
    if (!task || task.status === 'downloading') return

    // 并发槽位检查：已满则标记为「已请求」，等有空位时自动开始
    const concurrency = useSettingsStore.getState().concurrency || 1
    const active = get().tasks.filter((t) => t.status === 'downloading').length
    if (active >= concurrency) {
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === id ? { ...t, status: 'queued', requested: true } : t,
        ),
      }))
      return
    }

    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, status: 'downloading', requested: true, error: undefined } : t,
      ),
    }))

    try {
      await startDownload({
        taskId: id,
        playUrl: task.playUrl ?? '',
        title: task.title,
        awemeId: task.awemeId,
        platform: task.platform,
        quality: task.quality,
      })
    } catch (e) {
      // 启动失败（如无法建连）→ 置失败，让已请求的任务接力
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === id ? { ...t, status: 'failed', error: String(e), requested: false } : t,
        ),
      }))
      kickArmed()
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
    // 空出的并发槽位让「已请求」的任务接力
    kickArmed()
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
    kickArmed()
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
    // 「全部开始」：把已暂停 + 仍排队的任务都标记为 requested，
    // 让 kickArmed 依次把未下载的任务下载完（受并发数约束）。
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.status === 'paused' || t.status === 'queued'
          ? { ...t, status: 'queued', requested: true, error: undefined }
          : t,
      ),
    }))
    kickArmed()
  },
}))

// 模块加载即订阅事件（下载中心 / 首页都 import 本 store）
initEvents()

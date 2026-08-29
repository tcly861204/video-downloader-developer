import { create } from 'zustand'
import { nanoid } from 'nanoid'

export type TaskStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'failed'

export interface DownloadTask {
  id: string
  title: string
  platform: string
  quality: string
  /** 总大小（字节） */
  size: number
  /** 已下载（字节） */
  downloaded: number
  /** 当前速度（字节/秒） */
  speed: number
  status: TaskStatus
  createdAt: number
}

export type NewTask = Omit<DownloadTask, 'id' | 'downloaded' | 'speed' | 'createdAt'>

export interface ParsedMeta {
  title: string
  platform: string
  quality: string
  size: number
}

interface DownloadState {
  tasks: DownloadTask[]
  /** 首页粘贴后待解析的链接，跳转前写入、下载页消费后清空 */
  pendingUrl: string | null
  addTask: (data: NewTask) => void
  /** 解析结果直接入队并立即开始下载（演示） */
  addParsed: (meta: ParsedMeta) => void
  setPendingUrl: (url: string | null) => void
  /** 演示用：让所有 downloading 任务推进一秒 */
  tick: () => void
  pause: (id: string) => void
  resume: (id: string) => void
  remove: (id: string) => void
  retry: (id: string) => void
  clearCompleted: () => void
  pauseAll: () => void
  resumeAll: () => void
  seed: () => void
}

const MB = 1024 * 1024

const seedTasks: DownloadTask[] = [
  {
    id: nanoid(),
    title: '【4K】城市夜景延时摄影 · 上海',
    platform: '哔哩哔哩',
    quality: '1080P',
    size: 1.9 * 1024 * MB,
    downloaded: 1.18 * 1024 * MB,
    speed: 3.6 * MB,
    status: 'downloading',
    createdAt: Date.now() - 1000 * 60 * 42,
  },
  {
    id: nanoid(),
    title: 'How CPUs Are Made — Full Documentary',
    platform: 'YouTube',
    quality: '1080P',
    size: 1.2 * 1024 * MB,
    downloaded: 210 * MB,
    speed: 5.1 * MB,
    status: 'downloading',
    createdAt: Date.now() - 1000 * 60 * 9,
  },
  {
    id: nanoid(),
    title: '小猫日常 vlog #12',
    platform: '抖音',
    quality: '720P',
    size: 84 * MB,
    downloaded: 84 * MB,
    speed: 0,
    status: 'completed',
    createdAt: Date.now() - 1000 * 60 * 60 * 3,
  },
  {
    id: nanoid(),
    title: 'Lo-fi Beats to Code To (2h Mix)',
    platform: 'YouTube',
    quality: '原画',
    size: 4.6 * 1024 * MB,
    downloaded: 2.1 * 1024 * MB,
    speed: 0,
    status: 'paused',
    createdAt: Date.now() - 1000 * 60 * 60 * 26,
  },
  {
    id: nanoid(),
    title: '街头美食探店 · 第 8 期',
    platform: '快手',
    quality: '720P',
    size: 320 * MB,
    downloaded: 96 * MB,
    speed: 0,
    status: 'failed',
    createdAt: Date.now() - 1000 * 60 * 12,
  },
  {
    id: nanoid(),
    title: '开源视频下载工具原理浅析',
    platform: '哔哩哔哩',
    quality: '原画',
    size: 640 * MB,
    downloaded: 0,
    speed: 0,
    status: 'queued',
    createdAt: Date.now() - 1000 * 30,
  },
]

let demoSeeded = false

export const useDownloadStore = create<DownloadState>((set) => ({
  tasks: [],
  pendingUrl: null,

  addTask: (data) =>
    set((s) => ({
      tasks: [
        ...s.tasks,
        { ...data, id: nanoid(), downloaded: 0, speed: 0, createdAt: Date.now() },
      ],
    })),

  addParsed: (meta) =>
    set((s) => ({
      tasks: [
        ...s.tasks,
        {
          ...meta,
          id: nanoid(),
          downloaded: 0,
          speed: 2.6 * MB,
          status: 'downloading' as const,
          createdAt: Date.now(),
        },
      ],
    })),

  setPendingUrl: (url) => set({ pendingUrl: url }),

  tick: () =>
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.status !== 'downloading') return t
        const downloaded = Math.min(t.downloaded + t.speed, t.size)
        const done = downloaded >= t.size
        return { ...t, downloaded, speed: done ? 0 : t.speed, status: done ? 'completed' : 'downloading' }
      }),
    })),

  pause: (id) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id && t.status === 'downloading' ? { ...t, status: 'paused' as const } : t)),
    })),

  resume: (id) =>
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id && (t.status === 'paused' || t.status === 'queued')
          ? { ...t, status: 'downloading' as const, speed: t.speed || 2 * MB }
          : t,
      ),
    })),

  retry: (id) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id && t.status === 'failed' ? { ...t, status: 'downloading' as const, speed: 2.4 * MB } : t)),
    })),

  remove: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

  clearCompleted: () => set((s) => ({ tasks: s.tasks.filter((t) => t.status !== 'completed') })),

  pauseAll: () =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.status === 'downloading' ? { ...t, status: 'paused' as const } : t)),
    })),

  resumeAll: () =>
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.status === 'paused' || t.status === 'queued'
          ? { ...t, status: 'downloading' as const, speed: t.speed || 2 * MB }
          : t,
      ),
    })),

  seed: () => {
    if (demoSeeded) return
    demoSeeded = true
    set({ tasks: seedTasks })
  },
}))

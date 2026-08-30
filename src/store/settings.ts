import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export type Quality = 'original' | '1080' | '720' | '480'
export type FilenameRule = 'title' | 'title-platform' | 'title-quality'

/** 清晰度枚举 → 展示文案（任务行、文件名规则共用） */
export function qualityLabel(q: Quality): string {
  switch (q) {
    case 'original':
      return '原画'
    case '1080':
      return '1080P'
    case '720':
      return '720P'
    case '480':
      return '480P'
  }
}

export interface AppSettings {
  saveDir: string
  defaultQuality: Quality
  concurrency: number
  filenameRule: FilenameRule
  resume: boolean
  proxyEnabled: boolean
  proxyHost: string
  proxyPort: string
  notifyDone: boolean
  notifyFail: boolean
}

const DEFAULTS: AppSettings = {
  saveDir: '',
  defaultQuality: '1080',
  concurrency: 3,
  filenameRule: 'title',
  resume: true,
  proxyEnabled: false,
  proxyHost: '127.0.0.1',
  proxyPort: '7890',
  notifyDone: true,
  notifyFail: true,
}

interface SettingsState extends AppSettings {
  /** 从 Rust 读取用户目录下的配置文件，覆盖当前状态 */
  hydrate: () => Promise<void>
  /** 更新设置并延迟写回磁盘 */
  set: (patch: Partial<AppSettings>) => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function persistSettings(state: AppSettings) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    invoke('save_settings', { settings: state }).catch(() => {
      /* 非 Tauri 环境或写入失败时静默，内存态仍可用 */
    })
  }, 400)
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,

  hydrate: async () => {
    try {
      const s = await invoke<AppSettings>('get_settings')
      set(s)
    } catch {
      /* 读取失败则保持默认值 */
    }
  },

  set: (patch) => {
    set(patch)
    persistSettings({ ...get(), ...patch })
  },
}))

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Quality = 'original' | '1080' | '720' | '480'
export type FilenameRule = 'title' | 'title-platform' | 'title-quality'

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

interface SettingsState extends AppSettings {
  set: (patch: Partial<AppSettings>) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      saveDir: 'C:/Users/Administrator/Videos/拾帧',
      defaultQuality: '1080',
      concurrency: 3,
      filenameRule: 'title',
      resume: true,
      proxyEnabled: false,
      proxyHost: '127.0.0.1',
      proxyPort: '7890',
      notifyDone: true,
      notifyFail: true,
      set: (patch) => set(patch),
    }),
    { name: 'framecatch-settings' },
  ),
)

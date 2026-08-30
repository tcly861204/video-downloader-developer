/**
 * 后端命令封装（与 src-tauri/src/commands/video.rs 对齐）
 *
 * 前端唯一允许直接调用 invoke 的地方；字段统一 camelCase，
 * 与 Rust 侧 `#[serde(rename_all = "camelCase")]` 一一对应。
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

/** 解析出的视频元信息 */
export interface VideoInfo {
  awemeId: string
  title: string
  desc: string
  author: string
  durationMs: number
  cover: string
  playUrl: string
}

/** 下载进度事件负载 */
export interface DownloadProgress {
  taskId: string
  downloaded: number
  total: number
}

/** 下载完成事件负载 */
export interface DownloadDone {
  taskId: string
  path: string
}

/** 下载失败事件负载 */
export interface DownloadError {
  taskId: string
  error: string
}

/** 启动下载所需参数 */
export interface StartDownloadParams {
  taskId: string
  playUrl: string
  title: string
  awemeId: string
  platform: string
  quality: string
}

/** 解析分享文本/链接 */
export function parseVideo(text: string): Promise<VideoInfo> {
  return invoke<VideoInfo>('parse_video', { text })
}

/** 启动后台下载任务（立即返回，进度走事件） */
export function startDownload(p: StartDownloadParams): Promise<void> {
  return invoke('start_download', {
    taskId: p.taskId,
    playUrl: p.playUrl,
    title: p.title,
    awemeId: p.awemeId,
    platform: p.platform,
    quality: p.quality,
  })
}

/** 暂停下载任务（中断网络请求，保留 .part 临时文件） */
export function cancelDownload(taskId: string): Promise<void> {
  return invoke('cancel_download', { taskId })
}

/** 订阅下载进度事件，返回取消监听函数 */
export function onDownloadProgress(cb: (p: DownloadProgress) => void): Promise<UnlistenFn> {
  return listen<DownloadProgress>('download-progress', (e) => cb(e.payload))
}

/** 订阅下载完成事件 */
export function onDownloadDone(cb: (p: DownloadDone) => void): Promise<UnlistenFn> {
  return listen<DownloadDone>('download-done', (e) => cb(e.payload))
}

/** 订阅下载失败事件 */
export function onDownloadError(cb: (p: DownloadError) => void): Promise<UnlistenFn> {
  return listen<DownloadError>('download-error', (e) => cb(e.payload))
}

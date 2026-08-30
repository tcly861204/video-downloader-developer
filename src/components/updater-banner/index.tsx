import { useEffect, useRef, useState } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import styles from './index.module.scss'

type BannerState =
  | { kind: 'idle' }
  | { kind: 'available' }
  | { kind: 'downloading'; percent: number | null }
  | { kind: 'error'; message: string }

const UpdaterBanner = () => {
  const [state, setState] = useState<BannerState>({ kind: 'idle' })
  const [visible, setVisible] = useState(false)
  const updateRef = useRef<Update | null>(null)
  const bytes = useRef({ downloaded: 0, total: 0 })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const update = await check()
        if (!cancelled && update) {
          updateRef.current = update
          setState({ kind: 'available' })
          setVisible(true)
        }
      } catch {
        // 非 Tauri 环境 / 尚无 release(404) / 网络异常：静默忽略
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const install = async () => {
    const update = updateRef.current
    if (!update) return
    bytes.current = { downloaded: 0, total: 0 }
    setState({ kind: 'downloading', percent: 0 })
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          bytes.current.total = event.data.contentLength ?? 0
        } else if (event.event === 'Progress') {
          bytes.current.downloaded += event.data.chunkLength
          const { downloaded, total } = bytes.current
          const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null
          setState({ kind: 'downloading', percent })
        }
      })
      await relaunch()
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  if (!visible) return null

  const update = updateRef.current
  const title =
    state.kind === 'available'
      ? '发现新版本，建议立即更新'
      : state.kind === 'downloading'
        ? '正在下载更新'
        : state.kind === 'error'
          ? '更新失败'
          : ''
  const sub =
    state.kind === 'available'
      ? '点击立即更新获取新功能与问题修复'
      : state.kind === 'error'
        ? state.message
        : ''

  return (
    <aside className={styles.banner} role='status' aria-live='polite'>
      <i className={`${styles.corner} ${styles.tl}`} aria-hidden />
      <i className={`${styles.corner} ${styles.tr}`} aria-hidden />
      <i className={`${styles.corner} ${styles.bl}`} aria-hidden />
      <i className={`${styles.corner} ${styles.br}`} aria-hidden />

      <span className={styles.signal} aria-hidden>
        <span className={styles.dot} />
        <span className={styles.meter}>
          <i />
          <i />
          <i />
          <i />
        </span>
      </span>

      <div className={styles.body}>
        <div className={styles.topline}>
          <span className={styles.kicker}>// FIRMWARE SIGNAL</span>
          {update && state.kind !== 'error' && (
            <span className={styles.verdiff}>
              v{update.currentVersion}
              <b>→</b>v{update.version}
            </span>
          )}
        </div>
        <p className={styles.title}>{title}</p>
        {state.kind === 'downloading' ? (
          <div className={styles.progressRow}>
            <div className={styles.track}>
              <div className={styles.fill} style={{ width: `${state.percent ?? 0}%` }} />
            </div>
            <span className={styles.percent}>
              {state.percent !== null ? `${state.percent}%` : '--%'}
            </span>
          </div>
        ) : (
          sub && <p className={styles.sub}>{sub}</p>
        )}
      </div>

      <div className={styles.actions}>
        {state.kind === 'available' && (
          <>
            <button className={styles.primary} onClick={install}>
              立即更新
            </button>
            <button className={styles.ghost} onClick={() => setVisible(false)}>
              稍后
            </button>
          </>
        )}
        {state.kind === 'downloading' && (
          <button className={styles.ghost} disabled>
            下载中
          </button>
        )}
        {state.kind === 'error' && (
          <>
            <button className={styles.primary} onClick={install}>
              重试
            </button>
            <button className={styles.ghost} onClick={() => setVisible(false)}>
              关闭
            </button>
          </>
        )}
      </div>
    </aside>
  )
}

export default UpdaterBanner

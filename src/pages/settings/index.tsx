import { open } from '@tauri-apps/plugin-dialog'
import { useSettingsStore, type FilenameRule, type Quality } from '@/store/settings'
import { Segmented } from '@/components/segmented'
import { SettingRow } from '@/components/setting-row'
import { Stepper } from '@/components/stepper'
import { Toggle } from '@/components/toggle'
import styles from './index.module.scss'

const QUALITY_OPTIONS: { value: Quality; label: string }[] = [
  { value: 'original', label: '原画' },
  { value: '1080', label: '1080P' },
  { value: '720', label: '720P' },
  { value: '480', label: '480P' },
]

const RULE_OPTIONS: { value: FilenameRule; label: string }[] = [
  { value: 'title', label: '标题' },
  { value: 'title-platform', label: '标题+平台' },
  { value: 'title-quality', label: '标题+清晰度' },
]

const Settings = () => {
  const s = useSettingsStore()

  const pickDir = async () => {
    try {
      const dir = await open({ directory: true, multiple: false })
      if (dir) s.set({ saveDir: dir })
    } catch {
      /* 用户取消或非 Tauri 环境，保持原值 */
    }
  }

  return (
    <section className={`s-page ${styles.page}`}>
      <header className={styles.head}>
        <p className='s-kicker'>// CONTROL PANEL</p>
        <h1 className='s-title'>设置</h1>
      </header>
      {/* ===== 下载 ===== */}
      <section className={`s-panel ${styles.panel}`}>
        <header className={styles.panelHead}>
          <span className='s-dot s-dot--amber' aria-hidden />
          <p className={`s-kicker ${styles.kicker}`}>DOWNLOAD</p>
        </header>
        <div className={styles.rows}>
          <SettingRow title='保存目录' desc='视频文件默认存放位置'>
            <div className={styles.dir}>
              <span className={styles.path} title={s.saveDir}>
                {s.saveDir}
              </span>
              <button className='s-btn s-btn--ghost' onClick={pickDir}>
                浏览
              </button>
            </div>
          </SettingRow>

          <SettingRow title='默认清晰度' desc='解析时优先选择的清晰度'>
            <Segmented
              value={s.defaultQuality}
              options={QUALITY_OPTIONS}
              onChange={(v) => s.set({ defaultQuality: v })}
            />
          </SettingRow>

          <SettingRow title='并发下载数' desc='同时进行的下载任务数量'>
            <Stepper
              value={s.concurrency}
              min={1}
              max={5}
              onChange={(v) => s.set({ concurrency: v })}
            />
          </SettingRow>

          <SettingRow title='文件名规则' desc='保存文件的命名格式'>
            <Segmented
              value={s.filenameRule}
              options={RULE_OPTIONS}
              onChange={(v) => s.set({ filenameRule: v })}
            />
          </SettingRow>

          <SettingRow title='断点续传' desc='中断后可从上次进度继续下载'>
            <Toggle on={s.resume} onChange={(v) => s.set({ resume: v })} label='断点续传' />
          </SettingRow>
        </div>
      </section>
      {/* ===== 网络 ===== */}
      <section className={`s-panel ${styles.panel}`}>
        <header className={styles.panelHead}>
          <span className='s-dot s-dot--amber' aria-hidden />
          <p className={`s-kicker ${styles.kicker}`}>NETWORK</p>
        </header>
        <div className={styles.rows}>
          <SettingRow title='使用代理' desc='通过代理服务器访问视频站点'>
            <Toggle
              on={s.proxyEnabled}
              onChange={(v) => s.set({ proxyEnabled: v })}
              label='使用代理'
            />
          </SettingRow>
          <SettingRow title='代理地址' desc='支持 HTTP / SOCKS5'>
            <div className={styles.dir}>
              <input
                className={styles.input}
                value={s.proxyHost}
                disabled={!s.proxyEnabled}
                onChange={(e) => s.set({ proxyHost: e.target.value })}
                spellCheck={false}
                aria-label='代理主机'
              />
              <span className={styles.colon} aria-hidden>
                :
              </span>
              <input
                className={`${styles.input} ${styles.port}`}
                value={s.proxyPort}
                disabled={!s.proxyEnabled}
                onChange={(e) => s.set({ proxyPort: e.target.value })}
                spellCheck={false}
                aria-label='代理端口'
              />
            </div>
          </SettingRow>
        </div>
      </section>
      {/* ===== 通知 ===== */}
      <section className={`s-panel ${styles.panel}`}>
        <header className={styles.panelHead}>
          <span className='s-dot s-dot--amber' aria-hidden />
          <p className={`s-kicker ${styles.kicker}`}>NOTIFICATIONS</p>
        </header>
        <div className={styles.rows}>
          <SettingRow title='下载完成通知' desc='任务完成后弹出系统通知'>
            <Toggle
              on={s.notifyDone}
              onChange={(v) => s.set({ notifyDone: v })}
              label='下载完成通知'
            />
          </SettingRow>
          <SettingRow title='下载失败提醒' desc='任务失败时提醒你处理'>
            <Toggle
              on={s.notifyFail}
              onChange={(v) => s.set({ notifyFail: v })}
              label='下载失败提醒'
            />
          </SettingRow>
        </div>
      </section>
      {/* ===== 关于 ===== */}
      <section className={`s-panel ${styles.panel}`}>
        <header className={styles.panelHead}>
          <span className='s-dot s-dot--ok' aria-hidden />
          <p className={`s-kicker ${styles.kicker}`}>ABOUT</p>
        </header>
        <div className={styles.about}>
          <span className={styles.aboutName}>拾帧 · FRAMECATCH</span>
          <span className={styles.aboutEn}>MULTI-PLATFORM VIDEO DOWNLOADER</span>
          <p className={styles.aboutDesc}>
            把全网的视频收进你的设备。支持 Bilibili、YouTube、抖音、快手、TikTok 等多个平台，
            粘贴链接即可解析、离线珍藏你喜欢的每一帧画面。
          </p>
          <span className={styles.aboutMeta}>V0.1.0 · SIGNAL OK · © 2026</span>
        </div>
      </section>
    </section>
  )
}

export default Settings

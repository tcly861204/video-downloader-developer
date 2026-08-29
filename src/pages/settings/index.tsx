import { useState, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { useSettingsStore, type FilenameRule, type Quality } from '@/store/settings'

function Row({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className='st-row'>
      <div className='st-label'>
        <b>{title}</b>
        {desc && <span className='st-desc'>{desc}</span>}
      </div>
      <div className='st-ctrl'>{children}</div>
    </div>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type='button'
      role='switch'
      aria-checked={on}
      aria-label={label}
      className={on ? 'st-toggle st-toggle-on' : 'st-toggle'}
      onClick={() => onChange(!on)}
    >
      <i aria-hidden />
    </button>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className='st-seg' role='radiogroup'>
      {options.map((o) => (
        <button
          key={o.value}
          type='button'
          role='radio'
          aria-checked={value === o.value}
          className={value === o.value ? 'st-seg-opt st-seg-active' : 'st-seg-opt'}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className='st-stepper'>
      <button type='button' className='st-step-btn' disabled={value <= min} onClick={() => onChange(value - 1)} aria-label='减少'>
        <Minus size={13} />
      </button>
      <span className='st-step-val'>{value}</span>
      <button type='button' className='st-step-btn' disabled={value >= max} onClick={() => onChange(value + 1)} aria-label='增加'>
        <Plus size={13} />
      </button>
    </div>
  )
}

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
  const [browseHint, setBrowseHint] = useState(false)

  return (
    <div className='s-page st-page'>
      <header className='st-head'>
        <p className='s-kicker'>// CONTROL PANEL</p>
        <h1 className='s-title'>设置</h1>
      </header>

      {/* ===== 下载 ===== */}
      <section className='s-panel st-panel'>
        <header className='st-panel-head'>
          <span className='s-dot s-dot--amber' aria-hidden />
          <p className='s-kicker st-kicker'>DOWNLOAD</p>
        </header>
        <div className='st-rows'>
          <Row title='保存目录' desc={browseHint ? '目录选择对话框待接入 Tauri Dialog' : '视频文件默认存放位置'}>
            <div className='st-dir'>
              <span className='st-path' title={s.saveDir}>
                {s.saveDir}
              </span>
              <button className='s-btn s-btn--ghost' onClick={() => setBrowseHint(true)}>
                浏览
              </button>
            </div>
          </Row>

          <Row title='默认清晰度' desc='解析时优先选择的清晰度'>
            <Segmented value={s.defaultQuality} options={QUALITY_OPTIONS} onChange={(v) => s.set({ defaultQuality: v })} />
          </Row>

          <Row title='并发下载数' desc='同时进行的下载任务数量'>
            <Stepper
              value={s.concurrency}
              min={1}
              max={5}
              onChange={(v) => s.set({ concurrency: v })}
            />
          </Row>

          <Row title='文件名规则' desc='保存文件的命名格式'>
            <Segmented value={s.filenameRule} options={RULE_OPTIONS} onChange={(v) => s.set({ filenameRule: v })} />
          </Row>

          <Row title='断点续传' desc='中断后可从上次进度继续下载'>
            <Toggle on={s.resume} onChange={(v) => s.set({ resume: v })} label='断点续传' />
          </Row>
        </div>
      </section>

      {/* ===== 网络 ===== */}
      <section className='s-panel st-panel'>
        <header className='st-panel-head'>
          <span className='s-dot s-dot--amber' aria-hidden />
          <p className='s-kicker st-kicker'>NETWORK</p>
        </header>
        <div className='st-rows'>
          <Row title='使用代理' desc='通过代理服务器访问视频站点'>
            <Toggle on={s.proxyEnabled} onChange={(v) => s.set({ proxyEnabled: v })} label='使用代理' />
          </Row>
          <Row title='代理地址' desc='支持 HTTP / SOCKS5'>
            <div className='st-dir'>
              <input
                className='st-input'
                value={s.proxyHost}
                disabled={!s.proxyEnabled}
                onChange={(e) => s.set({ proxyHost: e.target.value })}
                spellCheck={false}
                aria-label='代理主机'
              />
              <span className='st-colon' aria-hidden>
                :
              </span>
              <input
                className='st-input st-port'
                value={s.proxyPort}
                disabled={!s.proxyEnabled}
                onChange={(e) => s.set({ proxyPort: e.target.value })}
                spellCheck={false}
                aria-label='代理端口'
              />
            </div>
          </Row>
        </div>
      </section>

      {/* ===== 通知 ===== */}
      <section className='s-panel st-panel'>
        <header className='st-panel-head'>
          <span className='s-dot s-dot--amber' aria-hidden />
          <p className='s-kicker st-kicker'>NOTIFICATIONS</p>
        </header>
        <div className='st-rows'>
          <Row title='下载完成通知' desc='任务完成后弹出系统通知'>
            <Toggle on={s.notifyDone} onChange={(v) => s.set({ notifyDone: v })} label='下载完成通知' />
          </Row>
          <Row title='下载失败提醒' desc='任务失败时提醒你处理'>
            <Toggle on={s.notifyFail} onChange={(v) => s.set({ notifyFail: v })} label='下载失败提醒' />
          </Row>
        </div>
      </section>

      {/* ===== 关于 ===== */}
      <section className='s-panel st-panel'>
        <header className='st-panel-head'>
          <span className='s-dot s-dot--ok' aria-hidden />
          <p className='s-kicker st-kicker'>ABOUT</p>
        </header>
        <div className='st-about'>
          <span className='st-about-name'>拾帧 · FRAMECATCH</span>
          <span className='st-about-en'>MULTI-PLATFORM VIDEO DOWNLOADER</span>
          <p className='st-about-desc'>
            把全网的视频收进你的设备。支持 Bilibili、YouTube、抖音、快手、TikTok 等多个平台，
            粘贴链接即可解析、离线珍藏你喜欢的每一帧画面。
          </p>
          <span className='st-about-meta'>V0.1.0 · SIGNAL OK · © 2026</span>
        </div>
      </section>

    </div>
  )
}

export default Settings

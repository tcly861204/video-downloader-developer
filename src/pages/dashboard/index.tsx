import { useState, type CSSProperties, type SubmitEvent as ReactSubmitEvent } from 'react'
import { Archive, ArrowRight, Film, Globe, Link2, Zap, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDownloadStore } from '@/store/download'

const PLATFORMS = ['哔哩哔哩', 'YouTube', '抖音', '快手', 'TikTok', 'Vimeo', 'X · Twitter']

const TICKER = [
  'BILIBILI',
  'YOUTUBE',
  'DOUYIN',
  'KUAISHOU',
  'TIKTOK',
  'VIMEO',
  'X · TWITTER',
  'IQIYI',
  'TENCENT VIDEO',
  'MIGU',
]

const FEATURES: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: Globe, title: '多平台解析', desc: '一站覆盖主流视频站点' },
  { icon: Film, title: '高清原画', desc: '自动匹配最佳清晰度' },
  { icon: Zap, title: '极速下载', desc: '多线程加速一气呵成' },
  { icon: Archive, title: '离线珍藏', desc: '本地存储永不失联' },
]

type Star = { x: number; y: number; r: number; d: number; dur: number; amber?: boolean }

const STARS: Star[] = [
  { x: 28, y: 24, r: 3, d: 0.0, dur: 3.4, amber: true },
  { x: 46, y: 16, r: 2, d: 0.9, dur: 2.8 },
  { x: 64, y: 26, r: 2, d: 1.6, dur: 3.1, amber: true },
  { x: 76, y: 40, r: 3, d: 0.4, dur: 3.8 },
  { x: 70, y: 60, r: 2, d: 2.1, dur: 2.6 },
  { x: 55, y: 70, r: 2, d: 1.2, dur: 3.3, amber: true },
  { x: 40, y: 66, r: 3, d: 0.6, dur: 4.0 },
  { x: 22, y: 52, r: 2, d: 2.5, dur: 2.9 },
  { x: 30, y: 40, r: 2, d: 1.0, dur: 3.5, amber: true },
  { x: 58, y: 46, r: 2, d: 0.2, dur: 3.2 },
  { x: 66, y: 78, r: 2, d: 1.9, dur: 2.7 },
  { x: 34, y: 82, r: 3, d: 2.8, dur: 3.6, amber: true },
  { x: 14, y: 70, r: 2, d: 0.8, dur: 3.0 },
  { x: 84, y: 64, r: 2, d: 1.4, dur: 3.9 },
  { x: 88, y: 34, r: 3, d: 2.3, dur: 2.8 },
  { x: 18, y: 18, r: 2, d: 3.0, dur: 3.3 },
  { x: 50, y: 58, r: 2, d: 0.5, dur: 3.7, amber: true },
  { x: 74, y: 14, r: 2, d: 1.7, dur: 2.9 },
  { x: 40, y: 30, r: 2, d: 2.0, dur: 3.4 },
  { x: 60, y: 84, r: 2, d: 3.2, dur: 3.1 },
]

const reveal = (d: string): CSSProperties => ({ '--d': d }) as CSSProperties

const Dashboard = () => {
  const [link, setLink] = useState('')
  const [hint, setHint] = useState('')
  const navigate = useNavigate()
  const setPendingUrl = useDownloadStore((s) => s.setPendingUrl)

  const handleSubmit = (e: ReactSubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmed = link.trim()
    if (!trimmed) {
      setHint('✦ 请输入一个视频链接')
      return
    }
    setPendingUrl(trimmed)
    navigate('/downloads')
  }

  return (
    <section className='f-root'>
      {/* ===== 信号雷达 ===== */}
      <div className='f-radar' aria-hidden>
        <span className='f-radar-rings' />
        <span className='f-radar-sweep' />
        <span className='f-radar-stars'>
          {STARS.map((s, i) => (
            <i
              key={i}
              className={s.amber ? 'f-star f-star--amber' : 'f-star'}
              style={
                {
                  'left': `${s.x}%`,
                  'top': `${s.y}%`,
                  'width': s.r,
                  'height': s.r,
                  '--d': `${s.d}s`,
                  '--dur': `${s.dur}s`,
                } as CSSProperties
              }
            />
          ))}
        </span>
      </div>
      <div className='f-glow' aria-hidden />

      {/* ===== 主视觉 ===== */}
      <main className='f-hero'>
        <div className='f-hero-inner'>
          <p className='f-kicker f-reveal' style={reveal('80ms')}>
            /// MULTI-PLATFORM VIDEO DOWNLOADER
          </p>

          <h1 className='f-title'>
            <span className='f-line f-reveal' style={reveal('240ms')}>
              你刷到的每一帧，
            </span>
            <span className='f-line f-title-accent f-reveal' style={reveal('420ms')}>
              都值得离线珍藏。
            </span>
          </h1>

          <p className='f-en f-reveal' style={reveal('600ms')}>
            KEEP EVERY FRAME.
          </p>

          <p className='f-sub f-reveal' style={reveal('720ms')}>
            粘贴 Bilibili、YouTube、抖音、快手、TikTok 等平台的视频链接，
            <br className='f-br' />
            一键解析，离线保存到本地设备。
          </p>

          <form className='f-input f-reveal' style={reveal('860ms')} onSubmit={handleSubmit}>
            <Link2 size={18} className='f-input-icon' />
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder='粘贴视频链接，例如 bilibili.com/video/BV…'
              aria-label='视频链接'
              spellCheck={false}
            />
            <button type='submit' className='f-btn'>
              立即下载
              <ArrowRight size={16} strokeWidth={2.4} />
            </button>
          </form>

          <p className='f-hint' role='status'>
            {hint}
          </p>

          <ul className='f-chips f-reveal' style={reveal('1000ms')}>
            {PLATFORMS.map((p) => (
              <li className='f-chip' key={p}>
                <i aria-hidden />
                {p}
              </li>
            ))}
          </ul>

          <ul className='f-feats f-reveal' style={reveal('1140ms')}>
            {FEATURES.map((f) => (
              <li className='f-feat' key={f.title}>
                <f.icon size={19} strokeWidth={2} />
                <span className='f-feat-t'>{f.title}</span>
                <span className='f-feat-d'>{f.desc}</span>
              </li>
            ))}
          </ul>
        </div>
      </main>

      {/* ===== 底部信号流 ===== */}
      <footer className='f-ticker-wrap'>
        <span className='f-ticker-label'>SIGNAL FEED</span>
        <div className='f-ticker'>
          <div className='f-ticker-track'>
            {[0, 1].map((n) => (
              <span className='f-ticker-item' key={n}>
                {TICKER.map((t) => (
                  <span className='f-ticker-text' key={t}>
                    {t} <b>✦</b>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </footer>
    </section>
  )
}

export default Dashboard

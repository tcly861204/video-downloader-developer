import { useState, type CSSProperties, type FormEvent } from 'react'
import {
  Archive,
  ArrowRight,
  Film,
  Globe,
  Link2,
  Zap,
  type LucideIcon,
} from 'lucide-react'

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

const reveal = (d: string): CSSProperties => ({ '--d': d }) as CSSProperties

const Dashboard = () => {
  const [link, setLink] = useState('')
  const [hint, setHint] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setHint(link.trim() ? '✦ 信号已接收 · 解析引擎接入中，敬请期待' : '✦ 请输入一个视频链接')
  }

  return (
    <section className='f-root'>
      {/* ===== 信号雷达 ===== */}
      <div className='f-radar' aria-hidden>
        <span className='f-radar-rings' />
        <span className='f-radar-cross' />
        <span className='f-radar-sweep' />
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

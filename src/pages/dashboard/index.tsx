import { useState, type CSSProperties, type SubmitEvent as ReactSubmitEvent } from 'react'
import { Archive, ArrowRight, Film, Globe, Link2, Zap, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { RadarField } from '@/components/radar-field'
import { SignalTicker } from '@/components/signal-ticker'
import { useDownloadStore } from '@/store/download'
import styles from './index.module.scss'

const PLATFORMS = [
  '哔哩哔哩',
  'YouTube',
  '抖音',
  '快手',
  '好看视频',
  '微博',
  'TikTok',
  'Vimeo',
  'X · Twitter',
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
    <section className={styles.root}>
      {/* ===== 信号雷达 ===== */}
      <RadarField />
      <div className={styles.glow} aria-hidden />

      {/* ===== 主视觉 ===== */}
      <main className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={`${styles.kicker} ${styles.reveal}`} style={reveal('80ms')}>
            /// MULTI-PLATFORM VIDEO DOWNLOADER
          </p>

          <h1 className={styles.title}>
            <span className={`${styles.line} ${styles.reveal}`} style={reveal('240ms')}>
              你刷到的每一帧，
            </span>
            <span
              className={`${styles.line} ${styles.titleAccent} ${styles.reveal}`}
              style={reveal('420ms')}
            >
              都值得离线珍藏。
            </span>
          </h1>

          <p className={`${styles.en} ${styles.reveal}`} style={reveal('600ms')}>
            KEEP EVERY FRAME.
          </p>

          <p className={`${styles.sub} ${styles.reveal}`} style={reveal('720ms')}>
            粘贴 Bilibili、抖音、快手、好看视频、微博 等平台的视频链接，
            <br className={styles.br} />
            一键解析，离线保存到本地设备。
          </p>

          <form
            className={`${styles.input} ${styles.reveal}`}
            style={reveal('860ms')}
            onSubmit={handleSubmit}
          >
            <Link2 size={18} className={styles.inputIcon} />
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder='粘贴视频链接，例如 bilibili.com/video/BV…'
              aria-label='视频链接'
              spellCheck={false}
            />
            <button type='submit' className={styles.btn}>
              立即下载
              <ArrowRight size={16} strokeWidth={2.4} />
            </button>
          </form>

          <p className={styles.hint} role='status'>
            {hint}
          </p>

          <ul className={`${styles.chips} ${styles.reveal}`} style={reveal('1000ms')}>
            {PLATFORMS.map((p) => (
              <li className={styles.chip} key={p}>
                <i aria-hidden />
                {p}
              </li>
            ))}
          </ul>

          <ul className={`${styles.feats} ${styles.reveal}`} style={reveal('1140ms')}>
            {FEATURES.map((f) => (
              <li className={styles.feat} key={f.title}>
                <f.icon size={19} strokeWidth={2} />
                <span className={styles.featT}>{f.title}</span>
                <span className={styles.featD}>{f.desc}</span>
              </li>
            ))}
          </ul>
        </div>
      </main>

      {/* ===== 底部信号流 ===== */}
      <SignalTicker />
    </section>
  )
}

export default Dashboard

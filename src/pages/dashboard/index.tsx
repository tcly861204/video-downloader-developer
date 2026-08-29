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

      <style>{`
        .f-root {
          position: relative;
          flex: 1;
          min-width: 0;
          min-height: 100%;
          display: flex;
          flex-direction: column;
          padding: 0 clamp(20px, 3vw, 40px);
          box-sizing: border-box;
          color: var(--text);
          font-family: var(--ff-sans);
        }

        /* ---------- 信号雷达 ---------- */
        .f-radar {
          position: absolute;
          left: 50%;
          top: 50%;
          translate: -50% -50%;
          width: min(60vmin, 560px);
          aspect-ratio: 1;
          pointer-events: none;
          opacity: 0.45;
          -webkit-mask: radial-gradient(circle at 50% 50%, #000 55%, transparent 92%);
          mask: radial-gradient(circle at 50% 50%, #000 55%, transparent 92%);
        }
        .f-radar-rings {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: repeating-radial-gradient(
            circle at 50% 50%,
            transparent 0 calc(20% - 1px),
            rgba(148, 163, 190, 0.1) calc(20% - 1px) 20%
          );
        }
        .f-radar-cross {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background:
            linear-gradient(rgba(148, 163, 190, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 190, 0.1) 1px, transparent 1px);
          background-size: 100% 50%, 50% 100%;
          background-position: 50% 50%, 50% 50%;
          background-repeat: no-repeat;
        }
        .f-radar-sweep {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: conic-gradient(
            from 0deg,
            rgba(255, 176, 58, 0.28),
            rgba(255, 176, 58, 0) 75deg
          );
          animation: f-sweep 7s linear infinite;
        }
        .f-radar::after {
          content: '';
          position: absolute;
          left: 50%;
          top: 50%;
          width: 6px;
          height: 6px;
          translate: -50% -50%;
          border-radius: 50%;
          background: var(--amber);
          box-shadow: 0 0 12px 2px rgba(255, 176, 58, 0.5);
        }
        @keyframes f-sweep {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .f-glow {
          position: absolute;
          left: 50%;
          top: 40%;
          translate: -50% -50%;
          width: min(56vw, 760px);
          height: min(38vw, 440px);
          pointer-events: none;
          background: radial-gradient(closest-side, rgba(255, 176, 58, 0.09), transparent 70%);
        }

        /* ---------- 主视觉 ---------- */
        .f-hero {
          position: relative;
          z-index: 2;
          flex: 1;
          min-height: 0;
          min-width: 0;
          display: flex;
        }
        .f-hero-inner {
          margin: auto;
          width: min(100%, 640px);
          max-width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: clamp(14px, 1.6vh, 22px);
          padding: 20px 0;
        }

        .f-kicker {
          display: flex;
          align-items: center;
          gap: 12px;
          font-family: var(--ff-mono);
          font-size: clamp(11px, 1vw, 13px);
          letter-spacing: 0.3em;
          color: var(--amber);
        }
        .f-kicker::before,
        .f-kicker::after {
          content: '';
          width: clamp(28px, 4vw, 60px);
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255, 176, 58, 0.55));
        }
        .f-kicker::after { transform: scaleX(-1); }

        .f-title {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin: 4px 0 0;
          max-width: 100%;
          font-family: var(--ff-serif);
        }
        .f-line {
          font-size: clamp(30px, 5.8vw, 72px);
          font-weight: 900;
          line-height: 1.16;
          letter-spacing: 0.03em;
          color: var(--text);
        }
        .f-title-accent {
          position: relative;
          color: var(--amber);
          text-shadow: 0 0 34px rgba(255, 176, 58, 0.35);
        }
        .f-title-accent::after {
          content: '';
          position: absolute;
          left: 2%;
          right: 2%;
          bottom: 0.02em;
          height: 0.09em;
          border-radius: 2px;
          background: linear-gradient(
            90deg,
            rgba(255, 176, 58, 0),
            var(--amber) 18% 82%,
            rgba(255, 176, 58, 0)
          );
          transform-origin: center;
          animation: f-draw 0.8s cubic-bezier(0.6, 0.05, 0.2, 1) 1.35s both;
        }
        @keyframes f-draw {
          from { transform: scaleX(0); opacity: 0; }
          to { transform: scaleX(1); opacity: 1; }
        }

        .f-en {
          margin-right: -0.42em;
          max-width: 100%;
          font-family: 'Anton', 'Arial Narrow', sans-serif;
          font-size: clamp(16px, 2.2vw, 30px);
          letter-spacing: 0.42em;
          text-transform: uppercase;
          color: transparent;
          -webkit-text-stroke: 1px rgba(148, 163, 190, 0.55);
        }

        .f-sub {
          max-width: 620px;
          font-size: clamp(13px, 1.3vw, 15px);
          line-height: 1.9;
          color: var(--muted);
        }
        .f-br { display: none; }
        @media (max-width: 720px) {
          .f-br { display: inline; }
        }

        /* ---------- 输入区 ---------- */
        .f-input {
          position: relative;
          display: flex;
          align-items: center;
          gap: 8px;
          width: min(560px, 100%);
          height: 60px;
          margin-top: 6px;
          padding: 6px 6px 6px 18px;
          border: 1px solid rgba(148, 163, 190, 0.22);
          border-radius: 14px;
          background: rgba(12, 17, 27, 0.72);
          backdrop-filter: blur(10px);
          transition: border-color 0.25s, box-shadow 0.25s;
        }
        .f-input:focus-within {
          border-color: rgba(255, 176, 58, 0.55);
          box-shadow:
            0 0 0 4px rgba(255, 176, 58, 0.1),
            0 0 30px rgba(255, 176, 58, 0.12);
        }
        .f-input-icon { flex: none; color: var(--faint); }
        .f-input input {
          flex: 1;
          min-width: 0;
          border: none;
          outline: none;
          background: transparent;
          color: var(--text);
          font-size: 15px;
          font-family: inherit;
          user-select: text;
        }
        .f-input input::placeholder { color: var(--faint); }

        .f-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 46px;
          flex: none;
          padding: 0 22px;
          border: none;
          border-radius: 10px;
          background: linear-gradient(135deg, var(--amber-2), var(--amber));
          color: #1a1208;
          font-weight: 700;
          font-size: 15px;
          letter-spacing: 0.04em;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(255, 176, 58, 0.28);
          transition: transform 0.18s, box-shadow 0.25s, filter 0.25s;
        }
        .f-btn:hover {
          transform: translateY(-1px);
          filter: brightness(1.06);
          box-shadow: 0 12px 30px rgba(255, 176, 58, 0.38);
        }
        .f-btn:active { transform: translateY(0); }
        .f-btn:focus-visible {
          outline: 2px solid var(--amber);
          outline-offset: 2px;
        }

        .f-hint {
          min-height: 18px;
          font-family: var(--ff-mono);
          font-size: 12px;
          letter-spacing: 0.06em;
          color: var(--amber);
        }

        /* ---------- 平台徽章 ---------- */
        .f-chips {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 10px;
          margin-top: 2px;
          padding: 0;
          list-style: none;
        }
        .f-chip {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 6px 14px;
          border: 1px solid rgba(148, 163, 190, 0.18);
          border-radius: 999px;
          font-size: 13px;
          color: var(--muted);
          background: rgba(148, 163, 190, 0.05);
          transition: border-color 0.2s, color 0.2s, transform 0.2s;
        }
        .f-chip i {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--amber);
          box-shadow: 0 0 8px rgba(255, 176, 58, 0.6);
        }
        .f-chip:hover {
          transform: translateY(-2px);
          border-color: rgba(255, 176, 58, 0.4);
          color: var(--text);
        }

        /* ---------- 特性 ---------- */
        .f-feats {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: clamp(20px, 3.4vw, 46px);
          margin-top: 10px;
          padding: 0;
          list-style: none;
        }
        .f-feat {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          min-width: 100px;
        }
        .f-feat svg { color: var(--amber); }
        .f-feat-t { font-size: 13px; font-weight: 600; letter-spacing: 0.05em; }
        .f-feat-d { font-size: 11px; color: var(--faint); letter-spacing: 0.02em; }

        /* ---------- 底部信号流 ---------- */
        .f-ticker-wrap {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 18px;
          min-width: 0;
          max-width: 100%;
          border-top: 1px solid var(--line);
          padding: 14px 0 20px;
        }
        .f-ticker-label {
          flex: none;
          font-family: var(--ff-mono);
          font-size: 10px;
          letter-spacing: 0.24em;
          color: var(--amber);
        }
        .f-ticker {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          -webkit-mask: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
          mask: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
        }
        .f-ticker-track {
          display: flex;
          width: max-content;
          animation: f-tick 30s linear infinite;
        }
        .f-ticker-item { display: flex; }
        .f-ticker-text {
          display: flex;
          align-items: center;
          font-family: var(--ff-mono);
          font-size: 11px;
          letter-spacing: 0.3em;
          white-space: nowrap;
          color: var(--faint);
        }
        .f-ticker-text b {
          margin: 0 14px;
          font-weight: 400;
          color: rgba(255, 176, 58, 0.8);
        }
        @keyframes f-tick {
          to { transform: translateX(-50%); }
        }

        /* ---------- 入场动效 ---------- */
        .f-reveal {
          opacity: 0;
          animation: f-rise 0.7s cubic-bezier(0.22, 0.9, 0.28, 1) var(--d, 0ms) both;
        }
        @keyframes f-rise {
          from { opacity: 0; transform: translateY(16px); filter: blur(6px); }
          to { opacity: 1; transform: none; filter: blur(0); }
        }

        /* ---------- 矮窗口紧凑适配 ---------- */
        @media (max-height: 700px) {
          .f-hero-inner { gap: 10px; padding: 12px 0; }
          .f-line { font-size: clamp(28px, 5.4vw, 52px); }
          .f-en { font-size: 18px; margin-right: -0.42em; }
          .f-sub { font-size: 12px; line-height: 1.7; }
          .f-input { height: 50px; margin-top: 2px; }
          .f-btn { height: 40px; }
          .f-hint { min-height: 16px; font-size: 11px; }
          .f-chips { gap: 8px; margin-top: 0; }
          .f-chip { padding: 4px 11px; font-size: 12px; }
          .f-feats { gap: 22px; margin-top: 6px; }
          .f-feat { min-width: 88px; gap: 4px; }
          .f-feat-d { font-size: 10px; }
          .f-ticker-wrap { padding: 10px 0 14px; }
        }

        /* ---------- 窄窗口紧凑适配 ---------- */
        @media (max-width: 640px) {
          .f-root { padding: 0 18px; }
          .f-kicker { font-size: 10px; letter-spacing: 0.2em; gap: 8px; }
          .f-kicker::before,
          .f-kicker::after { width: 18px; }
          .f-line { font-size: clamp(28px, 7vw, 44px); }
          .f-en { letter-spacing: 0.32em; }
          .f-chips { gap: 7px; }
          .f-chip { padding: 5px 10px; font-size: 12px; }
          .f-ticker-label { display: none; }
          .f-glow { width: 90vw; }
        }
        @media (max-width: 400px) {
          .f-line { font-size: clamp(24px, 8vw, 32px); }
          .f-input { height: 52px; padding-left: 12px; }
          .f-btn { padding: 0 14px; }
          .f-feats { gap: 16px; }
          .f-feat { min-width: 76px; }
        }

        /* ---------- 减少动效 ---------- */
        @media (prefers-reduced-motion: reduce) {
          .f-radar-sweep,
          .f-ticker-track,
          .f-title-accent::after {
            animation: none !important;
          }
          .f-reveal {
            animation: none !important;
            opacity: 1 !important;
            filter: none !important;
          }
          .f-btn,
          .f-chip {
            transition: none;
          }
        }
      `}</style>
    </section>
  )
}

export default Dashboard

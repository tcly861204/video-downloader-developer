import { NavLink, Outlet } from 'react-router-dom'
import { House, MonitorDown, RadioTower, Settings, type LucideIcon } from 'lucide-react'

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: '首页', icon: House, end: true },
  { to: '/downloads', label: '下载', icon: MonitorDown },
  { to: '/settings', label: '设置', icon: Settings },
]

const Layout = () => {
  return (
    <section className='s-shell'>
      {/* ===== 共享背景层 ===== */}
      <div className='s-bg-grid' aria-hidden />
      <div className='s-bg-noise' aria-hidden />
      <div className='s-vignette' aria-hidden />

      {/* ===== 左侧栏 ===== */}
      <aside className='s-side'>
        <div className='s-brand'>
          <span className='s-logo'>
            <RadioTower size={19} strokeWidth={2.2} />
          </span>
          <span className='s-brand-text'>
            <b>拾帧</b>
            <i>FRAMECATCH</i>
          </span>
        </div>

        <p className='s-nav-label'>CHANNELS</p>
        <nav className='s-nav'>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => (isActive ? 's-nav-item s-nav-active' : 's-nav-item')}
            >
              <Icon size={17} strokeWidth={2} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className='s-side-foot'>
          <span className='s-dot s-dot--ok' />
          <span>SIGNAL OK</span>
          <span className='s-side-sep' aria-hidden />
          <span>V0.1.0</span>
        </div>
      </aside>

      {/* ===== 内容区 ===== */}
      <main className='s-main'>
        <Outlet />
      </main>

      <style>{`
        .s-shell {
          position: relative;
          height: 100%;
          width: 100%;
          display: flex;
          overflow: hidden;
          background: radial-gradient(120% 95% at 50% -8%, #111a2b 0%, #0a0e15 55%, #070a10 100%);
          color: var(--text);
          font-family: var(--ff-sans);
        }

        /* ---------- 背景层 ---------- */
        .s-bg-grid {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image:
            linear-gradient(rgba(148, 163, 190, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 190, 0.05) 1px, transparent 1px);
          background-size: 44px 44px;
          -webkit-mask: radial-gradient(120% 100% at 50% 0%, #000 30%, transparent 78%);
          mask: radial-gradient(120% 100% at 50% 0%, #000 30%, transparent 78%);
        }
        .s-bg-noise {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.04;
          mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E");
        }
        .s-vignette {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(130% 110% at 50% 42%, transparent 55%, rgba(0, 0, 0, 0.45) 100%);
        }
        /* ---------- 侧栏 ---------- */
        .s-side {
          position: relative;
          z-index: 2;
          flex: none;
          width: 220px;
          display: flex;
          flex-direction: column;
          padding: 22px 14px 18px;
          border-right: 1px solid var(--line);
          background: rgba(8, 12, 20, 0.55);
          backdrop-filter: blur(10px);
        }
        .s-brand { display: flex; align-items: center; gap: 12px; padding: 0 6px; }
        .s-logo {
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          border: 1px solid rgba(255, 176, 58, 0.5);
          border-radius: 10px;
          color: var(--amber);
          background: rgba(255, 176, 58, 0.08);
          box-shadow: inset 0 0 16px rgba(255, 176, 58, 0.12);
        }
        .s-brand-text { display: flex; flex-direction: column; gap: 2px; }
        .s-brand-text b { font-size: 16px; font-weight: 800; letter-spacing: 0.08em; line-height: 1; }
        .s-brand-text i {
          font-style: normal;
          font-family: var(--ff-mono);
          font-size: 9px;
          letter-spacing: 0.24em;
          color: var(--muted);
        }

        .s-nav-label {
          margin: 22px 8px 8px;
          font-family: var(--ff-mono);
          font-size: 9px;
          letter-spacing: 0.26em;
          color: var(--faint);
        }
        .s-nav { display: flex; flex-direction: column; gap: 5px; }
        .s-nav-item {
          position: relative;
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 10px 12px;
          border: 1px solid transparent;
          border-radius: 10px;
          color: var(--muted);
          font-size: 14px;
          letter-spacing: 0.04em;
          text-decoration: none;
          transition: color 0.18s, background 0.18s, border-color 0.18s;
        }
        .s-nav-item:hover { color: var(--text); background: rgba(148, 163, 190, 0.06); }
        .s-nav-active,
        .s-nav-active:hover {
          color: var(--amber);
          background: rgba(255, 176, 58, 0.07);
          border-color: rgba(255, 176, 58, 0.2);
        }
        .s-nav-active::before {
          content: '';
          position: absolute;
          left: -1px;
          top: 22%;
          bottom: 22%;
          width: 2px;
          border-radius: 2px;
          background: var(--amber);
          box-shadow: 0 0 8px rgba(255, 176, 58, 0.6);
        }
        .s-nav-item:focus-visible { outline: 2px solid var(--amber); outline-offset: 1px; }

        .s-side-foot {
          margin-top: auto;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 14px 6px 0;
          border-top: 1px solid var(--line);
          font-family: var(--ff-mono);
          font-size: 9px;
          letter-spacing: 0.16em;
          color: var(--faint);
        }
        .s-side-sep { width: 1px; height: 10px; background: rgba(148, 163, 190, 0.3); }

        /* ---------- 内容区 ---------- */
        .s-main {
          position: relative;
          z-index: 2;
          flex: 1;
          min-width: 0;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        @media (max-width: 720px) {
          .s-side { width: 176px; padding: 18px 10px 14px; }
          .s-brand-text i { display: none; }
          .s-nav-item { padding: 9px 10px; font-size: 13px; }
        }
      `}</style>
    </section>
  )
}

export default Layout

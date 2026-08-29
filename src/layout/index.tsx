import { NavLink, Outlet } from 'react-router-dom'
import { House, LogIn, MonitorDown, RadioTower, Settings, type LucideIcon } from 'lucide-react'

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: '首页', icon: House, end: true },
  { to: '/downloads', label: '下载', icon: MonitorDown },
  { to: '/settings', label: '设置', icon: Settings },
  { to: '/login', label: '登录', icon: LogIn },
]

const Layout = () => {
  return (
    <section className='s-shell'>
      {/* ===== 共享背景层 ===== */}
      <div className='s-bg-grid' aria-hidden />
      <div className='s-bg-noise' aria-hidden />
      <div className='s-vignette' aria-hidden />

      {/* ===== 顶部导航 ===== */}
      <header className='s-top'>
        <div className='s-brand'>
          <span className='s-logo'>
            <RadioTower size={18} strokeWidth={2.2} />
          </span>
          <span className='s-brand-text'>
            <b>拾帧</b>
            <i>FRAMECATCH</i>
          </span>
        </div>
        <div className='s-navside'>
          <nav className='s-nav' aria-label='主导航'>
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => (isActive ? 's-nav-item s-nav-active' : 's-nav-item')}
              >
                <Icon size={16} strokeWidth={2} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* ===== 内容区 ===== */}
      <main className='s-main'>
        <Outlet />
      </main>
    </section>
  )
}

export default Layout

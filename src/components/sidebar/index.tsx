import { NavLink } from 'react-router-dom'
import { House, MonitorDown, Settings, type LucideIcon } from 'lucide-react'
import styles from './index.module.scss'
const NAV: {
  to: string
  key: string
  label: string
  en: string
  icon: LucideIcon
  end?: boolean
}[] = [
  { to: '/', key: 'home', label: '首页', en: 'HOME', icon: House, end: true },
  { to: '/downloads', key: 'download', label: '下载', en: 'DOWNLOADS', icon: MonitorDown },
  { to: '/settings', key: 'setting', label: '设置', en: 'SETTINGS', icon: Settings },
  // { to: '/login', key: 'login', label: '登录', en: 'SIGN IN', icon: LogIn },
]
export const Sidebar = () => {
  return (
    <nav className={styles.sidebar} aria-label='主导航'>
      <ul className={styles.list}>
        {NAV.map((item) => {
          return (
            <li key={item.key}>
              <NavLink
                to={item.to}
                end={item.end}
                aria-label={item.label}
                className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}
              >
                <i className={styles.ind} aria-hidden />
                <item.icon size={17} strokeWidth={1.8} aria-hidden />
                <span className={styles.tip}>{item.label}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

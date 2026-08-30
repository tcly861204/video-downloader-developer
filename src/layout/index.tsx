import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Header } from '@/components/header'
import { Sidebar } from '@/components/sidebar'
import { Background } from '@/components/background'
import { useSettingsStore } from '@/store/settings'
import styles from './index.module.scss'
const Layout = () => {
  const local = useLocation()

  useEffect(() => {
    useSettingsStore.getState().hydrate()
  }, [])

  return (
    <section className={styles.layout}>
      {/* ===== 共享背景层 ===== */}
      <Background />
      {/* ===== 顶部导航 ===== */}
      <Header />
      {/* ===== 内容区 ===== */}
      <section className='flex-1 flex'>
        {local.pathname === '/' || local.pathname === '/login' ? null : <Sidebar />}
        <main className={styles.main}>
          <Outlet />
        </main>
      </section>
    </section>
  )
}

export default Layout

import { Outlet, useLocation } from 'react-router-dom'
import { Header } from '@/components/header'
import { Sidebar } from '@/components/sidebar'
const Layout = () => {
  const local = useLocation()
  return (
    <section className='s-shell'>
      {/* ===== 共享背景层 ===== */}
      <div className='s-bg-grid' aria-hidden />
      <div className='s-bg-noise' aria-hidden />
      <div className='s-vignette' aria-hidden />
      {/* ===== 顶部导航 ===== */}
      <Header />
      {/* ===== 内容区 ===== */}
      <section className='flex-1 flex'>
        {local.pathname === '/' || local.pathname === '/login' ? null : <Sidebar />}
        <main className='s-main'>
          <Outlet />
        </main>
      </section>
    </section>
  )
}

export default Layout

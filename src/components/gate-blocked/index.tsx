import { Ban } from 'lucide-react'
import { exitApp } from '@/api/gate'
import { Background } from '@/components/background'
import styles from './index.module.scss'

/** 全屏封禁遮罩：命中 gate-blocked 事件后替换整棵路由树展示。 */
export const GateBlockedScreen = ({ reason }: { reason: string }) => {
  return (
    <section className={styles.screen}>
      <Background />

      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.icon} aria-hidden>
            <Ban size={26} strokeWidth={1.8} />
          </div>
          <p className={styles.kicker}>/// ACCESS REVOKED</p>
          <h1 className={styles.title}>访问受限</h1>
          <p className={styles.sub}>该设备已被禁止使用本软件，连接已中断。</p>

          <div className={styles.verdict}>
            <span className={styles.verdictTag}>
              <span className='s-dot s-dot--red' aria-hidden />
              SERVER VERDICT
            </span>
            <p className={styles.reason}>{reason}</p>
          </div>

          <div className={styles.meta}>
            <span>SIGNAL LOST</span>
            <span>DEVICE SUSPENDED</span>
          </div>

          <button
            type='button'
            className={styles.exit}
            onClick={() => void exitApp()}
          >
            <Ban size={16} strokeWidth={2.2} />
            退出应用
          </button>
        </div>
      </main>

      <footer className={styles.foot}>
        <span className='s-dot s-dot--red' aria-hidden />
        SIGNAL LOST · ACCESS REVOKED · FRAMECATCH
      </footer>
    </section>
  )
}

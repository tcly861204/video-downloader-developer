import { useEffect, useState, type CSSProperties } from 'react'
import { Power } from 'lucide-react'
import { exitApp } from '@/api/gate'
import { Background } from '@/components/background'
import logo from '@/assets/logo.png'
import styles from './index.module.scss'

/** 信号柱相对高度（%）：断断续续的"失真波形"，其中第 4 根红色抖动表示信号丢失 */
const BAR_HEIGHTS = [18, 46, 28, 64, 82, 34, 22]

const pad = (n: number) => String(n).padStart(2, '0')

/** 全屏封禁遮罩：命中 gate-blocked 事件后替换整棵路由树展示。 */
export const GateBlockedScreen = ({ reason }: { reason: string }) => {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

  return (
    <section className={styles.screen}>
      <Background />

      {/* 幽灵水印 + 雷达搜索脉冲（装饰层） */}
      <div className={styles.ghost} data-text='REVOKED' aria-hidden>
        REVOKED
      </div>
      <div className={styles.pulse} aria-hidden>
        <span />
        <span />
        <span />
      </div>

      {/* 广播台顶栏 */}
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <img src={logo} className={styles.logo} alt='' draggable={false} />
          <span className={styles.brandText}>
            <b>FRAMECATCH</b>
            <i>VIDEO DOWNLOADER</i>
          </span>
        </div>

        <div className={styles.channel}>
          <span className={styles.ch}>CH.00</span>
          <span className={styles.sep} aria-hidden />
          <span>ACCESS REVOKED</span>
        </div>

        <div className={styles.right}>
          <span className={styles.live}>
            <span className='s-dot s-dot--red' aria-hidden />
            SIGNAL LOST
          </span>
          <span className={styles.sep} aria-hidden />
          <span className={styles.clock} aria-live='off'>
            {time}
          </span>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.frame}>
          <i className={styles.c1} aria-hidden />
          <i className={styles.c2} aria-hidden />
          <i className={styles.c3} aria-hidden />
          <i className={styles.c4} aria-hidden />

          {/* 失真的信号柱 */}
          <div className={styles.bars} aria-hidden>
            {BAR_HEIGHTS.map((h, i) => (
              <span
                key={i}
                className={`${styles.bar} ${i === 4 ? styles.barGlitch : ''}`}
                style={{ '--h': `${h}%` } as CSSProperties}
              />
            ))}
          </div>

          <p className={styles.kicker}>/// ACCESS REVOKED</p>
          <h1 className={styles.title}>访问受限</h1>
          <p className={styles.en}>FRAMECATCH · CONNECTION TERMINATED</p>

          <div className={styles.slash} aria-hidden />

          {/* 裁决终端 */}
          <div className={styles.console}>
            <div className={styles.consoleHead}>
              <span className={styles.dots} aria-hidden>
                <i />
                <i />
                <i />
              </span>
              <span className={styles.consoleTitle}>GATE_VERDICT</span>
            </div>
            <p className={styles.reason}>
              <span className={styles.prompt}>›</span>
              <span className={styles.reasonText}>{reason}</span>
              <span className={styles.cursor} aria-hidden />
            </p>
          </div>

          <button type='button' className={styles.exit} onClick={() => void exitApp()}>
            <Power size={15} strokeWidth={2.2} />
            退出应用
          </button>
        </div>
      </main>

      <footer className={styles.foot}>
        <span className='s-dot s-dot--red' aria-hidden />
        SIGNAL LOST · ACCESS REVOKED · FRAMECATCH V0.1.0
      </footer>
    </section>
  )
}

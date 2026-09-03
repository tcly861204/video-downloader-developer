import type { CSSProperties } from 'react'
import { PLATFORMS, SCANNING, SUPPORTED, type PlatformMeta } from '@/lib/platforms'
import styles from './index.module.scss'

const ch = (i: number) => `CH.${String(i + 1).padStart(2, '0')}`

function LockedCard({ p, idx }: { p: PlatformMeta; idx: number }) {
  const Icon = p.icon
  const css = { '--c': p.color } as CSSProperties
  return (
    <li className={styles.card} style={css} data-reveal>
      <div className={styles.cardTop}>
        <span className={styles.ch}>{ch(idx)}</span>
        <span className={styles.lock}>
          <i aria-hidden />
          SIGNAL LOCKED
        </span>
      </div>
      <div className={styles.cardBody}>
        <span className={styles.dial} aria-hidden>
          <Icon size={18} strokeWidth={1.7} />
        </span>
        <span className={styles.id}>
          <span className={styles.name}>{p.name}</span>
          <span className={styles.en}>{p.en}</span>
        </span>
      </div>
      <div className={styles.bar} aria-hidden />
      <p className={styles.desc}>{p.desc}</p>
      <ul className={styles.caps}>
        {p.caps.map((c) => (
          <li key={c}>› {c}</li>
        ))}
      </ul>
    </li>
  )
}

function ScanningCard({ p, idx }: { p: PlatformMeta; idx: number }) {
  const Icon = p.icon
  const css = { '--c': p.color } as CSSProperties
  return (
    <li className={`${styles.card} ${styles.scanCard}`} style={css} data-reveal>
      <div className={styles.cardTop}>
        <span className={styles.ch}>{ch(idx)}</span>
        <span className={styles.scanTag}>
          <i aria-hidden />
          SCANNING
        </span>
      </div>
      <div className={styles.cardBody}>
        <span className={styles.dial} aria-hidden>
          <Icon size={18} strokeWidth={1.7} />
        </span>
        <span className={styles.id}>
          <span className={styles.name}>{p.name}</span>
          <span className={styles.en}>{p.en}</span>
        </span>
      </div>
      <div className={styles.bar} aria-hidden />
      <p className={styles.desc}>{p.desc}</p>
      <ul className={styles.caps}>
        {p.caps.map((c) => (
          <li key={c}>› {c}</li>
        ))}
      </ul>
    </li>
  )
}

const About = () => {
  return (
    <section className={`s-page ${styles.page}`}>
      {/* ===== 页头 ===== */}
      <div className={styles.about}>
        <span className={styles.aboutName}>FRAMECATCH</span>
        <span className={styles.aboutEn}>MULTI-PLATFORM VIDEO DOWNLOADER</span>
        <p className={styles.aboutDesc}>
          把全网的视频收进你的设备。支持 Bilibili、微博、抖音、快手、好看视频 等多个平台，
          粘贴链接即可解析、离线珍藏你喜欢的每一帧画面。
        </p>
      </div>

      {/* ===== 已锁定 ===== */}
      <section className={styles.block}>
        <div className={styles.blockHead}>
          <span className='s-dot s-dot--amber' aria-hidden />
          <h2 className={styles.blockTitle}>SIGNAL LOCKED · 已支持 · {SUPPORTED.length}</h2>
        </div>
        <ul className={styles.grid}>
          {SUPPORTED.map((p, i) => (
            <LockedCard key={p.key} p={p} idx={i} />
          ))}
        </ul>
      </section>

      {/* ===== 扫描中 ===== */}
      <section className={styles.block}>
        <div className={styles.blockHead}>
          <span className='s-dot s-dot--muted' aria-hidden />
          <h2 className={styles.blockTitle}>SCANNING · 规划中 · {SCANNING.length}</h2>
        </div>
        <ul className={`${styles.grid} ${styles.scanGrid}`}>
          {SCANNING.map((p, i) => (
            <ScanningCard key={p.key} p={p} idx={SUPPORTED.length + i} />
          ))}
        </ul>
      </section>

      {/* ===== 免责声明 ===== */}
      <section className={styles.block}>
        <div className={styles.disclaimer} data-reveal>
          <div className={styles.head}>
            <span className='s-dot s-dot--red' aria-hidden />
            <h3>DISCLAIMER · 免责声明</h3>
          </div>
          <div className={styles.entry}>
            <em className={styles.no}>01</em>
            <p className={styles.txt}>
              <b>个人使用许可</b>
              <span>仅供个人学习交流，禁止商业用途与二次分发销售，详见 LICENSE。</span>
            </p>
          </div>
          <div className={styles.entry}>
            <em className={styles.no}>02</em>
            <p className={styles.txt}>
              <b>内容合规</b>
              <span>下载内容请自行确认符合法律法规与平台条款，责任由使用者承担。</span>
            </p>
          </div>
          <div className={styles.entry}>
            <em className={styles.no}>03</em>
            <p className={styles.txt}>
              <b>无关联声明</b>
              <span>与各视频平台无关联、无授权，接口变更可能导致功能失效。</span>
            </p>
          </div>
        </div>
      </section>

      {/* ===== 底部状态 ===== */}
      <footer className={styles.status}>
        <span className='s-dot s-dot--ok' aria-hidden />
        COVERAGE {SUPPORTED.length}/{PLATFORMS.length} · SIGNAL LOCKED · V0.1.0
      </footer>
    </section>
  )
}

export default About

import type { ReactNode } from 'react'
import styles from './index.module.scss'

export function SettingRow({
  title,
  desc,
  children,
}: {
  title: string
  desc?: string
  children: ReactNode
}) {
  return (
    <div className={styles.row}>
      <div className={styles.label}>
        <b>{title}</b>
        {desc && <span className={styles.desc}>{desc}</span>}
      </div>
      <div className={styles.ctrl}>{children}</div>
    </div>
  )
}

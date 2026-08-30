import styles from './index.module.scss'

const STATUS_LINES: [string, string][] = [
  ['STATION', 'FRAMECATCH'],
  ['UPLINK', 'REQUIRED'],
  ['CIPHER', 'AES-256'],
  ['CHANNEL', 'PRIVATE'],
]

export const SignalPanel = () => {
  return (
    <aside className={styles.panel} aria-hidden>
      <div className={styles.radar}>
        <span className={styles.rings} />
        <span className={styles.sweep} />
      </div>
      <ul className={styles.status}>
        {STATUS_LINES.map(([k, v]) => (
          <li key={k}>
            <span className={styles.k}>{k}</span>
            <i className={styles.line} aria-hidden />
            <span className={styles.v}>{v}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}

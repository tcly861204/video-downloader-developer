import styles from './index.module.scss'

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type='button'
      role='switch'
      aria-checked={on}
      aria-label={label}
      className={on ? `${styles.toggle} ${styles.on}` : styles.toggle}
      onClick={() => onChange(!on)}
    >
      <i aria-hidden />
    </button>
  )
}

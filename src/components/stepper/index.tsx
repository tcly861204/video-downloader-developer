import { Minus, Plus } from 'lucide-react'
import styles from './index.module.scss'

export function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div className={styles.stepper}>
      <button
        type='button'
        className={styles.stepBtn}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        aria-label='减少'
      >
        <Minus size={13} />
      </button>
      <span className={styles.stepVal}>{value}</span>
      <button
        type='button'
        className={styles.stepBtn}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        aria-label='增加'
      >
        <Plus size={13} />
      </button>
    </div>
  )
}

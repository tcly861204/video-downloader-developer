import type { CSSProperties } from 'react'
import styles from './index.module.scss'

type Star = { x: number; y: number; r: number; d: number; dur: number; amber?: boolean }

const STARS: Star[] = [
  { x: 28, y: 24, r: 3, d: 0.0, dur: 3.4, amber: true },
  { x: 46, y: 16, r: 2, d: 0.9, dur: 2.8 },
  { x: 64, y: 26, r: 2, d: 1.6, dur: 3.1, amber: true },
  { x: 76, y: 40, r: 3, d: 0.4, dur: 3.8 },
  { x: 70, y: 60, r: 2, d: 2.1, dur: 2.6 },
  { x: 55, y: 70, r: 2, d: 1.2, dur: 3.3, amber: true },
  { x: 40, y: 66, r: 3, d: 0.6, dur: 4.0 },
  { x: 22, y: 52, r: 2, d: 2.5, dur: 2.9 },
  { x: 30, y: 40, r: 2, d: 1.0, dur: 3.5, amber: true },
  { x: 58, y: 46, r: 2, d: 0.2, dur: 3.2 },
  { x: 66, y: 78, r: 2, d: 1.9, dur: 2.7 },
  { x: 34, y: 82, r: 3, d: 2.8, dur: 3.6, amber: true },
  { x: 14, y: 70, r: 2, d: 0.8, dur: 3.0 },
  { x: 84, y: 64, r: 2, d: 1.4, dur: 3.9 },
  { x: 88, y: 34, r: 3, d: 2.3, dur: 2.8 },
  { x: 18, y: 18, r: 2, d: 3.0, dur: 3.3 },
  { x: 50, y: 58, r: 2, d: 0.5, dur: 3.7, amber: true },
  { x: 74, y: 14, r: 2, d: 1.7, dur: 2.9 },
  { x: 40, y: 30, r: 2, d: 2.0, dur: 3.4 },
  { x: 60, y: 84, r: 2, d: 3.2, dur: 3.1 },
]

export const RadarField = () => {
  return (
    <div className={styles.field} aria-hidden>
      <span className={styles.rings} />
      <span className={styles.sweep} />
      <span className={styles.stars}>
        {STARS.map((s, i) => (
          <i
            key={i}
            className={s.amber ? `${styles.star} ${styles.starAmber}` : styles.star}
            style={
              {
                'left': `${s.x}%`,
                'top': `${s.y}%`,
                'width': s.r,
                'height': s.r,
                '--d': `${s.d}s`,
                '--dur': `${s.dur}s`,
              } as CSSProperties
            }
          />
        ))}
      </span>
    </div>
  )
}

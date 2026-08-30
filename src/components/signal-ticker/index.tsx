import styles from './index.module.scss'

const TICKER = [
  'BILIBILI',
  'YOUTUBE',
  'DOUYIN',
  'KUAISHOU',
  'TIKTOK',
  'VIMEO',
  'X · TWITTER',
  'IQIYI',
  'TENCENT VIDEO',
  'MIGU',
]

export const SignalTicker = () => {
  return (
    <footer className={styles.wrap}>
      <span className={styles.label}>SIGNAL FEED</span>
      <div className={styles.ticker}>
        <div className={styles.track}>
          {[0, 1].map((n) => (
            <span className={styles.item} key={n}>
              {TICKER.map((t) => (
                <span className={styles.text} key={t}>
                  {t} <b>✦</b>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
    </footer>
  )
}

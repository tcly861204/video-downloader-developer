import styles from './index.module.scss'
export const Background = () => {
  return (
    <>
      <div className={styles.grid} aria-hidden />
      <div className={styles.noise} aria-hidden />
      <div className={styles.vignette} aria-hidden />
    </>
  )
}

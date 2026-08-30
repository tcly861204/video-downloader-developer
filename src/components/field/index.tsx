import type { InputHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import styles from './index.module.scss'

export function Field({
  label,
  icon: Icon,
  children,
  ...rest
}: {
  label: string
  icon: LucideIcon
  children?: ReactNode
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <div className={styles.input}>
        <Icon size={15} strokeWidth={2} className={styles.icon} />
        <input {...rest} />
        {children}
      </div>
    </label>
  )
}

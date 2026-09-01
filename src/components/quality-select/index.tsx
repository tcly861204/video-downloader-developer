import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import styles from './index.module.scss'

export function QualitySelect({
  value,
  options,
  disabled = false,
  onChange,
}: {
  value: string
  options: { label: string }[]
  disabled?: boolean
  onChange: (label: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [flip, setFlip] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const selectedIndex = Math.max(0, options.findIndex((o) => o.label === value))

  const select = useCallback(
    (label: string) => {
      onChange(label)
      setOpen(false)
      triggerRef.current?.focus()
    },
    [onChange],
  )

  const toggle = () => {
    if (disabled) return
    if (open) {
      setOpen(false)
    } else {
      setActive(selectedIndex)
      setOpen(true)
    }
  }

  // 底部空间不足时向上展开，避免被视口截断
  useLayoutEffect(() => {
    if (!open) return
    const r = panelRef.current?.getBoundingClientRect()
    setFlip(!!r && r.bottom > window.innerHeight - 8)
  }, [open, value])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((i) => Math.min(i + 1, options.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Home') {
        e.preventDefault()
        setActive(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        setActive(options.length - 1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (options[active]) select(options[active].label)
      }
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, active, options, select])

  return (
    <div className={styles.select} ref={rootRef} data-open={open}>
      <button
        ref={triggerRef}
        type='button'
        className={styles.trigger}
        disabled={disabled}
        aria-haspopup='listbox'
        aria-expanded={open}
        aria-label='清晰度'
        onClick={toggle}
      >
        <span>{value}</span>
        <ChevronDown size={12} strokeWidth={2.2} className={styles.caret} />
      </button>
      {open && (
        <div className={flip ? `${styles.panel} ${styles.flip}` : styles.panel} ref={panelRef}>
          <div className={styles.head}>
            <span>QUALITY</span>
            <i className={styles.dot} aria-hidden />
          </div>
          <div className={styles.list} role='listbox' aria-label='清晰度'>
            {options.map((o, i) => {
              const selected = o.label === value
              return (
                <button
                  key={o.label}
                  type='button'
                  role='option'
                  aria-selected={selected}
                  className={
                    [styles.option, selected ? styles.selected : '', i === active ? styles.active : '']
                      .filter(Boolean)
                      .join(' ')
                  }
                  onClick={() => select(o.label)}
                  onMouseEnter={() => setActive(i)}
                >
                  <span>{o.label}</span>
                  <Check size={12} strokeWidth={2.4} className={styles.check} />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

import { getCurrentWindow } from '@tauri-apps/api/window'
import { RadioTower, Minus, Maximize, Minimize, X } from 'lucide-react'
import { useLayoutEffect, useState } from 'react'
import styles from './index.module.scss'
export const Header = () => {
  const [isMaximi, setIsMaximi] = useState<boolean>(false)
  const appWindow = getCurrentWindow()
  useLayoutEffect(() => {
    appWindow.isMaximizable().then((res: boolean) => {
      setIsMaximi(res)
    })
  }, [])
  const minimize = () => appWindow.minimize()
  const toggleMaximize = () =>
    appWindow.toggleMaximize().then(() => {
      setIsMaximi(!isMaximi)
    })
  const close = () => appWindow.hide()
  const startDrag = () => {
    appWindow.startDragging()
  }
  return (
    <header className={styles.header} onMouseDown={startDrag}>
      <div className={styles.brand}>
        <span className={styles.logo}>
          <RadioTower size={16} strokeWidth={2.2} />
        </span>
        <span className={styles.text}>
          <b>拾帧</b>
          <i>FRAMECATCH</i>
        </span>
      </div>
      <div className={styles.navside} onMouseDown={(e) => e.stopPropagation()}>
        <div className='flex gap-3'>
          <Minus
            className='cursor-pointer text-[#666] hover:text-[#aaa]'
            size={16}
            onClick={minimize}
          />
          {isMaximi ? (
            <Minimize
              size={16}
              className='cursor-pointer text-[#666] hover:text-[#aaa]'
              onClick={toggleMaximize}
            />
          ) : (
            <Maximize
              size={16}
              className='cursor-pointer text-[#666] hover:text-[#aaa]'
              onClick={toggleMaximize}
            />
          )}

          <X size={16} className='cursor-pointer text-[#666] hover:text-[#aaa]' onClick={close} />
        </div>
      </div>
    </header>
  )
}

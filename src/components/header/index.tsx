import { getCurrentWindow } from '@tauri-apps/api/window'
import { RadioTower, Minus, Maximize, Minimize, X } from 'lucide-react'
import { useLayoutEffect, useState } from 'react'
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
    <header className='s-top' onMouseDown={startDrag}>
      <div className='s-brand'>
        <span className='s-logo'>
          <RadioTower size={16} strokeWidth={2.2} />
        </span>
        <span className='s-brand-text'>
          <b>拾帧</b>
          <i>FRAMECATCH</i>
        </span>
      </div>
      <div className='s-navside' onMouseDown={(e) => e.stopPropagation()}>
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

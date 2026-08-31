import { useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, useRoutes } from 'react-router-dom'
import 'nprogress/nprogress.css'
import { ackGateBlocked, onGateBlocked, type GateBlockedPayload } from '@/api/gate'
import { GateBlockedScreen } from '@/components/gate-blocked'
import routes from './routes'

const Router = () => {
  const element = useRoutes(routes)
  return element
}

/** 监听后端 gate-blocked 事件；命中封禁时渲染全屏遮罩替换整个应用。 */
const GateGuard = ({ children }: { children: ReactNode }) => {
  const [block, setBlock] = useState<GateBlockedPayload | null>(null)

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let alive = true
    onGateBlocked((p) => {
      if (!alive) return
      void ackGateBlocked()
      setBlock(p)
    }).then((fn) => {
      if (alive) unlisten = fn
      else fn()
    })
    return () => {
      alive = false
      unlisten?.()
    }
  }, [])

  // return <GateBlockedScreen reason={'账号过期'} />
  if (block) return <GateBlockedScreen reason={block.reason} />
  return <>{children}</>
}

const App = () => {
  return (
    <GateGuard>
      <BrowserRouter basename='/'>
        <Router />
      </BrowserRouter>
    </GateGuard>
  )
}

export default App

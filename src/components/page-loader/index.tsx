import { useEffect } from 'react'
import NProgress from 'nprogress'
export function PageLoader() {
  useEffect(() => {
    const id = setTimeout(() => NProgress.start(), 200)
    return () => {
      clearTimeout(id)
      NProgress.done()
    }
  }, [])
  return null
}

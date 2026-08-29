import { Suspense, type LazyExoticComponent, type ComponentType } from 'react'
import { PageLoader } from '../page-loader'
export function Page({ component: Comp }: { component: LazyExoticComponent<ComponentType<any>> }) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Comp />
    </Suspense>
  )
}
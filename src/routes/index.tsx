import { lazy } from 'react'
import type { RouteObject } from 'react-router-dom'
import Layout from '@/layout'
import RequireAuth from '@/components/auth'
import Login from '@/pages/login'
import { Page } from '@/components/page'
import NProgress from 'nprogress'
const Dashboard = lazy(() => import('@/pages/dashboard'))
const Downloads = lazy(() => import('@/pages/downloads'))
const Settings = lazy(() => import('@/pages/settings'))
NProgress.configure({ showSpinner: false })
const AuthLayout = () => (
  <RequireAuth>
    <Layout />
  </RequireAuth>
)
const routes: RouteObject[] = [
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/',
    element: <AuthLayout />,
    children: [
      {
        index: true,
        element: <Page component={Dashboard} />,
      },
      {
        path: 'downloads',
        element: <Page component={Downloads} />,
      },
      {
        path: 'settings',
        element: <Page component={Settings} />,
      },
    ],
  },
]
export default routes

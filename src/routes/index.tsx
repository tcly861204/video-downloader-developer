import { lazy } from 'react'
import type { RouteObject } from 'react-router-dom'
import Layout from '@/layout'
import RequireAuth from '@/components/auth'
import { Page } from '@/components/page'
import NProgress from 'nprogress'
const Dashboard = lazy(() => import('@/pages/dashboard'))
const Downloads = lazy(() => import('@/pages/downloads'))
const Settings = lazy(() => import('@/pages/settings'))
const About = lazy(() => import('@/pages/about'))
const Login = lazy(() => import('@/pages/login'))
NProgress.configure({ showSpinner: false })
const AuthLayout = () => (
  <RequireAuth>
    <Layout />
  </RequireAuth>
)
const routes: RouteObject[] = [
  {
    path: '/',
    element: <AuthLayout />,
    children: [
      {
        index: true,
        element: <Page component={Dashboard} />,
      },
      {
        path: 'login',
        element: <Page component={Login} />,
      },
      {
        path: 'downloads',
        element: <Page component={Downloads} />,
      },
      {
        path: 'settings',
        element: <Page component={Settings} />,
      },
      {
        path: 'about',
        element: <Page component={About} />,
      },
    ],
  },
]
export default routes

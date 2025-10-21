import { lazy } from 'react'
import { createBrowserRouter } from 'react-router'

const Home = lazy(() => import('@/pages/home'))

const router = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
  },
])

export default router

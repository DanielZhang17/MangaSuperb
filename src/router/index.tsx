import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'

const DashboardLayout = lazy(() => import('@/pages/dashboard-layout.tsx'))
const HomePage = lazy(() => import('@/pages/home'))
const IdeasPage = lazy(() => import('@/pages/ideas'))
const ComicsPage = lazy(() => import('@/pages/comics'))
const CharactersPage = lazy(() => import('@/pages/characters'))

const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'ideas', element: <IdeasPage /> },
      { path: 'comics', element: <ComicsPage /> },
      { path: 'characters', element: <CharactersPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

export default router

import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'

const DashboardLayout = lazy(() => import('@/pages/dashboard-layout.tsx'))
const HomePage = lazy(() => import('@/pages/home'))
const IdeasPage = lazy(() => import('@/pages/ideas'))
const ComicsPage = lazy(() => import('@/pages/comics'))
const CharactersPage = lazy(() => import('@/pages/characters'))
const MePage = lazy(() => import('@/pages/me'))
const AuthPage = lazy(() => import('@/pages/auth'))

const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'ideas', element: <IdeasPage /> },
      { path: 'comics', element: <ComicsPage /> },
      { path: 'characters', element: <CharactersPage /> },
      { path: 'me', element: <MePage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
  { path: 'auth', element: <AuthPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
])

export default router

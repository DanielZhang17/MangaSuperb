import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'

import RequireAuth from '@/pages/require-auth'

const DashboardLayout = lazy(() => import('@/pages/dashboard-layout.tsx'))
const HomePage = lazy(() => import('@/pages/home'))
const IdeasPage = lazy(() => import('@/pages/ideas'))
const ComicsPage = lazy(() => import('@/pages/comics'))
const MePage = lazy(() => import('@/pages/me'))
const AuthPage = lazy(() => import('@/pages/auth'))
const CharacterCreatorPage = lazy(() => import('@/pages/create-character'))

export const routes = [
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'ideas', element: (
        <RequireAuth>
          <IdeasPage />
        </RequireAuth>
      ) },
      { path: 'comics', element: (
        <RequireAuth>
          <ComicsPage />
        </RequireAuth>
      ) },
      { path: 'create-character', element: (
        <RequireAuth>
          <CharacterCreatorPage />
        </RequireAuth>
      ) },
      { path: 'me', element: (
        <RequireAuth>
          <MePage />
        </RequireAuth>
      ) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
  { path: 'auth', element: <AuthPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
]

const router = createBrowserRouter(routes)

export default router

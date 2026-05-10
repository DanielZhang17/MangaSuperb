import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { routes } from '../index'

vi.mock('@/pages/auth', () => ({
  default: () => <div>Auth page</div>,
}))

vi.mock('@/pages/dashboard-layout.tsx', () => ({
  default: () => <div>Dashboard layout</div>,
}))

vi.mock('@/components/progress-shelf', () => ({
  ProgressShelf: () => <div>Progress shelf mounted</div>,
  default: () => <div>Progress shelf mounted</div>,
}))

describe('router', () => {
  it('does not mount the progress shelf on the auth route', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/auth'] })

    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Auth page')).toBeInTheDocument()
    expect(screen.queryByText('Progress shelf mounted')).not.toBeInTheDocument()
  })
})

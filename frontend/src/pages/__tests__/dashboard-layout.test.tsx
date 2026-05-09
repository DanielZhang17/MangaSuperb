import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import DashboardLayout from '../dashboard-layout'

vi.mock('@/components/common/operations/mode-toggle', () => ({
  default: () => <div>Mode toggle</div>,
}))

vi.mock('@/components/common/operations/sidebar-toggle', () => ({
  default: () => <div>Sidebar toggle</div>,
}))

vi.mock('@/components/layout/sidebar', () => ({
  DashboardSidebar: () => <div>Sidebar</div>,
}))

vi.mock('@/hooks/use-auto-collapse-sidebar', () => ({
  useAutoCollapseSidebar: vi.fn(),
}))

vi.mock('@/components/progress-shelf', () => ({
  ProgressShelf: () => <div>Progress shelf mounted</div>,
  default: () => <div>Progress shelf mounted</div>,
}))

describe('DashboardLayout', () => {
  it('mounts the floating progress shelf for background jobs', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route index element={<div>Dashboard child</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Progress shelf mounted')).toBeInTheDocument()
  })
})

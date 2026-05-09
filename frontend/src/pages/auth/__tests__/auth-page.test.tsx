import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import toast from 'react-hot-toast'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AuthPage from '../index'

const navigateMock = vi.fn()
const loginMock = vi.fn()
const registerMock = vi.fn()

vi.mock('react-router', () => ({
  useLocation: () => ({ state: null }),
  useNavigate: () => navigateMock,
}))

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    login: loginMock,
    register: registerMock,
    loginState: { isMutating: false },
    registerState: { isMutating: false },
  }),
}))

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(' '),
  proxiedStatic: (url?: string | null) => url || '',
}))

describe('AuthPage', () => {
  beforeEach(() => {
    navigateMock.mockClear()
    loginMock.mockReset()
    registerMock.mockReset()
    vi.mocked(toast.error).mockClear()
  })

  it('shows the backend registration error instead of failing silently', async () => {
    registerMock.mockRejectedValue(new Error('Username already exists'))

    render(<AuthPage />)

    const registerTab = screen.getByRole('tab', { name: 'auth:tabs.register' })
    fireEvent.pointerDown(registerTab, { button: 0, ctrlKey: false })
    fireEvent.mouseDown(registerTab, { button: 0, ctrlKey: false })
    fireEvent.click(registerTab)

    await screen.findByText('auth:title.register')
    fireEvent.change(screen.getByLabelText('auth:form.username'), {
      target: { value: 'tester' },
    })
    fireEvent.change(screen.getByLabelText('auth:form.email'), {
      target: { value: 'tester@example.com' },
    })
    fireEvent.change(screen.getByLabelText('auth:form.password'), {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'auth:submit.register' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Username already exists')
    })
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('shows a toast for client-side registration validation errors', async () => {
    render(<AuthPage />)

    const registerTab = screen.getByRole('tab', { name: 'auth:tabs.register' })
    fireEvent.pointerDown(registerTab, { button: 0, ctrlKey: false })
    fireEvent.mouseDown(registerTab, { button: 0, ctrlKey: false })
    fireEvent.click(registerTab)

    await screen.findByText('auth:title.register')
    fireEvent.change(screen.getByLabelText('auth:form.username'), {
      target: { value: 'tester' },
    })
    fireEvent.change(screen.getByLabelText('auth:form.email'), {
      target: { value: 'tester@example.com' },
    })
    fireEvent.change(screen.getByLabelText('auth:form.password'), {
      target: { value: 'short' },
    })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'auth:submit.register' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('密码至少8位')
    })
    expect(registerMock).not.toHaveBeenCalled()
  })
})

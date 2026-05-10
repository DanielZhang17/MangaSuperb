import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AutoSelectControl } from '../auto-select-control'

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value: vi.fn(() => false),
  })
})

vi.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      'preference.auto': '自动',
    }[key] ?? key),
  }),
}))

describe('AutoSelectControl', () => {
  it('renders auto and manual options and emits preference values', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <AutoSelectControl
        label="Style"
        value={{ mode: 'auto' }}
        options={[
          { value: 'jp', label: 'Japanese' },
          { value: 'us', label: 'American' },
        ]}
        onChange={onChange}
      />,
    )

    expect(screen.getByText('Style')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveTextContent('自动')

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('option', { name: 'Japanese' }))

    expect(onChange).toHaveBeenCalledWith({ mode: 'manual', value: 'jp' })

    rerender(
      <AutoSelectControl
        label="Style"
        value={{ mode: 'manual', value: 'jp' }}
        options={[
          { value: 'jp', label: 'Japanese' },
          { value: 'us', label: 'American' },
        ]}
        onChange={onChange}
      />,
    )

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('option', { name: '自动' }))

    expect(onChange).toHaveBeenCalledWith({ mode: 'auto' })
  })
})

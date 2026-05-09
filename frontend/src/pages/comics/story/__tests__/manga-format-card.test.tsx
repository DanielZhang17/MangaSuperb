import { render, screen } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { describe, expect, it, vi } from 'vitest'

import { aspectRatioAtom } from '../../atoms'
import { MangaFormatCard } from '../manga-format-card'

vi.mock('@/hooks/use-preferences', () => ({
  usePreferences: () => ({
    colorModes: ['black-white', 'color'],
    preferences: {
      version: 2,
      fields: {
        aspect_ratio: { mode: 'manual', value: '3:4' },
        color_mode: { mode: 'manual', value: 'color' },
      },
    },
  }),
}))

describe('MangaFormatCard', () => {
  it('reflects saved format preferences and syncs the aspect ratio atom', () => {
    const store = createStore()

    render(
      <Provider store={store}>
        <MangaFormatCard />
      </Provider>,
    )

    expect(screen.getByRole('combobox', { name: 'Aspect ratio' })).toHaveTextContent('3:4')
    expect(screen.getByRole('combobox', { name: 'Color' })).toHaveTextContent('Color')
    expect(store.get(aspectRatioAtom)).toBe('3:4')
  })
})

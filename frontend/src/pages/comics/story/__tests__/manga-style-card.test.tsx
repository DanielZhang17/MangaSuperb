import { render, screen } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { describe, expect, it, vi } from 'vitest'

import { MangaStyleCard } from '../manga-style-card'

vi.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/hooks/use-preferences', () => ({
  usePreferences: () => ({
    preferences: {
      version: 2,
      style_presets: [
        {
          value: 'manual-style',
          label: 'Manual Style',
          is_custom: true,
        },
      ],
      fields: {
        style: { mode: 'manual', value: 'manual-style' },
      },
    },
  }),
}))

describe('MangaStyleCard', () => {
  it('shows a saved manual style preference instead of Auto', () => {
    render(
      <Provider store={createStore()}>
        <MangaStyleCard />
      </Provider>,
    )

    expect(screen.getByRole('combobox')).toHaveTextContent('Manual Style')
  })
})

import { render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import { describe, expect, it, vi } from 'vitest'

import { AIModelCard } from '../ai-model-card'

vi.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/hooks/use-ai-providers', () => ({
  AI_PROVIDER_LABELS: {
    gemini: 'Gemini',
    third_party: 'Third Party',
  },
  useAiProviders: () => ({
    providers: {
      defaults: { image: 'third_party', text: 'third_party' },
      providers: {
        gemini: { image: true, text: true },
        third_party: { image: true, text: true },
      },
    },
    imageProviders: (globalThis as any).__mockImageProviders ?? ['third_party'],
    textProviders: (globalThis as any).__mockTextProviders ?? ['third_party'],
    loading: false,
  }),
}))

vi.mock('@/hooks/use-preferences', () => ({
  usePreferences: () => ({
    preferences: {
      version: 2,
      fields: {
        text_provider: { mode: 'manual', value: 'gemini' },
      },
    },
  }),
}))

describe('AIModelCard', () => {
  beforeEach(() => {
    ;(globalThis as any).__mockImageProviders = undefined
    ;(globalThis as any).__mockTextProviders = undefined
  })

  it('displays an available fallback when a saved provider is unavailable', () => {
    render(
      <Provider>
        <AIModelCard />
      </Provider>,
    )

    expect(screen.getByRole('combobox')).toHaveTextContent('Third Party')
  })

  it('uses the auto/manual provider select as the only provider control', () => {
    ;(globalThis as any).__mockImageProviders = ['gemini', 'third_party']
    ;(globalThis as any).__mockTextProviders = ['gemini', 'third_party']

    render(
      <Provider>
        <AIModelCard />
      </Provider>,
    )

    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(screen.queryByRole('radio', { name: 'Gemini' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Third Party' })).not.toBeInTheDocument()
  })
})

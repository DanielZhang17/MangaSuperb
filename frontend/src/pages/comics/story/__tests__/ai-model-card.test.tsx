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
        third_party: { image: true, text: true },
      },
    },
    imageProviders: ['third_party'],
    textProviders: ['third_party'],
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
  it('displays an available fallback when a saved provider is unavailable', () => {
    render(
      <Provider>
        <AIModelCard />
      </Provider>,
    )

    expect(screen.getByRole('combobox')).toHaveTextContent('Third Party')
  })
})

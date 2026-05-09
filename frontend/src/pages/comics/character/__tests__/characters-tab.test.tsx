import { render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import { describe, expect, it, vi } from 'vitest'

import { CharactersTab } from '../characters-tab'

vi.mock('../character-upsert-dialog', () => ({
  CharacterUpsertDialog: () => null,
}))

vi.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, options?: any) => options?.count ? `${key}:${options.count}` : key,
  }),
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'owner', email: 'owner@example.com' },
  }),
}))

vi.mock('@/hooks/use-ai-providers', () => ({
  useAiProviders: () => ({
    providers: {
      defaults: { image: 'gemini', text: 'gemini' },
      providers: {
        gemini: { image: true, text: true },
        third_party: { image: false, text: false },
      },
    },
  }),
  AI_PROVIDER_LABELS: {
    gemini: 'Gemini',
    third_party: 'OpenAI',
  },
}))

vi.mock('@/hooks/use-characters', () => ({
  useCharactersList: () => ({
    characters: [
      {
        id: 1,
        user_id: 1,
        name: 'Owned Hero',
        description: 'Owner can edit this character.',
        sex: 'female',
        is_public: false,
        style_prompt: null,
        optimized_description: null,
        image_status: 'completed',
        image_url: null,
        image_job_id: null,
        image_error: null,
        created_at: null,
        updated_at: null,
      },
      {
        id: 2,
        user_id: 2,
        name: 'Shared Hero',
        description: 'Shared public character.',
        sex: 'male',
        is_public: true,
        style_prompt: null,
        optimized_description: null,
        image_status: 'completed',
        image_url: null,
        image_job_id: null,
        image_error: null,
        created_at: null,
        updated_at: null,
      },
    ],
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}))

describe('CharactersTab', () => {
  it('shows shared public characters as selectable but not editable', () => {
    render(
      <Provider>
        <CharactersTab />
      </Provider>,
    )

    expect(screen.getByText('Shared Hero')).toBeInTheDocument()
    expect(screen.getByText('来自公开角色库，只可选择')).toBeInTheDocument()
    expect(screen.getByText('公开')).toBeInTheDocument()
    expect(screen.getByLabelText('编辑 Owned Hero')).toBeInTheDocument()
    expect(screen.queryByLabelText('编辑 Shared Hero')).not.toBeInTheDocument()
  })
})

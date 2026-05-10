import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AutoApi } from '@/apis/auto'
import type { AutoCharacterPrepareResponse } from '@/service/types'

import {
  currentComicOverridesAtom,
  fullStoryAtom,
} from '../atoms'
import ComicsPage from '../index'

vi.mock('@/apis/auto', () => ({
  AutoApi: {
    prepareCharacters: vi.fn(),
  },
}))

vi.mock('../story/story-tab', () => ({
  StoryTab: () => <div>Story workflow</div>,
}))

vi.mock('../character/characters-tab', () => ({
  CharactersTab: () => <div>Characters workflow</div>,
}))

vi.mock('../panels/panels-tab', () => ({
  PanelsTab: () => <div>Panels workflow</div>,
}))

vi.mock('../image-generation/image-generation-tab', () => ({
  ImageGenerationTab: () => <div>Image workflow</div>,
}))

vi.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, options?: any) => ({
      'workflow.auto': 'Auto',
      'workflow.pro': 'Pro',
      'title.create': 'Comic Creation',
      'title.panelsPage': 'Panels',
      'tabs.story': 'Story',
      'tabs.characters': 'Characters',
      'tabs.panels': 'Panels',
      'tabs.imageGeneration': 'Image Gen',
      'panels.generatedShots': `${options?.count ?? 0} shots generated`,
      'auto.title': 'Auto Manga',
      'auto.subtitle': 'Upload or paste a novel to start.',
      'auto.prepareCharacters': 'Prepare characters',
      'auto.preparing': 'Preparing...',
      'auto.openPro': 'Open Pro controls',
      'auto.error.addStory': 'Add a story before preparing characters.',
      'auto.error.prepareFailed': 'Character preparation failed',
      'autoReview.title': 'Character Review',
      'autoReview.badge.created': 'Created',
      'autoReview.badge.reused': 'Reused',
      'autoReview.summary.reused': 'Reused',
      'autoReview.summary.created': 'Created',
      'autoReview.summary.conflicts': 'Conflicts',
      'autoReview.acceptHint': 'Accept prepared characters to use them in the Pro workflow.',
      'autoReview.resolveConflicts': 'Review conflicts before accepting characters.',
      'autoReview.stale': 'Story changed after this review. Prepare characters again before accepting.',
      'autoReview.accept': 'Accept characters',
    }[key] ?? key),
  }),
}))

vi.mock('@/hooks/use-ai-providers', () => ({
  AI_PROVIDER_LABELS: {
    gemini: 'Gemini',
    third_party: 'Third Party',
  },
  useAiProviders: () => ({
    providers: {
      defaults: (globalThis as any).__mockProviderDefaults ?? { image: 'third_party', text: 'third_party' },
      providers: {
        gemini: { image: true, text: true },
        third_party: { image: true, text: true },
      },
    },
    imageProviders: (globalThis as any).__mockImageProviders ?? ['gemini', 'third_party'],
    textProviders: (globalThis as any).__mockTextProviders ?? ['gemini', 'third_party'],
    loading: false,
  }),
}))

vi.mock('@/hooks/use-preferences', () => ({
  usePreferences: () => ({
    preferences: (globalThis as any).__mockPreferences,
    loading: false,
  }),
}))

describe('ComicsPage mode shell', () => {
  const preparedReview: AutoCharacterPrepareResponse = {
    reused: [
      {
        character: {
          id: 9,
          user_id: 1,
          name: 'Prepared Hero',
          description: 'Ready from auto preparation.',
          sex: 'unspecified',
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
        role: 'protagonist',
      },
    ],
    created: [],
    conflicts: [],
    failed: [],
    suggested_roles: { 9: 'protagonist' },
  }

  beforeEach(() => {
    vi.mocked(AutoApi.prepareCharacters).mockReset()
    ;(globalThis as any).__mockPreferences = undefined
    ;(globalThis as any).__mockProviderDefaults = undefined
    ;(globalThis as any).__mockImageProviders = undefined
    ;(globalThis as any).__mockTextProviders = undefined
  })

  it('defaults to Auto mode and switches to the Pro workflow', async () => {
    render(
      <Provider>
        <ComicsPage />
      </Provider>,
    )

    expect(screen.getByRole('tab', { name: 'Auto' })).toHaveAttribute('data-state', 'active')
    expect(screen.getByText('Auto Manga')).toBeInTheDocument()
    expect(screen.queryByText('Story workflow')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Pro' }))

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Pro' })).toHaveAttribute('data-state', 'active')
    })
    expect(screen.getByText('Story workflow')).toBeInTheDocument()
  })

  it('prepares characters from the current story and provider overrides', async () => {
    vi.mocked(AutoApi.prepareCharacters).mockResolvedValue(preparedReview)
    const store = createStore()
    store.set(fullStoryAtom, 'A pilot finds a hidden mech.')
    store.set(currentComicOverridesAtom, {
      image_provider: { mode: 'manual', value: 'third_party' },
      text_provider: { mode: 'manual', value: 'gemini' },
    })

    render(
      <Provider store={store}>
        <ComicsPage />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Prepare characters' }))

    await waitFor(() => {
      expect(AutoApi.prepareCharacters).toHaveBeenCalledWith({
        story: 'A pilot finds a hidden mech.',
        style_preference: 'Classic manga black and white linework.',
        image_provider: 'third_party',
        text_provider: 'gemini',
      })
    })
    expect(await screen.findByText('Character Review')).toBeInTheDocument()
    expect(screen.getByText('Prepared Hero')).toBeInTheDocument()
  })

  it('uses provider defaults in Auto mode without mounting Pro controls', async () => {
    vi.mocked(AutoApi.prepareCharacters).mockResolvedValue(preparedReview)
    const store = createStore()
    store.set(fullStoryAtom, 'A pilot finds a hidden mech.')

    render(
      <Provider store={store}>
        <ComicsPage />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Prepare characters' }))

    await waitFor(() => {
      expect(AutoApi.prepareCharacters).toHaveBeenCalledWith(
        expect.objectContaining({
          image_provider: 'third_party',
          text_provider: 'third_party',
        }),
      )
    })
  })

  it('uses saved style preferences in Auto mode without mounting Pro controls', async () => {
    vi.mocked(AutoApi.prepareCharacters).mockResolvedValue(preparedReview)
    ;(globalThis as any).__mockPreferences = {
      version: 2,
      style_presets: [
        {
          value: 'Saved custom style',
          label: 'Saved custom style',
          is_custom: true,
        },
      ],
      fields: {
        style: { mode: 'manual', value: 'Saved custom style' },
      },
    }
    const store = createStore()
    store.set(fullStoryAtom, 'A pilot finds a hidden mech.')

    render(
      <Provider store={store}>
        <ComicsPage />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Prepare characters' }))

    await waitFor(() => {
      expect(AutoApi.prepareCharacters).toHaveBeenCalledWith(
        expect.objectContaining({
          style_preference: 'Saved custom style',
        }),
      )
    })
  })

  it('falls back when saved provider preferences are not currently available in Auto mode', async () => {
    vi.mocked(AutoApi.prepareCharacters).mockResolvedValue(preparedReview)
    ;(globalThis as any).__mockProviderDefaults = { image: 'third_party', text: 'third_party' }
    ;(globalThis as any).__mockImageProviders = ['third_party']
    ;(globalThis as any).__mockTextProviders = ['third_party']
    ;(globalThis as any).__mockPreferences = {
      version: 2,
      fields: {
        image_provider: { mode: 'manual', value: 'gemini' },
        text_provider: { mode: 'manual', value: 'gemini' },
      },
    }
    const store = createStore()
    store.set(fullStoryAtom, 'A pilot finds a hidden mech.')

    render(
      <Provider store={store}>
        <ComicsPage />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Prepare characters' }))

    await waitFor(() => {
      expect(AutoApi.prepareCharacters).toHaveBeenCalledWith(
        expect.objectContaining({
          image_provider: 'third_party',
          text_provider: 'third_party',
        }),
      )
    })
  })

  it('clears prepared character review when the story changes', async () => {
    vi.mocked(AutoApi.prepareCharacters).mockResolvedValue(preparedReview)
    const store = createStore()
    store.set(fullStoryAtom, 'A pilot finds a hidden mech.')

    render(
      <Provider store={store}>
        <ComicsPage />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Prepare characters' }))

    expect(await screen.findByText('Prepared Hero')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('...'), {
      target: { value: 'A new story replaces the prepared one.' },
    })

    await waitFor(() => {
      expect(screen.queryByText('Prepared Hero')).not.toBeInTheDocument()
    })
  })

  it('lets Auto mode open Pro controls directly', () => {
    render(
      <Provider>
        <ComicsPage />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open Pro controls' }))

    expect(screen.getByRole('tab', { name: 'Pro' })).toHaveAttribute('data-state', 'active')
    expect(screen.getByText('Story workflow')).toBeInTheDocument()
  })
})

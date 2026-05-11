import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AutoRun } from '@/service/types'

import {
  currentComicDetailAtom,
  currentComicIdAtom,
  currentComicOverridesAtom,
  fullStoryAtom,
  mangaTitleAtom,
} from '../atoms'
import ComicsPage from '../index'

const useAutoRunMock = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/use-auto-run', () => ({
  default: useAutoRunMock,
  useAutoRun: useAutoRunMock,
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
      'auto.generateManga': 'Generate manga',
      'auto.generating': 'Generating...',
      'auto.error.addStory': 'Add a story before generating manga.',
      'auto.error.startFailed': 'Auto run failed to start',
      'autoProgress.title': 'Auto run in progress',
      'autoProgress.abort': 'Abort run',
      'autoProgress.progress': `${options?.completed ?? 0} of ${options?.total ?? 0} pages rendered`,
      'autoProgress.stage.story': 'Story',
      'autoProgress.stage.characters': 'Characters',
      'autoProgress.stage.panels': 'Panels',
      'autoProgress.stage.render': 'Render',
      'autoProgress.stage.preview': 'Preview',
      'autoPreview.title': 'Generated manga preview',
      'autoPreview.previewTab': 'Preview',
      'autoPreview.storyTab': 'Story',
      'autoPreview.exportPdf': 'Export PDF',
      'autoPreview.regeneratePage': 'Regenerate current page',
      'autoPreview.noPages': 'Generated pages will appear here.',
      'autoReviewPrompt.title': 'Character review needed',
      'autoReviewPrompt.openPro': 'Open Pro editor',
      'autoRunBanner.title': 'Auto generation is running',
      'autoRunBanner.return': 'Return to Auto progress',
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

function makeAutoRun(overrides: Partial<AutoRun> = {}): AutoRun {
  return {
    id: 42,
    comic_id: 7,
    user_id: 1,
    status: 'running',
    current_stage: 'render',
    story_snapshot: 'A pilot finds a hidden mech.',
    title_snapshot: 'Hidden Mech',
    preferences_snapshot: {},
    character_review: null,
    selected_character_ids: [],
    render_run_id: 88,
    render_run: null,
    render_progress: {
      completed: 2,
      failed: 0,
      total: 5,
      current_page_number: 3,
    },
    abort_requested: false,
    job_id: 'job-auto-42',
    error_message: null,
    created_at: null,
    started_at: null,
    completed_at: null,
    updated_at: null,
    ...overrides,
  }
}

function mockAutoRunState(overrides: Record<string, unknown> = {}) {
  const state = {
    autoRun: null,
    isLoading: false,
    error: null,
    isActive: false,
    needsReview: false,
    isComplete: false,
    startRun: vi.fn(),
    abortRun: vi.fn(),
    retryRun: vi.fn(),
    resolveRun: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  }

  useAutoRunMock.mockReturnValue(state)

  return state
}

describe('ComicsPage mode shell', () => {
  beforeEach(() => {
    useAutoRunMock.mockReset()
    mockAutoRunState()
    ;(globalThis as any).__mockPreferences = undefined
    ;(globalThis as any).__mockProviderDefaults = undefined
    ;(globalThis as any).__mockImageProviders = undefined
    ;(globalThis as any).__mockTextProviders = undefined
  })

  it('defaults to Auto draft mode and switches to the Pro workflow', async () => {
    render(
      <Provider>
        <ComicsPage />
      </Provider>,
    )

    expect(screen.getByRole('tab', { name: 'Auto' })).toHaveAttribute('data-state', 'active')
    expect(screen.getByText('Auto Manga')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate manga' })).toBeInTheDocument()
    expect(screen.queryByText('Story workflow')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Pro' }))

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Pro' })).toHaveAttribute('data-state', 'active')
    })
    expect(screen.getByText('Story workflow')).toBeInTheDocument()
  })

  it('starts an Auto run from the current story and provider preferences', async () => {
    const autoRunState = mockAutoRunState()
    const store = createStore()
    store.set(currentComicIdAtom, 7)
    store.set(mangaTitleAtom, 'Hidden Mech')
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

    fireEvent.click(screen.getByRole('button', { name: 'Generate manga' }))

    await waitFor(() => {
      expect(autoRunState.startRun).toHaveBeenCalledWith({
        comic_id: 7,
        title: 'Hidden Mech',
        story: 'A pilot finds a hidden mech.',
        preferences: {
          image_provider: 'third_party',
          style_description: 'Classic manga black and white linework.',
          text_provider: 'gemini',
        },
      })
    })
  })

  it('shows active Auto progress instead of editing when a run is queued or running', () => {
    mockAutoRunState({
      autoRun: makeAutoRun(),
      isActive: true,
    })

    render(
      <Provider>
        <ComicsPage />
      </Provider>,
    )

    expect(screen.getByText('Auto run in progress')).toBeInTheDocument()
    expect(screen.getByText('Hidden Mech')).toBeInTheDocument()
    expect(screen.getByText('2 of 5 pages rendered')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abort run' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('...')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Generate manga' })).not.toBeInTheDocument()
  })

  it('shows a preview-first completed state with a preview and story switch', () => {
    mockAutoRunState({
      autoRun: makeAutoRun({
        status: 'completed',
        current_stage: 'preview',
        render_progress: {
          completed: 5,
          failed: 0,
          total: 5,
          current_page_number: null,
        },
      }),
      isComplete: true,
    })
    const store = createStore()
    store.set(currentComicDetailAtom, {
      id: 7,
      pdf_url: '/exports/hidden-mech.pdf',
      pages: [
        { id: 2, page_number: 2, image_url: '/static/page-2.png' },
        { id: 1, page_number: 1, image_url: '/static/page-1.png' },
      ],
    } as any)

    render(
      <Provider store={store}>
        <ComicsPage />
      </Provider>,
    )

    expect(screen.getByText('Generated manga preview')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('data-state', 'active')
    expect(screen.getByAltText('Hidden Mech page 1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Export PDF' })).toHaveAttribute('href', '/exports/hidden-mech.pdf')

    fireEvent.click(screen.getByRole('tab', { name: 'Story' }))

    expect(screen.getByText('A pilot finds a hidden mech.')).toBeInTheDocument()
  })

  it('shows Auto preview for a restored comic with rendered pages even without an Auto run record', () => {
    mockAutoRunState()
    const store = createStore()
    store.set(currentComicDetailAtom, {
      id: 7,
      title: 'Restored Manga',
      script: {
        content: JSON.stringify({
          story: 'Restored story from saved comic pages.',
        }),
      },
      pages: [
        { id: 1, page_number: 1, image_url: '/static/restored-page-1.png' },
      ],
    } as any)

    render(
      <Provider store={store}>
        <ComicsPage />
      </Provider>,
    )

    expect(screen.getByText('Generated manga preview')).toBeInTheDocument()
    expect(screen.getByAltText('Restored Manga page 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Generate manga' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Story' }))

    expect(screen.getByText('Restored story from saved comic pages.')).toBeInTheDocument()
  })

  it('shows the Auto snapshot banner in Pro mode during active generation', async () => {
    mockAutoRunState({
      autoRun: makeAutoRun({
        story_snapshot: 'Snapshot story from the active Auto run.',
      }),
      isActive: true,
    })

    render(
      <Provider>
        <ComicsPage />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Pro' }))

    const banner = await screen.findByRole('status')
    expect(within(banner).getByText('Auto generation is running')).toBeInTheDocument()
    expect(within(banner).getByText('Hidden Mech')).toBeInTheDocument()
    expect(within(banner).getByText('Snapshot story from the active Auto run.')).toBeInTheDocument()

    fireEvent.click(within(banner).getByRole('button', { name: 'Return to Auto progress' }))

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Auto' })).toHaveAttribute('data-state', 'active')
    })
    expect(screen.getByText('Auto run in progress')).toBeInTheDocument()
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import toast from 'react-hot-toast'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ComicsApi } from '@/apis/comics'
import { JobsApi } from '@/apis/jobs'
import PanelsApi from '@/apis/panels'

import {
  currentComicDetailAtom,
  currentComicIdAtom,
  currentComicOverridesAtom,
} from '../../atoms'
import { PanelsTab } from '../panels-tab'

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/hooks/use-ai-providers', () => ({
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
    layoutOptions: ['auto-grid', 'grid-2x2'],
    preferences: {
      version: 2,
      fields: {
        text_provider: { mode: 'manual', value: 'gemini' },
        page_layout: { mode: 'auto' },
      },
    },
  }),
}))

vi.mock('@/apis/comics', () => ({
  ComicsApi: {
    create: vi.fn(),
    get: vi.fn(),
  },
}))

vi.mock('@/apis/jobs', () => ({
  JobsApi: {
    createComic: vi.fn(),
  },
}))

vi.mock('@/apis/panels', () => ({
  default: {
    setLayout: vi.fn(),
  },
}))

describe('PanelsTab', () => {
  beforeEach(() => {
    vi.mocked(ComicsApi.get).mockReset()
    vi.mocked(JobsApi.createComic).mockReset()
    vi.mocked(PanelsApi.setLayout).mockReset()
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
    vi.mocked(ComicsApi.get).mockResolvedValue({
      id: 12,
      panel_shots: [
        {
          id: 101,
          page_number: 1,
          panel_number: 1,
          sequence_index: 1,
          description: 'Opening panel',
        },
      ],
    } as any)
    vi.mocked(JobsApi.createComic).mockResolvedValue({ comic_id: 12 })
    vi.mocked(PanelsApi.setLayout).mockResolvedValue({ comic: { id: 12, panel_shots: [] } })
  })

  it('falls back when saved text provider preference is unavailable for panel generation', async () => {
    const store = createStore()
    store.set(currentComicIdAtom, 12)
    store.set(currentComicDetailAtom, { id: 12, panel_shots: [] } as any)
    store.set(currentComicOverridesAtom, {
      text_provider: { mode: 'manual', value: 'gemini' },
    })

    render(
      <Provider store={store}>
        <PanelsTab />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '生成分镜' }))

    await waitFor(() => {
      expect(JobsApi.createComic).toHaveBeenCalledWith({
        job_type: 'story_optimization',
        comic_id: 12,
        text_provider: 'third_party',
      })
    })
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { act } from 'react'
import toast from 'react-hot-toast'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ComicsApi from '@/apis/comics'
import PanelsApi from '@/apis/panels'
import { activeJobsAtom } from '@/atoms'
import type { RenderRun } from '@/service/types'

import {
  activeRenderRunAtom,
  activeTabAtom,
  currentComicIdAtom,
  currentComicOverridesAtom,
  imageProviderAtom,
  selectedPageAtom,
} from '../../atoms'
import { ImageGeneration } from '../image-generation'

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/apis/comics', () => ({
  default: {
    get: vi.fn(),
    listImages: vi.fn(),
    publish: vi.fn(),
  },
}))

vi.mock('@/apis/panels', () => ({
  default: {
    renderPage: vi.fn(),
    startRenderRun: vi.fn(),
    abortRenderRun: vi.fn(),
  },
}))

vi.mock('@/hooks/use-preferences', () => ({
  usePreferences: () => ({
    preferences: (globalThis as any).__mockPreferences,
    colorModes: ['black-white', 'color'],
    loading: false,
  }),
}))

const listImagesMock = vi.mocked(ComicsApi.listImages)
const getComicMock = vi.mocked(ComicsApi.get)
const renderPageMock = vi.mocked(PanelsApi.renderPage)
const startRenderRunMock = vi.mocked(PanelsApi.startRenderRun)
const abortRenderRunMock = vi.mocked(PanelsApi.abortRenderRun)

function makeRenderRun(overrides: Partial<RenderRun> = {}): RenderRun {
  return {
    id: 101,
    comic_id: 7,
    user_id: 22,
    mode: 'all_pages' as const,
    status: 'queued' as const,
    current_page_number: null,
    requested_pages: [],
    completed_pages: [],
    failed_pages: [],
    abort_requested: false,
    job_id: null,
    error_message: null,
    created_at: '2026-05-10T00:00:00Z',
    started_at: null,
    completed_at: null,
    ...overrides,
  }
}

function renderImageGeneration() {
  const store = createStore()
  store.set(currentComicIdAtom, 7)

  const result = render(
    <Provider store={store}>
      <ImageGeneration />
    </Provider>,
  )

  return { ...result, store }
}

function renderImageGenerationWithProvider(provider: 'gemini' | 'third_party') {
  const store = createStore()
  store.set(currentComicIdAtom, 7)
  store.set(imageProviderAtom, provider)
  store.set(currentComicOverridesAtom, {
    image_provider: { mode: 'manual', value: provider },
  })

  const result = render(
    <Provider store={store}>
      <ImageGeneration />
    </Provider>,
  )

  return { ...result, store }
}

describe('ImageGeneration render polling', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(toast.error).mockClear()
    vi.mocked(toast.success).mockClear()
    listImagesMock.mockReset()
    getComicMock.mockReset()
    renderPageMock.mockReset()
    startRenderRunMock.mockReset()
    abortRenderRunMock.mockReset()
    ;(globalThis as any).__mockPreferences = undefined
    listImagesMock.mockResolvedValue({ pages: [] } as any)
    getComicMock.mockResolvedValue({ id: 7 } as any)
    renderPageMock.mockResolvedValue({ job_id: 'render-job-1' })
    startRenderRunMock.mockResolvedValue({ render_run: makeRenderRun(), comic: { id: 7 } } as any)
    abortRenderRunMock.mockResolvedValue({
      render_run: makeRenderRun({
        status: 'aborted',
        abort_requested: true,
        completed_at: '2026-05-10T00:01:00Z',
      }),
    } as any)
  })

  it('does not show the placeholder preview button in Pro image generation', () => {
    renderImageGeneration()

    expect(screen.queryByRole('button', { name: /preview|预览/i })).not.toBeInTheDocument()
  })

  it('starts an all-pages render run with resolved render preferences', async () => {
    ;(globalThis as any).__mockPreferences = {
      version: 2,
      style_presets: [
        {
          value: 'Saved render style',
          label: 'Saved render style',
          is_custom: true,
        },
      ],
      fields: {
        style: { mode: 'manual', value: 'Saved render style' },
        image_provider: { mode: 'manual', value: 'third_party' },
        text_provider: { mode: 'manual', value: 'third_party' },
        color_mode: { mode: 'manual', value: 'color' },
        aspect_ratio: { mode: 'manual', value: '3:4' },
        font_family: { mode: 'manual', value: 'songti' },
        font_size: { mode: 'manual', value: '24' },
        bubble_shape: { mode: 'manual', value: 'round' },
        bubble_tail: { mode: 'manual', value: false },
      },
    }
    const renderRun = makeRenderRun({
      mode: 'all_pages',
      status: 'queued',
      job_id: 'render-job-101',
      requested_pages: [1, 2, 3],
    })
    startRenderRunMock.mockResolvedValueOnce({ render_run: renderRun, comic: { id: 7 } } as any)
    const { store } = renderImageGeneration()

    fireEvent.click(screen.getByRole('button', { name: '生成所有页' }))

    await waitFor(() => {
      expect(startRenderRunMock).toHaveBeenCalledWith(7, {
        mode: 'all_pages',
        image_provider: 'third_party',
        text_provider: 'third_party',
        style_description: 'Saved render style',
        color_mode: 'color',
        aspect_ratio: '3:4',
        font_family: 'songti',
        font_size: '24',
        bubble_shape: 'round',
        bubble_tail: false,
      })
    })
    expect(store.get(activeRenderRunAtom)).toEqual(renderRun)
    expect(store.get(activeJobsAtom)).toEqual([
      expect.objectContaining({
        job_id: 'render-job-101',
        render_run_id: 101,
        comic_id: 7,
        stage: 'render',
        status: 'queued',
        render_progress: { completed: 0, total: 3 },
        render_run: renderRun,
      }),
    ])
    expect(screen.getByText('所有页渲染已加入后台队列。')).toBeInTheDocument()
  })

  it('starts a remaining-pages render run', async () => {
    const renderRun = makeRenderRun({ mode: 'remaining_pages', status: 'running' })
    startRenderRunMock.mockResolvedValueOnce({ render_run: renderRun, comic: { id: 7 } } as any)
    renderImageGeneration()

    fireEvent.click(screen.getByRole('button', { name: '生成剩余页' }))

    await waitFor(() => {
      expect(startRenderRunMock).toHaveBeenCalledWith(7, expect.objectContaining({
        mode: 'remaining_pages',
      }))
    })
    expect(screen.getByText('剩余页渲染正在后台运行。')).toBeInTheDocument()
  })

  it('aborts the active render run and disables the active run UI', async () => {
    const runningRun = makeRenderRun({ id: 202, status: 'running', mode: 'all_pages' })
    const abortedRun = makeRenderRun({
      id: 202,
      status: 'aborted',
      mode: 'all_pages',
      abort_requested: true,
      completed_at: '2026-05-10T00:01:00Z',
    })
    startRenderRunMock.mockResolvedValueOnce({ render_run: runningRun, comic: { id: 7 } } as any)
    abortRenderRunMock.mockResolvedValueOnce({ render_run: abortedRun } as any)
    const { store } = renderImageGeneration()

    fireEvent.click(screen.getByRole('button', { name: '生成所有页' }))

    const abortButton = await screen.findByRole('button', { name: '中止' })
    fireEvent.click(abortButton)

    await waitFor(() => expect(abortRenderRunMock).toHaveBeenCalledWith(202))
    expect(store.get(activeRenderRunAtom)).toEqual(abortedRun)
    expect(screen.getByText('渲染任务已中止。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '中止' })).not.toBeInTheDocument()
  })

  it('does not block render actions for a different comic active render run', async () => {
    const runningDifferentComicRun = makeRenderRun({
      id: 303,
      comic_id: 99,
      status: 'running',
      mode: 'all_pages',
    })
    const renderRun = makeRenderRun({ mode: 'all_pages', status: 'queued' })
    startRenderRunMock.mockResolvedValueOnce({ render_run: renderRun, comic: { id: 7 } } as any)
    const store = createStore()
    store.set(currentComicIdAtom, 7)
    store.set(activeRenderRunAtom, runningDifferentComicRun)

    render(
      <Provider store={store}>
        <ImageGeneration />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '生成所有页' }))

    await waitFor(() => {
      expect(startRenderRunMock).toHaveBeenCalledWith(7, expect.objectContaining({
        mode: 'all_pages',
      }))
    })
  })

  it('re-enables render actions when the status shelf hydrates a terminal render run', async () => {
    const runningRun = makeRenderRun({
      id: 404,
      comic_id: 7,
      status: 'running',
      mode: 'all_pages',
      requested_pages: [1, 2],
    })
    const completedRun = makeRenderRun({
      ...runningRun,
      status: 'completed',
      completed_pages: [1, 2],
      completed_at: '2026-05-10T00:02:00Z',
    })
    const store = createStore()
    store.set(currentComicIdAtom, 7)
    store.set(activeRenderRunAtom, runningRun)
    store.set(activeJobsAtom, [{
      job_id: 'render-job-404',
      render_run_id: 404,
      comic_id: 7,
      stage: 'render',
      status: 'completed',
      title: 'Completed Run',
      render_run: completedRun,
      render_progress: { completed: 2, total: 2 },
    }])

    render(
      <Provider store={store}>
        <ImageGeneration />
      </Provider>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '生成所有页' })).toBeEnabled()
    })
    expect(store.get(activeRenderRunAtom)).toEqual(completedRun)
  })

  it('refreshes page images when the status shelf hydrates a completed render run', async () => {
    const runningRun = makeRenderRun({
      id: 409,
      comic_id: 7,
      status: 'running',
      mode: 'remaining_pages',
      requested_pages: [1, 2],
    })
    const completedRun = makeRenderRun({
      ...runningRun,
      status: 'completed',
      completed_pages: [1, 2],
      completed_at: '2026-05-10T00:02:00Z',
    })
    listImagesMock
      .mockResolvedValueOnce({ pages: [] } as any)
      .mockResolvedValueOnce({
        pages: [
          { page_id: 11, page_number: 1, image_url: 'https://cdn.example.com/page-1.png' },
          { page_id: 12, page_number: 2, image_url: 'https://cdn.example.com/page-2.png' },
        ],
      } as any)
    const store = createStore()
    store.set(currentComicIdAtom, 7)
    store.set(activeRenderRunAtom, runningRun)
    store.set(activeJobsAtom, [{
      job_id: 'render-job-409',
      render_run_id: 409,
      comic_id: 7,
      stage: 'render',
      status: 'completed',
      title: 'Completed Remaining Run',
      render_run: completedRun,
      render_progress: { completed: 2, total: 2 },
    }])

    render(
      <Provider store={store}>
        <ImageGeneration />
      </Provider>,
    )

    await waitFor(() => {
      expect(listImagesMock).toHaveBeenCalledTimes(2)
    })
    expect(screen.getByAltText('page preview')).toHaveAttribute('src', 'https://cdn.example.com/page-1.png')
  })

  it('keeps render actions disabled while a render run abort request is pending', async () => {
    const abortRequestedRun = makeRenderRun({
      id: 505,
      comic_id: 7,
      status: 'running',
      mode: 'all_pages',
      abort_requested: true,
    })
    const store = createStore()
    store.set(currentComicIdAtom, 7)
    store.set(activeRenderRunAtom, abortRequestedRun)

    render(
      <Provider store={store}>
        <ImageGeneration />
      </Provider>,
    )

    expect(screen.getByRole('button', { name: '生成所有页' })).toBeDisabled()
  })

  it('prefers a newer active shelf render run over a stale terminal atom run', async () => {
    const staleCompletedRun = makeRenderRun({
      id: 606,
      comic_id: 7,
      status: 'completed',
      mode: 'all_pages',
      completed_at: '2026-05-10T00:02:00Z',
    })
    const newerRunningRun = makeRenderRun({
      id: 607,
      comic_id: 7,
      status: 'running',
      mode: 'all_pages',
      job_id: 'render-job-607',
      requested_pages: [1, 2],
    })
    const store = createStore()
    store.set(currentComicIdAtom, 7)
    store.set(activeRenderRunAtom, staleCompletedRun)
    store.set(activeJobsAtom, [{
      job_id: 'render-job-607',
      render_run_id: 607,
      comic_id: 7,
      stage: 'render',
      status: 'running',
      title: 'Newer Run',
      render_run: newerRunningRun,
      render_progress: { completed: 0, total: 2 },
    }])

    render(
      <Provider store={store}>
        <ImageGeneration />
      </Provider>,
    )

    expect(screen.getByRole('button', { name: '生成所有页' })).toBeDisabled()
    expect(await screen.findByRole('button', { name: '中止' })).toBeInTheDocument()
    await waitFor(() => {
      expect(store.get(activeRenderRunAtom)).toEqual(newerRunningRun)
    })
  })

  it('keeps render actions disabled for a lightweight active render-run job before hydration', () => {
    const store = createStore()
    store.set(currentComicIdAtom, 7)
    store.set(activeJobsAtom, [{
      job_id: 'render-job-lightweight',
      render_run_id: 707,
      comic_id: 7,
      stage: 'render',
      status: 'running',
      title: 'Hydrating Run',
      render_progress: { completed: 0, total: 3 },
    }])

    render(
      <Provider store={store}>
        <ImageGeneration />
      </Provider>,
    )

    expect(screen.getByRole('button', { name: '生成所有页' })).toBeDisabled()
  })

  it('aborts the lightweight active render-run id when the atom has a stale terminal run', async () => {
    const staleCompletedRun = makeRenderRun({
      id: 808,
      comic_id: 7,
      status: 'completed',
      mode: 'all_pages',
      completed_at: '2026-05-10T00:02:00Z',
    })
    const abortedRun = makeRenderRun({
      id: 809,
      comic_id: 7,
      status: 'aborted',
      mode: 'all_pages',
      abort_requested: true,
      completed_at: '2026-05-10T00:03:00Z',
    })
    abortRenderRunMock.mockResolvedValueOnce({ render_run: abortedRun } as any)
    const store = createStore()
    store.set(currentComicIdAtom, 7)
    store.set(activeRenderRunAtom, staleCompletedRun)
    store.set(activeJobsAtom, [{
      job_id: 'render-job-lightweight-active',
      render_run_id: 809,
      comic_id: 7,
      stage: 'render',
      status: 'running',
      title: 'Hydrating Run',
      render_progress: { completed: 0, total: 3 },
    }])

    render(
      <Provider store={store}>
        <ImageGeneration />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '中止' }))

    await waitFor(() => {
      expect(abortRenderRunMock).toHaveBeenCalledWith(809)
    })
  })

  it('keeps polling beyond 30 seconds while the backend render can still be running', async () => {
    renderImageGeneration()

    expect(screen.getByText('图像生成可能需要几分钟，请保持页面打开。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '生图' }))

    await waitFor(() => expect(renderPageMock).toHaveBeenCalledWith(7, 1, expect.objectContaining({
      image_provider: 'gemini',
      text_provider: 'gemini',
    })))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(toast.error).not.toHaveBeenCalled()
    expect(screen.getByText('正在生成漫画页')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /渲染中/ })).toBeDisabled()
  })

  it('stops polling and shows the render stage error when the backend marks render failed', async () => {
    getComicMock
      .mockResolvedValueOnce({ id: 7, workflow_status: 'in_progress' } as any)
      .mockResolvedValueOnce({
        id: 7,
        workflow_status: 'failed',
        workflow_stages: [
          {
            stage: 'render',
            status: 'failed',
            error_message: 'Third-party API error 524',
          },
        ],
      } as any)

    renderImageGeneration()

    fireEvent.click(screen.getByRole('button', { name: '生图' }))

    await waitFor(() => expect(renderPageMock).toHaveBeenCalledWith(7, 1, expect.objectContaining({
      image_provider: 'gemini',
      text_provider: 'gemini',
    })))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })

    expect(toast.error).toHaveBeenCalledWith('第一页渲染失败：Third-party API error 524')
    expect(screen.getByRole('alert')).toHaveTextContent('第一页渲染失败：Third-party API error 524')
    expect(screen.getByRole('button', { name: '生图' })).toBeEnabled()
  })

  it('passes the selected image provider to the render endpoint', async () => {
    renderImageGenerationWithProvider('third_party')

    fireEvent.click(screen.getByRole('button', { name: '生图' }))

    await waitFor(() => {
      expect(renderPageMock).toHaveBeenCalledWith(7, 1, expect.objectContaining({
        image_provider: 'third_party',
        text_provider: 'gemini',
      }))
    })
  })

  it('renders the shared selected storyboard page', async () => {
    listImagesMock.mockResolvedValueOnce({
      pages: [
        { page_id: 11, page_number: 1, image_url: 'https://cdn.example.com/page-1.png' },
        { page_id: 12, page_number: 2, image_url: null },
      ],
    } as any)
    const store = createStore()
    store.set(currentComicIdAtom, 7)
    store.set(selectedPageAtom, 2)

    render(
      <Provider store={store}>
        <ImageGeneration />
      </Provider>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '02' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '生图' }))

    await waitFor(() => {
      expect(renderPageMock).toHaveBeenCalledWith(7, 2, expect.objectContaining({
        image_provider: 'gemini',
        text_provider: 'gemini',
      }))
    })
  })

  it('adds a new image page in place and renders that new page', async () => {
    listImagesMock.mockResolvedValueOnce({
      pages: [
        { page_id: 11, page_number: 1, image_url: 'https://cdn.example.com/page-1.png' },
      ],
    } as any)
    const store = createStore()
    store.set(currentComicIdAtom, 7)
    store.set(activeTabAtom, 'image-generation')

    render(
      <Provider store={store}>
        <ImageGeneration />
      </Provider>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '01' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '添加第02页' }))

    expect(store.get(activeTabAtom)).toBe('image-generation')
    expect(store.get(selectedPageAtom)).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: '生图' }))

    await waitFor(() => {
      expect(renderPageMock).toHaveBeenCalledWith(7, 2, expect.objectContaining({
        image_provider: 'gemini',
        text_provider: 'gemini',
      }))
    })
  })

  it('uses saved manual render preferences for rendering', async () => {
    ;(globalThis as any).__mockPreferences = {
      version: 2,
      style_presets: [
        {
          value: 'Saved render style',
          label: 'Saved render style',
          is_custom: true,
        },
      ],
      fields: {
        style: { mode: 'manual', value: 'Saved render style' },
        image_provider: { mode: 'manual', value: 'third_party' },
        text_provider: { mode: 'manual', value: 'third_party' },
        color_mode: { mode: 'manual', value: 'color' },
        aspect_ratio: { mode: 'manual', value: '3:4' },
        font_family: { mode: 'manual', value: 'songti' },
        font_size: { mode: 'manual', value: '24' },
        bubble_shape: { mode: 'manual', value: 'round' },
        bubble_tail: { mode: 'manual', value: false },
      },
    }

    renderImageGeneration()

    fireEvent.click(screen.getByRole('button', { name: '生图' }))

    await waitFor(() => {
      expect(renderPageMock).toHaveBeenCalledWith(7, 1, {
        image_provider: 'third_party',
        text_provider: 'third_party',
        style_description: 'Saved render style',
        color_mode: 'color',
        aspect_ratio: '3:4',
        font_family: 'songti',
        font_size: '24',
        bubble_shape: 'round',
        bubble_tail: false,
      })
    })
  })

  it('does not treat an existing page image as a completed rerender', async () => {
    const oldImageUrl = 'https://cdn.example.com/page-1-old.png'
    const newImageUrl = 'https://cdn.example.com/page-1-new.png'
    listImagesMock
      .mockResolvedValueOnce({
        pages: [{ page_id: 11, page_number: 1, image_url: oldImageUrl }],
      } as any)
      .mockResolvedValueOnce({
        pages: [{ page_id: 11, page_number: 1, image_url: oldImageUrl }],
      } as any)
      .mockResolvedValueOnce({
        pages: [{ page_id: 11, page_number: 1, image_url: oldImageUrl }],
      } as any)
      .mockResolvedValueOnce({
        pages: [{ page_id: 11, page_number: 1, image_url: newImageUrl }],
      } as any)

    renderImageGenerationWithProvider('third_party')

    await waitFor(() => expect(listImagesMock).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: '生图' }))

    await waitFor(() => {
      expect(renderPageMock).toHaveBeenCalledWith(7, 1, expect.objectContaining({
        image_provider: 'third_party',
        text_provider: 'gemini',
      }))
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })

    expect(toast.success).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /渲染中/ })).toBeDisabled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })

    expect(toast.success).toHaveBeenCalledWith('生图完成')
    expect(screen.getByRole('button', { name: '生图' })).toBeEnabled()
  })
})

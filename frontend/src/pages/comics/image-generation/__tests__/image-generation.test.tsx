import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { act } from 'react'
import toast from 'react-hot-toast'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ComicsApi from '@/apis/comics'
import PanelsApi from '@/apis/panels'

import { currentComicIdAtom, imageProviderAtom } from '../../atoms'
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
  },
}))

const listImagesMock = vi.mocked(ComicsApi.listImages)
const getComicMock = vi.mocked(ComicsApi.get)
const renderPageMock = vi.mocked(PanelsApi.renderPage)

function renderImageGeneration() {
  const store = createStore()
  store.set(currentComicIdAtom, 7)

  return render(
    <Provider store={store}>
      <ImageGeneration />
    </Provider>,
  )
}

function renderImageGenerationWithProvider(provider: 'gemini' | 'third_party') {
  const store = createStore()
  store.set(currentComicIdAtom, 7)
  store.set(imageProviderAtom, provider)

  return render(
    <Provider store={store}>
      <ImageGeneration />
    </Provider>,
  )
}

describe('ImageGeneration render polling', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(toast.error).mockClear()
    vi.mocked(toast.success).mockClear()
    listImagesMock.mockReset()
    getComicMock.mockReset()
    renderPageMock.mockReset()
    listImagesMock.mockResolvedValue({ pages: [] } as any)
    getComicMock.mockResolvedValue({ id: 7 } as any)
    renderPageMock.mockResolvedValue({ job_id: 'render-job-1' })
  })

  it('keeps polling beyond 30 seconds while the backend render can still be running', async () => {
    renderImageGeneration()

    expect(screen.getByText('图像生成可能需要几分钟，请保持页面打开。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '生图' }))

    await waitFor(() => expect(renderPageMock).toHaveBeenCalledWith(7, 1, {
      image_provider: 'gemini',
      text_provider: 'gemini',
    }))

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

    await waitFor(() => expect(renderPageMock).toHaveBeenCalledWith(7, 1, {
      image_provider: 'gemini',
      text_provider: 'gemini',
    }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })

    expect(toast.error).toHaveBeenCalledWith('生图失败：Third-party API error 524')
    expect(screen.getByRole('alert')).toHaveTextContent('生图失败：Third-party API error 524')
    expect(screen.getByRole('button', { name: '生图' })).toBeEnabled()
  })

  it('passes the selected image provider to the render endpoint', async () => {
    renderImageGenerationWithProvider('third_party')

    fireEvent.click(screen.getByRole('button', { name: '生图' }))

    await waitFor(() => {
      expect(renderPageMock).toHaveBeenCalledWith(7, 1, {
        image_provider: 'third_party',
        text_provider: 'gemini',
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
      expect(renderPageMock).toHaveBeenCalledWith(7, 1, {
        image_provider: 'third_party',
        text_provider: 'gemini',
      })
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

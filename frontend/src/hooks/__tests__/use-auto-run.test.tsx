import { renderHook, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import type { ReactNode } from 'react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AutoApi } from '@/apis/auto'
import { currentComicIdAtom } from '@/pages/comics/atoms'
import type { AutoRun } from '@/service/types'

import { useAutoRun } from '../use-auto-run'

vi.mock('@/apis/auto', () => ({
  AutoApi: {
    prepareCharacters: vi.fn(),
    startRun: vi.fn(),
    getActiveRun: vi.fn(),
    getLatestRun: vi.fn(),
    getRun: vi.fn(),
    abortRun: vi.fn(),
    retryRun: vi.fn(),
    resolveRun: vi.fn(),
  },
}))

const getActiveRunMock = vi.mocked(AutoApi.getActiveRun)
const getLatestRunMock = vi.mocked(AutoApi.getLatestRun)
const getRunMock = vi.mocked(AutoApi.getRun)
const abortRunMock = vi.mocked(AutoApi.abortRun)

function makeAutoRun(overrides: Partial<AutoRun> = {}): AutoRun {
  return {
    id: 5,
    comic_id: 7,
    user_id: 1,
    status: 'running',
    current_stage: 'render',
    story_snapshot: 'Story',
    title_snapshot: 'Book',
    preferences_snapshot: {},
    character_review: null,
    selected_character_ids: [],
    render_run_id: null,
    render_run: null,
    render_progress: null,
    abort_requested: false,
    job_id: 'auto-job-5',
    error_message: null,
    created_at: null,
    started_at: null,
    completed_at: null,
    updated_at: null,
    ...overrides,
  }
}

function wrapperWithComic(comicId: number | null) {
  const store = createStore()
  store.set(currentComicIdAtom, comicId)

  return function Wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>
  }
}

describe('useAutoRun', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    getActiveRunMock.mockReset()
    getLatestRunMock.mockReset()
    getRunMock.mockReset()
    abortRunMock.mockReset()
  })

  it('hydrates the active Auto run for the current comic', async () => {
    getActiveRunMock.mockResolvedValue({ auto_run: makeAutoRun() })

    const { result } = renderHook(() => useAutoRun(), { wrapper: wrapperWithComic(7) })

    await waitFor(() => expect(result.current.autoRun?.id).toBe(5))

    expect(getActiveRunMock).toHaveBeenCalledWith(7)
    expect(result.current.isActive).toBe(true)
    expect(result.current.isLoading).toBe(false)
  })

  it('hydrates a user active Auto run before the current comic atom is available', async () => {
    getActiveRunMock.mockResolvedValue({
      auto_run: makeAutoRun(),
      comic: { id: 7, title: 'Book' } as never,
    })

    const { result } = renderHook(() => useAutoRun(), { wrapper: wrapperWithComic(null) })

    await waitFor(() => expect(result.current.autoRun?.id).toBe(5))

    expect(getActiveRunMock).toHaveBeenCalledWith(null)
    expect(result.current.isActive).toBe(true)
  })

  it('hydrates the latest completed Auto run when no active run exists for the current comic', async () => {
    getActiveRunMock.mockResolvedValue({ auto_run: null })
    getLatestRunMock.mockResolvedValue({
      auto_run: makeAutoRun({
        status: 'completed',
        current_stage: 'preview',
      }),
      comic: { id: 7, title: 'Book' } as never,
    })

    const { result } = renderHook(() => useAutoRun(), { wrapper: wrapperWithComic(7) })

    await waitFor(() => expect(result.current.autoRun?.status).toBe('completed'))

    expect(getActiveRunMock).toHaveBeenCalledWith(7)
    expect(getLatestRunMock).toHaveBeenCalledWith(7)
    expect(result.current.isComplete).toBe(true)
  })

  it('polls active runs and stops polling after terminal status', async () => {
    getActiveRunMock.mockResolvedValue({ auto_run: makeAutoRun() })
    getRunMock.mockResolvedValue({
      auto_run: makeAutoRun({
        status: 'completed',
        current_stage: 'preview',
        render_progress: { completed: 2, failed: 0, total: 2, current_page_number: 2 },
      }),
    })

    const { result } = renderHook(() => useAutoRun(), { wrapper: wrapperWithComic(7) })

    await waitFor(() => expect(result.current.autoRun?.status).toBe('running'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    await waitFor(() => expect(result.current.autoRun?.status).toBe('completed'))
    expect(result.current.isComplete).toBe(true)
    expect(getRunMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })

    expect(getRunMock).toHaveBeenCalledTimes(1)
  })

  it('aborts the current run and refreshes run detail', async () => {
    getActiveRunMock.mockResolvedValue({ auto_run: makeAutoRun() })
    abortRunMock.mockResolvedValue({ auto_run: makeAutoRun({ abort_requested: true }) })
    getRunMock.mockResolvedValue({
      auto_run: makeAutoRun({
        status: 'aborted',
        abort_requested: true,
        completed_at: '2026-05-11T00:00:00.000Z',
      }),
    })

    const { result } = renderHook(() => useAutoRun(), { wrapper: wrapperWithComic(7) })
    await waitFor(() => expect(result.current.autoRun?.id).toBe(5))

    await act(async () => {
      await result.current.abortRun()
    })

    expect(abortRunMock).toHaveBeenCalledWith(5)
    expect(getRunMock).toHaveBeenCalledWith(5)
    expect(result.current.autoRun?.status).toBe('aborted')
    expect(result.current.isActive).toBe(false)
  })
})

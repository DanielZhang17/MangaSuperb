import { renderHook, waitFor } from '@testing-library/react'
import { getDefaultStore } from 'jotai'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ComicsApi } from '@/apis/comics'
import { JobsApi } from '@/apis/jobs'
import { clearActiveJobs, mergeActiveJobs, userAtom } from '@/atoms'

import { useActiveJobs } from '../use-active-jobs'

vi.mock('@/apis/jobs', async () => {
  const actual = await vi.importActual<typeof import('@/apis/jobs')>('@/apis/jobs')

  return {
    ...actual,
    JobsApi: {
      ...actual.JobsApi,
      listActive: vi.fn(),
      get: vi.fn(),
    },
  }
})

vi.mock('@/apis/comics', async () => {
  const actual = await vi.importActual<typeof import('@/apis/comics')>('@/apis/comics')

  return {
    ...actual,
    ComicsApi: {
      ...actual.ComicsApi,
      get: vi.fn(),
    },
  }
})

const listActiveMock = vi.mocked(JobsApi.listActive)
const getJobMock = vi.mocked(JobsApi.get)
const getComicMock = vi.mocked(ComicsApi.get)
const store = getDefaultStore()

describe('useActiveJobs', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    clearActiveJobs()
    store.set(userAtom, {
      id: 1,
      username: 'tester',
      email: 'tester@example.com',
      avatar_index: 1,
      created_at: '2026-05-10T00:00:00.000Z',
    } as any)
    listActiveMock.mockReset()
    getJobMock.mockReset()
    getComicMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    store.set(userAtom, null)
  })

  it('does not poll active jobs before a user session is available', async () => {
    store.set(userAtom, null)

    renderHook(() => useActiveJobs())

    await act(async () => {
      await Promise.resolve()
    })

    expect(listActiveMock).not.toHaveBeenCalled()
  })

  it('preserves locally seeded jobs when the initial active-list hydrate is stale', async () => {
    let resolveActiveList!: (value: { active: any[] }) => void
    listActiveMock.mockReturnValue(new Promise((resolve) => {
      resolveActiveList = resolve
    }))
    getJobMock.mockReturnValue(new Promise(() => {
      void 0
    }))

    const { result } = renderHook(() => useActiveJobs())

    act(() => {
      mergeActiveJobs([{
        job_id: 'render-job-local',
        render_run_id: 99,
        comic_id: 7,
        stage: 'render',
        status: 'queued',
        title: 'Locally Seeded Run',
        started_at: null,
        render_progress: { completed: 0, total: 3 },
        render_run: null,
      }])
    })

    await waitFor(() => {
      expect(result.current.jobs).toHaveLength(1)
    })

    await act(async () => {
      resolveActiveList({
        active: [
          {
            job_id: 'server-job-1',
            comic_id: 8,
            stage: 'outline',
            status: 'running',
            title: 'Server Job',
            started_at: '2026-05-10T00:00:00.000Z',
          },
        ],
      })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(result.current.jobs.some((job) => job.job_id === 'server-job-1')).toBe(true)
    })
    expect(result.current.jobs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        job_id: 'render-job-local',
        render_run_id: 99,
      }),
    ]))
  })

  it('preserves active render-run metadata from the active jobs response', async () => {
    listActiveMock.mockResolvedValue({
      active: [
        {
          job_id: 'render-job-1',
          render_run_id: 42,
          comic_id: 7,
          stage: 'render',
          status: 'running',
          title: 'Render Run Shelf',
          started_at: '2026-04-24T00:00:00.000Z',
          render_progress: { completed: 1, total: 4 },
        },
      ],
    })

    getJobMock.mockResolvedValue({
      job_id: 'render-job-1',
      rq_status: 'started',
    } as any)

    const { result } = renderHook(() => useActiveJobs())

    await waitFor(() => {
      expect(result.current.jobs[0]).toMatchObject({
        job_id: 'render-job-1',
        render_run_id: 42,
        render_progress: { completed: 1, total: 4 },
      })
    })
  })

  it('preserves active character job metadata from the active jobs response', async () => {
    listActiveMock.mockResolvedValue({
      active: [
        {
          job_id: 'character-image-job',
          kind: 'character_image',
          character_id: 44,
          stage: 'character_image',
          status: 'processing',
          title: 'Nova',
          started_at: '2026-05-10T00:00:00.000Z',
        },
      ],
    })

    getJobMock.mockResolvedValue({
      job_id: 'character-image-job',
      rq_status: 'started',
    } as any)

    const { result } = renderHook(() => useActiveJobs())

    await waitFor(() => {
      expect(result.current.jobs[0]).toMatchObject({
        job_id: 'character-image-job',
        kind: 'character_image',
        character_id: 44,
        stage: 'character_image',
        status: 'processing',
        title: 'Nova',
      })
    })
  })

  it('hydrates active Auto-run jobs with detail status and progress', async () => {
    listActiveMock.mockResolvedValue({
      active: [
        {
          job_id: 'auto-run-job-7',
          kind: 'auto_run',
          auto_run_id: 7,
          comic_id: 70,
          stage: 'render',
          status: 'running',
          title: 'Auto Run Shelf',
          started_at: '2026-05-11T00:00:00.000Z',
          render_progress: { completed: 1, failed: 0, total: 4, current_page_number: 2 },
          auto_run: {
            id: 7,
            comic_id: 70,
            title_snapshot: 'Auto Run Shelf',
            status: 'running',
            current_stage: 'render',
            render_progress: { completed: 1, failed: 0, total: 4, current_page_number: 2 },
          },
        },
      ],
    } as any)

    getJobMock.mockResolvedValue({
      job_id: 'auto-run-job-7',
      rq_status: 'running',
      auto_run: {
        id: 7,
        comic_id: 70,
        title_snapshot: 'Auto Run Shelf',
        status: 'needs_review',
        current_stage: 'characters',
        render_progress: null,
      },
      comic: {
        id: 70,
        title: 'Auto Run Shelf',
        workflow_stages: [],
        pages: [],
        page_layouts: [],
        panel_shots: [],
      },
    } as any)

    getComicMock.mockResolvedValue({
      id: 70,
      title: 'Auto Run Shelf',
      workflow_stages: [],
      pages: [],
      page_layouts: [],
      panel_shots: [],
    } as any)

    const { result } = renderHook(() => useActiveJobs())

    await waitFor(() => {
      expect(result.current.jobs).toHaveLength(1)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    await waitFor(() => {
      expect(result.current.jobs[0]).toMatchObject({
        job_id: 'auto-run-job-7',
        kind: 'auto_run',
        auto_run_id: 7,
        comic_id: 70,
        stage: 'characters',
        status: 'needs_review',
        title: 'Auto Run Shelf',
        auto_run: expect.objectContaining({ id: 7 }),
      })
    })
  })

  it('prefers detail render-run page progress over comic-derived render counts', async () => {
    listActiveMock.mockResolvedValue({
      active: [
        {
          job_id: 'render-job-2',
          render_run_id: 43,
          comic_id: 8,
          stage: 'render',
          status: 'running',
          title: 'Hydrated Render Run',
          started_at: '2026-04-24T00:00:00.000Z',
          render_progress: { completed: 1, total: 4 },
        },
      ],
    })

    getJobMock.mockResolvedValue({
      job_id: 'render-job-2',
      rq_status: 'started',
      render_run: {
        id: 43,
        comic_id: 8,
        user_id: 1,
        mode: 'all_pages',
        status: 'running',
        current_page_number: 3,
        requested_pages: [1, 2, 3, 4],
        completed_pages: [1, 2],
        failed_pages: [],
        abort_requested: false,
        job_id: 'render-job-2',
        error_message: null,
        created_at: '2026-04-24T00:00:00.000Z',
        started_at: '2026-04-24T00:00:01.000Z',
        completed_at: null,
      },
      comic: {
        id: 8,
        title: 'Hydrated Render Run',
        workflow_stages: [{ stage: 'render', status: 'in_progress' }],
        pages: [{ page_number: 1, image_url: 'https://example.com/page-1.png' }],
        page_layouts: [{ page_number: 1 }],
        panel_shots: [{ page_number: 1 }],
      },
    } as any)

    getComicMock.mockResolvedValue({
      id: 8,
      title: 'Hydrated Render Run',
      workflow_stages: [{ stage: 'render', status: 'in_progress' }],
      pages: [{ page_number: 1, image_url: 'https://example.com/page-1.png' }],
      page_layouts: [{ page_number: 1 }],
      panel_shots: [{ page_number: 1 }],
    } as any)

    const { result } = renderHook(() => useActiveJobs())

    await waitFor(() => {
      expect(result.current.jobs).toHaveLength(1)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    await waitFor(() => {
      expect(result.current.jobs[0]?.render_progress).toEqual({
        completed: 2,
        failed: 0,
        total: 4,
        current_page_number: 3,
      })
      expect(result.current.jobs[0]?.render_run?.current_page_number).toBe(3)
    })
  })

  it('removes aborted render runs after the completion flash', async () => {
    listActiveMock.mockResolvedValue({
      active: [
        {
          job_id: 'render-job-aborted',
          render_run_id: 45,
          comic_id: 10,
          stage: 'render',
          status: 'running',
          title: 'Aborted Render Run',
          started_at: '2026-04-24T00:00:00.000Z',
          render_progress: { completed: 0, total: 2 },
        },
      ],
    })

    getJobMock.mockResolvedValue({
      job_id: 'render-job-aborted',
      rq_status: 'started',
      render_run: {
        id: 45,
        comic_id: 10,
        user_id: 1,
        mode: 'all_pages',
        status: 'aborted',
        current_page_number: 1,
        requested_pages: [1, 2],
        completed_pages: [],
        failed_pages: [],
        abort_requested: true,
        job_id: 'render-job-aborted',
        error_message: null,
        created_at: '2026-04-24T00:00:00.000Z',
        started_at: '2026-04-24T00:00:01.000Z',
        completed_at: '2026-04-24T00:00:05.000Z',
      },
      comic: {
        id: 10,
        title: 'Aborted Render Run',
        workflow_stages: [{ stage: 'render', status: 'aborted' }],
        pages: [],
        page_layouts: [{ page_number: 1 }, { page_number: 2 }],
        panel_shots: [{ page_number: 1 }, { page_number: 2 }],
      },
    } as any)

    getComicMock.mockResolvedValue({
      id: 10,
      title: 'Aborted Render Run',
      workflow_stages: [{ stage: 'render', status: 'aborted' }],
      pages: [],
      page_layouts: [{ page_number: 1 }, { page_number: 2 }],
      panel_shots: [{ page_number: 1 }, { page_number: 2 }],
    } as any)

    const { result } = renderHook(() => useActiveJobs())

    await waitFor(() => {
      expect(result.current.jobs).toHaveLength(1)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    await waitFor(() => {
      expect(result.current.jobs[0]?.status).toBe('aborted')
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    await waitFor(() => {
      expect(result.current.jobs).toHaveLength(0)
    })
  })

  it('hydrates active jobs and removes finished jobs after the completion flash', async () => {
    listActiveMock.mockResolvedValue({
      active: [
        {
          job_id: 'job-1',
          comic_id: 1,
          stage: 'render',
          status: 'in_progress',
          title: 'Shelf Test',
          started_at: '2026-04-24T00:00:00.000Z',
        },
      ],
    })

    getJobMock.mockResolvedValue({
      job_id: 'job-1',
      rq_status: 'finished',
      comic: {
        id: 1,
        title: 'Shelf Test',
        workflow_stages: [{ stage: 'render', status: 'completed' }],
        pages: [],
        page_layouts: [],
        panel_shots: [],
      },
    } as any)

    getComicMock.mockResolvedValue({
      id: 1,
      title: 'Shelf Test',
      workflow_stages: [{ stage: 'render', status: 'completed' }],
      pages: [],
      page_layouts: [],
      panel_shots: [],
    } as any)

    const { result } = renderHook(() => useActiveJobs())

    await waitFor(() => {
      expect(result.current.jobs).toHaveLength(1)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    await waitFor(() => {
      expect(result.current.jobs[0]?.rq_status).toBe('finished')
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    await waitFor(() => {
      expect(result.current.jobs).toHaveLength(0)
    })
  })

  it('marks jobs as reconnecting after repeated poll failures', async () => {
    listActiveMock.mockResolvedValue({
      active: [
        {
          job_id: 'job-2',
          comic_id: 2,
          stage: 'render',
          status: 'in_progress',
          title: 'Retry Test',
          started_at: '2026-04-24T00:00:00.000Z',
        },
      ],
    })

    getJobMock.mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useActiveJobs())

    await waitFor(() => {
      expect(result.current.jobs).toHaveLength(1)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(4000)
      await vi.advanceTimersByTimeAsync(8000)
    })

    await waitFor(() => {
      expect(result.current.jobs[0]?.reconnecting).toBe(true)
    })
  })
})

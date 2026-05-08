import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ComicsApi } from '@/apis/comics'
import { JobsApi } from '@/apis/jobs'
import { clearActiveJobs } from '@/atoms'

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

describe('useActiveJobs', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    clearActiveJobs()
    listActiveMock.mockReset()
    getJobMock.mockReset()
    getComicMock.mockReset()
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

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PanelsApi from '@/apis/panels'
import { type ActiveJobEntry, activeJobsAtom } from '@/atoms'

import { ProgressShelf } from '../index'

const defaultShelfJob: ActiveJobEntry = {
  job_id: 'render-job-9',
  render_run_id: 909,
  comic_id: 7,
  stage: 'render',
  status: 'running',
  title: 'Abortable Render Run',
  started_at: '2026-05-10T00:00:00.000Z',
  render_progress: { completed: 1, total: 4 },
  render_run: {
    id: 909,
    comic_id: 7,
    user_id: 1,
    mode: 'all_pages',
    status: 'running',
    current_page_number: 2,
    requested_pages: [1, 2, 3, 4],
    completed_pages: [1],
    failed_pages: [],
    abort_requested: false,
    job_id: 'render-job-9',
    error_message: null,
    created_at: '2026-05-10T00:00:00.000Z',
    started_at: '2026-05-10T00:00:01.000Z',
    completed_at: null,
  },
}

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn() },
}))

vi.mock('@/hooks/use-active-jobs', () => ({
  default: () => ({
    jobs: (globalThis as any).__mockShelfJobs ?? [defaultShelfJob],
  }),
  mapStageToComicsTab: () => 'image-generation',
}))

vi.mock('@/apis/panels', () => ({
  default: {
    abortRenderRun: vi.fn(),
  },
}))

const abortRenderRunMock = vi.mocked(PanelsApi.abortRenderRun)

describe('ProgressShelf', () => {
  beforeEach(() => {
    ;(globalThis as any).__mockShelfJobs = undefined
    abortRenderRunMock.mockReset()
    abortRenderRunMock.mockResolvedValue({
      render_run: {
        id: 909,
        comic_id: 7,
        user_id: 1,
        mode: 'all_pages',
        status: 'aborted',
        current_page_number: 2,
        requested_pages: [1, 2, 3, 4],
        completed_pages: [1],
        failed_pages: [],
        abort_requested: true,
        job_id: 'render-job-9',
        error_message: null,
        created_at: '2026-05-10T00:00:00.000Z',
        started_at: '2026-05-10T00:00:01.000Z',
        completed_at: '2026-05-10T00:01:00.000Z',
      },
    } as any)
  })

  it('can abort a background render run from the floating shelf', async () => {
    const store = createStore()
    store.set(activeJobsAtom, [])

    render(
      <Provider store={store}>
        <MemoryRouter>
          <ProgressShelf />
        </MemoryRouter>
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /1 job active/i }))
    fireEvent.click(screen.getByRole('button', { name: /Abort render run/i }))

    await waitFor(() => {
      expect(abortRenderRunMock).toHaveBeenCalledWith(909)
    })
  })

  it('keeps the shelf usable when aborting a render run fails', async () => {
    abortRenderRunMock.mockRejectedValueOnce(new Error('abort unavailable'))
    const store = createStore()
    store.set(activeJobsAtom, [])

    render(
      <Provider store={store}>
        <MemoryRouter>
          <ProgressShelf />
        </MemoryRouter>
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /1 job active/i }))
    fireEvent.click(screen.getByRole('button', { name: /Abort render run/i }))

    await waitFor(() => {
      expect(abortRenderRunMock).toHaveBeenCalledWith(909)
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Abort render run/i })).not.toBeDisabled()
    })
  })

  it('keeps render-run abort visible when another job exists for the same comic', async () => {
    ;(globalThis as any).__mockShelfJobs = [
      defaultShelfJob,
      {
        job_id: 'export-job-1',
        comic_id: 7,
        stage: 'export',
        status: 'running',
        title: 'Exporting Same Comic',
        started_at: '2026-05-10T00:00:00.000Z',
      },
    ]
    const store = createStore()
    store.set(activeJobsAtom, [])

    render(
      <Provider store={store}>
        <MemoryRouter>
          <ProgressShelf />
        </MemoryRouter>
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /2 jobs active/i }))

    expect(screen.getByRole('button', { name: /Abort render run/i })).toBeInTheDocument()
    expect(screen.getByText('Render run')).toBeInTheDocument()
  })
})

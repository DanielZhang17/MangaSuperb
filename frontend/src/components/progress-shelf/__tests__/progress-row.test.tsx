import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ActiveJobEntry } from '@/atoms'

import { ProgressRow } from '../progress-row'

describe('ProgressRow', () => {
  it('shows render-run page counts, current page, and aborted status', () => {
    const job: ActiveJobEntry = {
      job_id: 'render-job-3',
      render_run_id: 44,
      comic_id: 9,
      stage: 'render',
      status: 'aborted',
      title: 'Shelf Render Run',
      started_at: '2026-04-24T00:00:00.000Z',
      render_progress: { completed: 2, total: 4 },
      render_run: {
        id: 44,
        comic_id: 9,
        user_id: 1,
        mode: 'all_pages',
        status: 'aborted',
        current_page_number: 3,
        requested_pages: [1, 2, 3, 4],
        completed_pages: [1, 2],
        failed_pages: [3],
        abort_requested: true,
        job_id: 'render-job-3',
        error_message: null,
        created_at: '2026-04-24T00:00:00.000Z',
        started_at: '2026-04-24T00:00:01.000Z',
        completed_at: '2026-04-24T00:00:05.000Z',
      },
    }

    render(<ProgressRow job={job} onOpen={vi.fn()} />)

    expect(screen.getByText('渲染任务')).toBeInTheDocument()
    expect(screen.getByText('页数 2/4')).toBeInTheDocument()
    expect(screen.getByText('当前第 3 页')).toBeInTheDocument()
    expect(screen.getByText('已中止')).toBeInTheDocument()
  })

  it('translates known backend worker warnings', () => {
    const job: ActiveJobEntry = {
      job_id: 'render-job-queued',
      render_run_id: 45,
      comic_id: 9,
      stage: 'render',
      status: 'queued',
      title: 'Queued Render Run',
      started_at: '2026-04-24T00:00:00.000Z',
      render_progress: { completed: 0, total: 2 },
      warning: 'No active RQ workers detected; job will remain queued.',
      render_run: {
        id: 45,
        comic_id: 9,
        user_id: 1,
        mode: 'all_pages',
        status: 'queued',
        current_page_number: null,
        requested_pages: [1, 2],
        completed_pages: [],
        failed_pages: [],
        abort_requested: false,
        job_id: 'render-job-queued',
        error_message: 'No active RQ workers detected; job will remain queued.',
        created_at: '2026-04-24T00:00:00.000Z',
        started_at: null,
        completed_at: null,
      },
    }

    render(<ProgressRow job={job} onOpen={vi.fn()} />)

    expect(screen.getAllByText('未检测到后台 Worker，任务会保持排队。')).toHaveLength(2)
  })
})

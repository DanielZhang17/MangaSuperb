import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PanelsApi from '@/apis/panels'
import { type ActiveJobEntry, activeJobsAtom } from '@/atoms'
import {
  currentComicDetailAtom,
  currentComicIdAtom,
  fullStoryAtom,
  mangaTitleAtom,
  styleAtom,
  workflowModeAtom,
} from '@/pages/comics/atoms'

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

vi.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, options?: any) => ({
      'title.activeJobs': '后台任务',
      'title.activeNow': `${options?.count ?? 0} 个任务进行中`,
      'title.noActiveJobs': '没有正在运行的任务',
      'empty.description': '后台生成任务启动后会显示在这里。',
      'toggle.open': '打开任务进度面板',
      'toggle.close': '关闭任务进度面板',
      'toggle.active': `${options?.count ?? 0} 个任务进行中`,
      'toggle.idle': '任务进度',
      'toggle.activeHint': '点击返回正在运行的工作流',
      'toggle.idleHint': '点击查看后台任务',
      'stage.outline': '故事',
      'stage.story': '故事',
      'stage.characters': '人物',
      'stage.panels': '分镜',
      'stage.shots': '分镜',
      'stage.render': '生图',
      'stage.preview': '预览',
      'stage.cover': '封面',
      'stage.export': '导出',
      'stage.publish': '发布',
      'stage.character_image': '人物生图',
      'stage.character_optimization': '人物优化',
      'status.running': '运行中',
      'status.aborted': '已中止',
      'status.failed': '失败',
      'status.completed': '完成',
      'status.queued': '排队中',
      'status.needsReview': '待确认',
      'status.reconnecting': '重连中',
      'job.autoRun': '自动漫画生成',
      'job.renderRun': '渲染任务',
      'job.characterImage': '人物生图',
      'job.characterOptimization': '人物优化',
      'job.stage': `阶段：${options?.stage ?? ''}`,
      'job.untitled': '未命名任务',
      'meta.pages': `页数 ${options?.completed}/${options?.total}`,
      'meta.currentPage': `当前第 ${options?.page} 页`,
      'meta.failedCount': `${options?.count} 个失败`,
      'meta.abortRequested': '正在中止',
      'meta.connectionUnstable': '连接不稳定',
      'action.abortRenderRun': '中止渲染任务',
      'action.abort': '中止',
      'error.abortFailed': '中止渲染任务失败',
    }[key] ?? key),
  }),
}))

vi.mock('@/apis/panels', () => ({
  default: {
    abortRenderRun: vi.fn(),
  },
}))

const abortRenderRunMock = vi.mocked(PanelsApi.abortRenderRun)

function LocationProbe() {
  const location = useLocation()

  return <span data-testid="location-path">{location.pathname}</span>
}

describe('ProgressShelf', () => {
  beforeEach(() => {
    ;(globalThis as any).__mockShelfJobs = undefined
    window.localStorage.clear()
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

  it('collapses to a circular progress button', () => {
    const store = createStore()
    store.set(activeJobsAtom, [])

    render(
      <Provider store={store}>
        <MemoryRouter>
          <ProgressShelf />
        </MemoryRouter>
      </Provider>,
    )

    const orb = screen.getByTestId('progress-shelf-orb')

    expect(orb).toHaveClass('h-14', 'w-14', 'rounded-full')
    expect(screen.queryByText('点击返回正在运行的工作流')).not.toBeInTheDocument()
    expect(screen.queryByText('Abortable Render Run')).not.toBeInTheDocument()
  })

  it('drags the collapsed button and snaps it half-hidden to the closest edge', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 })
    window.localStorage.setItem('progress-shelf-position', JSON.stringify({ x: 100, y: 100, edge: 'left' }))
    ;(globalThis as any).__mockShelfJobs = []
    const store = createStore()
    store.set(activeJobsAtom, [])

    render(
      <Provider store={store}>
        <MemoryRouter>
          <ProgressShelf />
        </MemoryRouter>
      </Provider>,
    )

    const orb = screen.getByTestId('progress-shelf-orb')
    fireEvent.mouseDown(orb, { button: 0, clientX: 128, clientY: 128 })
    fireEvent.mouseMove(window, { clientX: 18, clientY: 228 })
    fireEvent.mouseUp(window)

    expect(orb).toHaveStyle({ left: '-28px', top: '200px' })
    expect(JSON.parse(window.localStorage.getItem('progress-shelf-position') || '{}')).toMatchObject({
      edge: 'left',
      x: -28,
      y: 200,
    })
  })

  it('stays openable when there are no active jobs', () => {
    ;(globalThis as any).__mockShelfJobs = []
    const store = createStore()
    store.set(activeJobsAtom, [])

    render(
      <Provider store={store}>
        <MemoryRouter>
          <ProgressShelf />
        </MemoryRouter>
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /任务进度/i }))

    expect(screen.getByText('没有正在运行的任务')).toBeInTheDocument()
  })

  it('shows active character creation jobs in the floating shelf', () => {
    ;(globalThis as any).__mockShelfJobs = [{
      job_id: 'character-image-job',
      kind: 'character_image',
      character_id: 12,
      stage: 'character_image',
      status: 'processing',
      title: 'Nova',
      started_at: '2026-05-10T00:00:00.000Z',
    }]
    const store = createStore()
    store.set(activeJobsAtom, [])

    render(
      <Provider store={store}>
        <MemoryRouter>
          <ProgressShelf />
        </MemoryRouter>
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /1 个任务进行中/i }))

    expect(screen.getByText('Nova')).toBeInTheDocument()
    expect(screen.getAllByText('人物生图').length).toBeGreaterThan(0)
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

    fireEvent.click(screen.getByRole('button', { name: /1 个任务进行中/i }))
    fireEvent.click(screen.getByRole('button', { name: /中止渲染任务/i }))

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

    fireEvent.click(screen.getByRole('button', { name: /1 个任务进行中/i }))
    fireEvent.click(screen.getByRole('button', { name: /中止渲染任务/i }))

    await waitFor(() => {
      expect(abortRenderRunMock).toHaveBeenCalledWith(909)
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /中止渲染任务/i })).not.toBeDisabled()
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

    fireEvent.click(screen.getByRole('button', { name: /2 个任务进行中/i }))

    expect(screen.getByRole('button', { name: /中止渲染任务/i })).toBeInTheDocument()
    expect(screen.getByText('渲染任务')).toBeInTheDocument()
  })

  it('hydrates the comic workflow when opening a comic job', async () => {
    ;(globalThis as any).__mockShelfJobs = [{
      job_id: 'outline-job-1',
      comic_id: 77,
      stage: 'outline',
      status: 'running',
      title: 'Shelf Comic',
      started_at: '2026-05-10T00:00:00.000Z',
      comic: {
        id: 77,
        title: 'Shelf Comic',
        style_description: 'Shelf saved style',
        script: {
          content: JSON.stringify({ story: 'Story restored from the progress shelf.' }),
        },
      },
    }]
    const store = createStore()
    store.set(activeJobsAtom, [])

    render(
      <Provider store={store}>
        <MemoryRouter>
          <ProgressShelf />
        </MemoryRouter>
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /1 个任务进行中/i }))
    fireEvent.click(await screen.findByText('Shelf Comic'))

    expect(store.get(currentComicIdAtom)).toBe(77)
    expect(store.get(currentComicDetailAtom)?.id).toBe(77)
    expect(store.get(mangaTitleAtom)).toBe('Shelf Comic')
    expect(store.get(fullStoryAtom)).toBe('Story restored from the progress shelf.')
    expect(store.get(styleAtom)).toBe('Shelf saved style')
  })

  it('opens Auto-run jobs in Auto mode on the comics page', async () => {
    ;(globalThis as any).__mockShelfJobs = [{
      job_id: 'auto-run-job-12',
      kind: 'auto_run',
      auto_run_id: 12,
      comic_id: 88,
      stage: 'render',
      status: 'running',
      title: 'Auto Shelf Run',
      started_at: '2026-05-10T00:00:00.000Z',
      render_progress: { completed: 2, failed: 0, total: 6, current_page_number: 3 },
      auto_run: {
        id: 12,
        comic_id: 88,
        user_id: 1,
        status: 'running',
        current_stage: 'render',
        story_snapshot: 'Auto story',
        title_snapshot: 'Auto Shelf Run',
        preferences_snapshot: {},
        character_review: null,
        selected_character_ids: [],
        render_run_id: null,
        render_run: null,
        render_progress: { completed: 2, failed: 0, total: 6, current_page_number: 3 },
        abort_requested: false,
        job_id: 'auto-run-job-12',
        error_message: null,
        created_at: '2026-05-10T00:00:00.000Z',
        started_at: '2026-05-10T00:00:01.000Z',
        completed_at: null,
        updated_at: '2026-05-10T00:00:01.000Z',
      },
    }]
    const store = createStore()
    store.set(activeJobsAtom, [])
    store.set(workflowModeAtom, 'pro')

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <ProgressShelf />
          <LocationProbe />
        </MemoryRouter>
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /1 个任务进行中/i }))
    fireEvent.click(await screen.findByText('Auto Shelf Run'))

    await waitFor(() => {
      expect(screen.getByTestId('location-path')).toHaveTextContent('/comics')
    })
    expect(store.get(workflowModeAtom)).toBe('auto')
    expect(store.get(currentComicIdAtom)).toBe(88)
  })

  it('shows Auto-run character creation as its own shelf stage', async () => {
    ;(globalThis as any).__mockShelfJobs = [{
      job_id: 'auto-run-job-characters',
      kind: 'auto_run',
      auto_run_id: 13,
      comic_id: 89,
      stage: 'characters',
      status: 'running',
      title: 'Auto Character Run',
      started_at: '2026-05-10T00:00:00.000Z',
      workflow_stages: [
        { stage: 'outline', status: 'completed' },
        { stage: 'shots', status: 'pending' },
        { stage: 'render', status: 'pending' },
      ],
      auto_run: {
        id: 13,
        comic_id: 89,
        user_id: 1,
        status: 'running',
        current_stage: 'characters',
        story_snapshot: 'Auto story',
        title_snapshot: 'Auto Character Run',
        preferences_snapshot: {},
        character_review: null,
        selected_character_ids: [],
        render_run_id: null,
        render_run: null,
        render_progress: null,
        abort_requested: false,
        job_id: 'auto-run-job-characters',
        error_message: null,
        created_at: '2026-05-10T00:00:00.000Z',
        started_at: '2026-05-10T00:00:01.000Z',
        completed_at: null,
        updated_at: '2026-05-10T00:00:01.000Z',
      },
    }]
    const store = createStore()
    store.set(activeJobsAtom, [])

    render(
      <Provider store={store}>
        <MemoryRouter>
          <ProgressShelf />
        </MemoryRouter>
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /1 个任务进行中/i }))

    expect(screen.getByText('Auto Character Run')).toBeInTheDocument()
    expect(screen.getAllByText('人物').length).toBeGreaterThan(0)
    expect(screen.getAllByText('预览').length).toBeGreaterThan(0)
  })
})

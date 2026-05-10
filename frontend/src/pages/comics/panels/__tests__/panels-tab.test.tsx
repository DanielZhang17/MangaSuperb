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
    t: (key: string, options?: any) => ({
      'title.panelsPage': '分镜',
      'panels.status': `${options?.count} 个镜头 · 当前第 ${options?.page} 页`,
      'panels.emptyStatus': '还没有可用镜头',
      'panels.emptyHint': '暂无分镜数据，请点击下侧“生成分镜”。',
      'panels.layout': '布局',
      'panels.pageSelection': '页面选择',
      'panels.selectPage': '选择页面',
      'panels.pageOption': `第${options?.page}页`,
      'panels.pageLayout': '页面布局',
      'panels.submit': '生成分镜',
      'panels.submitting': '提交中…',
      'panels.generatingButton': `生成分镜中… ${options?.pct}%`,
      'panels.created': '漫画已创建',
      'panels.submitted': '已提交分镜生成任务',
      'panels.success': '分镜生成成功',
      'panels.failure': '分镜任务失败',
      'panels.failedPrefix': `分镜生成失败：${options?.message}`,
      'panels.timeout': '分镜数据生成超时，请检查文本模型或任务队列状态',
      'grid.autoGrid': '自动布局',
      'grid.4panel': '四宫格',
      'grid.leftMainRightMinor': '左主右辅',
      'grid.rightLongBar': '右侧长栏',
      'editor.untitled': '未命名',
      'common.next': '下一步',
      'preference.auto': '自动',
    }[key] ?? key),
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

  it('shows only the shots for the selected page', async () => {
    const store = createStore()
    store.set(currentComicIdAtom, 12)
    store.set(currentComicDetailAtom, {
      id: 12,
      panel_shots: [
        {
          id: 101,
          page_number: 1,
          panel_number: 1,
          sequence_index: 1,
          description: 'Page one opening',
        },
        {
          id: 201,
          page_number: 2,
          panel_number: 1,
          sequence_index: 2,
          description: 'Page two reveal',
        },
      ],
    } as any)

    render(
      <Provider store={store}>
        <PanelsTab />
      </Provider>,
    )

    expect(screen.getByText('Page one opening')).toBeInTheDocument()
    expect(screen.queryByText('Page two reveal')).not.toBeInTheDocument()

    fireEvent.keyDown(screen.getAllByRole('combobox')[0], { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('option', { name: '第02页' }))

    await waitFor(() => {
      expect(screen.getByText('Page two reveal')).toBeInTheDocument()
    })
    expect(screen.queryByText('Page one opening')).not.toBeInTheDocument()
  })
})

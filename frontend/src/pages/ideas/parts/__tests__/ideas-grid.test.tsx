import { fireEvent, render, screen } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import useSWR from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  activeTabAtom,
  charactersCompletedAtom,
  currentComicDetailAtom,
  currentComicIdAtom,
  fullStoryAtom,
  mangaTitleAtom,
  selectedCharacterIdsAtom,
  selectedCharacterRolesAtom,
  storyCompletedAtom,
  styleAtom,
  workflowModeAtom,
} from '@/pages/comics/atoms'

import IdeasGrid from '../ideas-grid'

const navigateMock = vi.fn()

vi.mock('react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('swr', () => ({
  default: vi.fn(),
}))

vi.mock('@/hooks/use-auth', () => ({
  default: () => ({
    user: { id: 1, username: 'creator', email: 'creator@example.com' },
  }),
}))

vi.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      if (key === 'comics:common.back') return '返回编辑'
      if (key === 'me:username.guest') return '未登录'

      return key
    },
  }),
}))

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' '),
  proxiedStatic: (url?: string | null) => url || '',
}))

vi.mock('@/apis/comics', () => ({
  ComicsApi: {
    list: vi.fn(),
    publish: vi.fn(),
  },
}))

describe('IdeasGrid', () => {
  beforeEach(() => {
    navigateMock.mockClear()
    vi.mocked(useSWR).mockReset()
  })

  it('shows a return-to-edit action and restores the selected comic workflow state', () => {
    const comic = {
      id: 42,
      title: '校园短篇',
      style_description: '日式校园漫画风格',
      aspect_ratio: '3:4',
      script: {
        content: JSON.stringify({
          story: 'A restored story from the saved comic.',
        }),
      },
      pages: [{ id: 9, page_number: 1, image_url: 'https://cdn.example.com/page-1.png' }],
      panel_shots: [{ id: 1, page_number: 1, panel_number: 1 }],
      characters: [
        { id: 7, character_id: 7, role: 'protagonist', order_index: 1 },
      ],
    }
    vi.mocked(useSWR).mockReturnValue({
      data: { comics: [comic], count: 1 },
      isLoading: false,
      error: null,
    } as any)
    const store = createStore()
    store.set(workflowModeAtom, 'auto')

    render(
      <Provider store={store}>
        <IdeasGrid />
      </Provider>,
    )

    const editButton = screen.getByRole('button', { name: '返回编辑 校园短篇' })
    fireEvent.click(editButton)

    expect(store.get(currentComicIdAtom)).toBe(42)
    expect(store.get(currentComicDetailAtom)).toEqual(comic)
    expect(store.get(mangaTitleAtom)).toBe('校园短篇')
    expect(store.get(fullStoryAtom)).toBe('A restored story from the saved comic.')
    expect(store.get(styleAtom)).toBe('日式校园漫画风格')
    expect(store.get(storyCompletedAtom)).toBe(true)
    expect(store.get(charactersCompletedAtom)).toBe(true)
    expect(store.get(selectedCharacterIdsAtom)).toEqual([7])
    expect(store.get(selectedCharacterRolesAtom)).toEqual({ 7: 'protagonist' })
    expect(store.get(workflowModeAtom)).toBe('auto')
    expect(store.get(activeTabAtom)).toBe('image-generation')
    expect(navigateMock).toHaveBeenCalledWith('/comics')
  })
})

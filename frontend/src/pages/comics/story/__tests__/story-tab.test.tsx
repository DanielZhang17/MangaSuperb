import { fireEvent, render, screen } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { describe, expect, it, vi } from 'vitest'

import { activeTabAtom, mangaTitleAtom } from '../../atoms'
import { StoryTab } from '../story-tab'

vi.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      'common.next': 'common.next',
      'story.confirmTitle': '确认漫画名称',
      'story.confirmDescription': '这个名称会用于后续分镜、生图和发布展示。',
      'story.titleLabel': '漫画名称',
      'story.continueCharacters': '继续选择人物',
      'story.titleRequired': '请输入漫画名称',
    }[key] ?? key),
  }),
}))

vi.mock('../ai-model-card', () => ({
  AIModelCard: () => <div>AI model card</div>,
}))

vi.mock('../manga-style-card', () => ({
  MangaStyleCard: () => <div>Manga style card</div>,
}))

vi.mock('../manga-format-card', () => ({
  MangaFormatCard: () => <div>Manga format card</div>,
}))

vi.mock('../manga-grid-layout-card', () => ({
  MangaGridLayoutCard: () => <div>Manga grid card</div>,
}))

describe('StoryTab', () => {
  it('asks the user to confirm the manga title before moving to character selection', () => {
    const store = createStore()
    store.set(mangaTitleAtom, 'Draft title')

    render(
      <Provider store={store}>
        <StoryTab />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'common.next' }))

    expect(screen.getByRole('dialog')).toHaveTextContent('确认漫画名称')
    expect(store.get(activeTabAtom)).toBe('story')

    fireEvent.change(screen.getByLabelText('漫画名称'), {
      target: { value: 'New title' },
    })
    fireEvent.click(screen.getByRole('button', { name: '继续选择人物' }))

    expect(store.get(mangaTitleAtom)).toBe('New title')
    expect(store.get(activeTabAtom)).toBe('characters')
  })
})

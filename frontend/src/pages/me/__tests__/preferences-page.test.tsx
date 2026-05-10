import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { userAtom } from '@/atoms'

import CharacterSettingsPage from '../index'

const updatePreferencesMock = vi.fn()
const updateUsernameMock = vi.fn()

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value: vi.fn(() => false),
  })
})

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    updateUsername: updateUsernameMock,
  }),
}))

vi.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      'username.guest': '访客',
      'username.placeholder': '用户名',
      'username.save': '保存',
      'settings.creatorDefaults': '创作默认设置',
      'settings.automation': '自动化',
      'settings.pageDefaults': '页面默认值',
      'settings.lettering': '文字与气泡',
      'settings.characters': '角色',
      'settings.textModel': '文本模型',
      'settings.imageModel': '生图模型',
      'settings.style': '风格',
      'settings.pageLayout': '页面布局',
      'settings.aspectRatio': '画幅比例',
      'settings.color': '颜色',
      'settings.font': '字体',
      'settings.fontSize': '字号',
      'settings.bubbleShape': '气泡形状',
      'settings.bubbleTails': '气泡尾巴',
      'options.autoCreateMissingCharacters': '自动创建缺失角色',
      'options.layout.autoGrid': '自动布局',
      'options.layout.grid2x2': '四宫格',
      'options.color.blackWhite': '黑白',
      'options.color.color': '彩色',
      'options.bubbleShape.rect': '矩形',
      'options.bubbleShape.round': '圆角',
      'options.bubbleTail.show': '显示尾巴',
      'options.bubbleTail.hide': '无尾巴',
      'preference.auto': '自动',
      'common:preference.auto': '自动',
    }[key] ?? key),
  }),
}))

vi.mock('@/hooks/use-ai-providers', () => ({
  AI_PROVIDER_LABELS: {
    gemini: 'Gemini',
    third_party: 'OpenAI',
  },
  useAiProviders: () => ({
    providers: {
      defaults: { image: 'gemini', text: 'gemini' },
      providers: {
        gemini: { image: true, text: true },
        third_party: { image: true, text: true },
      },
    },
    imageProviders: ['gemini', 'third_party'],
    textProviders: ['gemini', 'third_party'],
    loading: false,
  }),
}))

vi.mock('@/hooks/use-preferences', () => ({
  usePreferences: () => ({
    preferences: (globalThis as any).__mockPreferences,
    layoutOptions: ['auto-grid', 'grid-2x2'],
    colorModes: ['black-white', 'color'],
    loading: false,
    update: updatePreferencesMock,
  }),
}))

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' '),
  getAvatarUrl: () => 'https://cdn.example.com/avatar.png',
  proxiedStatic: (url?: string | null) => url || '',
}))

function renderPage() {
  const store = createStore()
  store.set(userAtom, {
    id: 1,
    username: 'tester',
    email: 'tester@example.com',
    avatar_index: 1,
    created_at: '2026-05-10T00:00:00Z',
    preferences: (globalThis as any).__mockPreferences,
  })

  render(
    <Provider store={store}>
      <CharacterSettingsPage />
    </Provider>,
  )
}

describe('CharacterSettingsPage preferences', () => {
  beforeEach(() => {
    updatePreferencesMock.mockReset()
    updatePreferencesMock.mockResolvedValue({
      preferences: (globalThis as any).__mockPreferences,
      available_options: {},
      layout_options: ['auto-grid', 'grid-2x2'],
      color_modes: ['black-white', 'color'],
    })
    updateUsernameMock.mockReset()
    ;(globalThis as any).__mockPreferences = {
      version: 2,
      style_presets: [
        {
          value: 'Classic manga black and white linework.',
          label: '经典黑白漫画线稿',
          is_custom: false,
        },
      ],
      fields: {
        style: { mode: 'auto' },
        page_layout: { mode: 'auto' },
        aspect_ratio: { mode: 'auto' },
        text_provider: { mode: 'auto' },
        image_provider: { mode: 'auto' },
        color_mode: { mode: 'auto' },
        font_family: { mode: 'auto' },
        font_size: { mode: 'auto' },
        bubble_shape: { mode: 'auto' },
        bubble_tail: { mode: 'auto' },
        character_detection: { mode: 'auto' },
      },
    }
  })

  it('renders canonical workflow preferences as Auto by default', () => {
    renderPage()

    expect(screen.getByText('创作默认设置')).toBeInTheDocument()
    expect(screen.getByText('自动化')).toBeInTheDocument()
    expect(screen.getByText('页面默认值')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '风格' })).toHaveTextContent('自动')
    expect(screen.getByRole('combobox', { name: '页面布局' })).toHaveTextContent('自动')
    expect(screen.getByRole('combobox', { name: '文本模型' })).toHaveTextContent('自动')
    expect(screen.queryByText('国漫风')).not.toBeInTheDocument()
  })

  it('saves preference field changes through the preferences API hook', async () => {
    renderPage()

    fireEvent.keyDown(screen.getByRole('combobox', { name: '页面布局' }), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('option', { name: '四宫格' }))

    await waitFor(() => {
      expect(updatePreferencesMock).toHaveBeenCalledWith({
        fields: {
          page_layout: { mode: 'manual', value: 'grid-2x2' },
        },
      })
    })
  })
})

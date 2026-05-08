import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { act } from 'react'
import toast from 'react-hot-toast'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fullStoryAtom } from '../../atoms'
import { StoryEditor } from '../story-editor'

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/apis/comics', () => ({
  default: { update: vi.fn().mockResolvedValue({}) },
}))

vi.mock('@/apis/stories', () => ({
  default: { enhance: vi.fn() },
}))

let mockReader: {
  result: string | null
  onload: ((e: any) => void) | null
  onerror: ((e: any) => void) | null
  readAsText: ReturnType<typeof vi.fn>
}

vi.stubGlobal('FileReader', vi.fn().mockImplementation(() => {
  mockReader = { result: null, onload: null, onerror: null, readAsText: vi.fn() }

  return mockReader
}))

function renderEditor(initialContent = '') {
  const store = createStore()
  store.set(fullStoryAtom, initialContent)

  return {
    store,
    ...render(
      <Provider store={store}>
        <StoryEditor />
      </Provider>,
    ),
  }
}

function triggerFileInput(
  container: HTMLElement,
  fileName = 'story.txt',
  mimeType = 'text/plain',
) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  const file = new File(['placeholder'], fileName, { type: mimeType })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

function resolveReader(content: string) {
  act(() => {
    mockReader.result = content
    mockReader.onload?.({ target: mockReader })
  })
}

describe('StoryEditor — file import', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear()
  })

  it('loads .txt content directly into empty textarea', async () => {
    const { store, container } = renderEditor('')
    triggerFileInput(container)
    resolveReader('Imported story content')
    await waitFor(() => expect(store.get(fullStoryAtom)).toBe('Imported story content'))
  })

  it('opens confirm dialog when textarea already has content', async () => {
    const { container } = renderEditor('Existing content')
    triggerFileInput(container)
    resolveReader('New content')
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })

  it('replaces existing content when Replace is clicked', async () => {
    const { store, container } = renderEditor('Existing content')
    triggerFileInput(container)
    resolveReader('New content')
    await waitFor(() => screen.getByRole('dialog'))
    fireEvent.click(screen.getByRole('button', { name: /replace|替换|取代/i }))
    await waitFor(() => expect(store.get(fullStoryAtom)).toBe('New content'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('appends to existing content when Append is clicked', async () => {
    const { store, container } = renderEditor('Existing content')
    triggerFileInput(container)
    resolveReader('New content')
    await waitFor(() => screen.getByRole('dialog'))
    fireEvent.click(screen.getByRole('button', { name: /append|追加/i }))
    await waitFor(() =>
      expect(store.get(fullStoryAtom)).toBe('Existing content\n\nNew content'),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('leaves content unchanged when Cancel is clicked', async () => {
    const { store, container } = renderEditor('Existing content')
    triggerFileInput(container)
    resolveReader('New content')
    await waitFor(() => screen.getByRole('dialog'))
    fireEvent.click(screen.getByRole('button', { name: /cancel|取消/i }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(store.get(fullStoryAtom)).toBe('Existing content')
  })

  it('shows error toast for wrong file type', () => {
    const { container } = renderEditor('')
    triggerFileInput(container, 'story.pdf', 'application/pdf')
    expect(toast.error).toHaveBeenCalled()
  })

  it('shows error toast for empty file', async () => {
    const { container } = renderEditor('')
    triggerFileInput(container)
    resolveReader('   ')
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
  })

  it('shows error toast when FileReader fails', async () => {
    const { container } = renderEditor('')
    triggerFileInput(container)
    act(() => {
      mockReader.onerror?.(new Event('error'))
    })
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
  })
})

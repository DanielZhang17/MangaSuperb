# Text File Upload for Story Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to populate the story textarea by uploading a `.txt` file via a toolbar button or by dragging the file onto the textarea, with a confirmation dialog when existing content would be overwritten.

**Architecture:** A `useFileImport` hook is defined in `story-editor.tsx` and owns all file logic — a hidden `<input type="file">` ref, a `FileReader`-based `handleFile` function, drag-drop event handlers, and a `confirmPending` state that drives a Radix Dialog. The hook reads and writes `fullStoryAtom` directly. No backend changes.

**Tech Stack:** React 19, Jotai v2, Radix UI Dialog, Lucide icons, react-hot-toast, Vitest + @testing-library/react (jsdom)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `frontend/src/i18n/index.ts` | Add 8 new i18n keys under `comics` in all 3 locales |
| Modify | `frontend/src/pages/comics/story/story-editor.tsx` | Add `useFileImport` hook, upload button, drag-drop wrapper, confirm dialog |
| Create | `frontend/src/pages/comics/story/__tests__/story-editor.test.tsx` | Test file import behaviour |

---

## Task 1: Add i18n keys

**Files:**
- Modify: `frontend/src/i18n/index.ts`

- [ ] **Step 1: Add keys to `zh-CN` `comics` block**

In the `zh-CN` → `comics` object (around line 53), add after `'publish.pdfCopied'`:

```ts
      'editor.import.button': '上传文本文件',
      'editor.import.dialogTitle': '导入文件',
      'editor.import.dialogBody': '当前已有故事内容，请选择操作',
      'editor.import.replace': '替换',
      'editor.import.append': '追加',
      'editor.import.emptyFile': '文件内容为空',
      'editor.import.readError': '文件读取失败',
      'editor.import.wrongType': '仅支持 .txt 文件',
```

- [ ] **Step 2: Add keys to `zh-TW` `comics` block**

In the `zh-TW` → `comics` object, add after `'publish.pdfCopied'`:

```ts
      'editor.import.button': '上傳文字檔案',
      'editor.import.dialogTitle': '匯入文件',
      'editor.import.dialogBody': '目前已有故事內容，請選擇操作',
      'editor.import.replace': '取代',
      'editor.import.append': '追加',
      'editor.import.emptyFile': '文件內容為空',
      'editor.import.readError': '文件讀取失敗',
      'editor.import.wrongType': '僅支援 .txt 檔案',
```

- [ ] **Step 3: Add keys to `en` `comics` block**

In the `en` → `comics` object, add after `'publish.pdfCopied'`:

```ts
      'editor.import.button': 'Upload text file',
      'editor.import.dialogTitle': 'Import File',
      'editor.import.dialogBody': 'Story already has content, choose an action',
      'editor.import.replace': 'Replace',
      'editor.import.append': 'Append',
      'editor.import.emptyFile': 'File is empty',
      'editor.import.readError': 'Failed to read file',
      'editor.import.wrongType': 'Only .txt files are supported',
```

- [ ] **Step 4: Verify no TypeScript errors**

```bash
cd /root/code/dev/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (or only pre-existing errors unrelated to i18n).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/i18n/index.ts
git commit -m "i18n: add file import keys to comics namespace"
```

---

## Task 2: Write failing tests

**Files:**
- Create: `frontend/src/pages/comics/story/__tests__/story-editor.test.tsx`

- [ ] **Step 1: Create the test file**

Create `frontend/src/pages/comics/story/__tests__/story-editor.test.tsx` with this content:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { Provider, createStore } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'

import { fullStoryAtom } from '../atoms'
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
      </Provider>
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
```

- [ ] **Step 2: Run tests — expect all to fail**

```bash
cd /root/code/dev/frontend && npm test -- story-editor 2>&1 | tail -30
```

Expected output: 7 failing tests. The failures should be about missing elements (`input[type="file"]` not found, upload button missing). If you see import errors instead, fix the import paths before continuing.

- [ ] **Step 3: Commit the failing tests**

```bash
git add frontend/src/pages/comics/story/__tests__/story-editor.test.tsx
git commit -m "tests: add failing tests for story panel file import"
```

---

## Task 3: Implement `useFileImport` + UI changes

**Files:**
- Modify: `frontend/src/pages/comics/story/story-editor.tsx`

- [ ] **Step 1: Replace `story-editor.tsx` with the full implementation**

Replace the entire contents of `frontend/src/pages/comics/story/story-editor.tsx` with:

```tsx
import { useAtom } from 'jotai'
import { Loader2, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'

import InlineInput from '@/components/common/inline-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/hooks/use-i18n'

import ComicsApi from '@/apis/comics'
import StoriesApi from '@/apis/stories'
import {
  currentComicIdAtom,
  fullStoryAtom,
  mangaTitleAtom,
  storyPanelsAtom,
  storyStepAtom,
} from '../atoms'

function useFileImport() {
  const { t } = useI18n('comics')
  const [content, setContent] = useAtom(fullStoryAtom)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingTextRef = useRef<string>('')
  const [confirmPending, setConfirmPending] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.txt') && file.type !== 'text/plain') {
      toast.error(String(t('editor.import.wrongType')))
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = ((e.target?.result as string) ?? '').trim()
      if (!text) {
        toast.error(String(t('editor.import.emptyFile')))
        return
      }
      if (content.trim()) {
        pendingTextRef.current = text
        setConfirmPending(true)
      } else {
        setContent(text)
      }
    }
    reader.onerror = () => {
      toast.error(String(t('editor.import.readError')))
    }
    reader.readAsText(file)
  }

  const handleReplace = () => {
    setContent(pendingTextRef.current)
    pendingTextRef.current = ''
    setConfirmPending(false)
  }

  const handleAppend = () => {
    setContent(content + '\n\n' + pendingTextRef.current)
    pendingTextRef.current = ''
    setConfirmPending(false)
  }

  const handleCancel = () => {
    pendingTextRef.current = ''
    setConfirmPending(false)
  }

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const openFilePicker = () => fileInputRef.current?.click()

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = () => setIsDragging(false)

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return {
    fileInputRef,
    confirmPending,
    isDragging,
    handleReplace,
    handleAppend,
    handleCancel,
    onFileInputChange,
    openFilePicker,
    onDragOver,
    onDragLeave,
    onDrop,
  }
}

export function StoryEditor() {
  const { t } = useI18n('comics')
  const [title, setTitle] = useAtom(mangaTitleAtom)
  const [content, setContent] = useAtom(fullStoryAtom)
  const [comicId] = useAtom(currentComicIdAtom)
  const [enhancing, setEnhancing] = useState(false)

  const {
    fileInputRef,
    confirmPending,
    isDragging,
    handleReplace,
    handleAppend,
    handleCancel,
    onFileInputChange,
    openFilePicker,
    onDragOver,
    onDragLeave,
    onDrop,
  } = useFileImport()

  const charCount = content.replace(/\s/g, '').length

  const handleTitleUpdate = async (newTitle: string) => {
    setTitle(newTitle)
    if (comicId) {
      try {
        await ComicsApi.update(comicId, { title: newTitle })
        toast.success('标题已更新')
      } catch (err: any) {
        toast.error(err?.message || '更新标题失败')
      }
    }
  }

  const handleEnhance = async () => {
    const trimmed = content.trim()
    if (!trimmed) {
      toast.error('请先输入故事内容')
      return
    }
    setEnhancing(true)
    try {
      const resp = await StoriesApi.enhance({ story: trimmed, comic_id: comicId ?? undefined })
      const enhanced = typeof resp?.story === 'string' ? resp.story.trim() : ''
      if (!enhanced) {
        toast.error('未获得优化结果，请稍后重试')
      } else {
        setContent(enhanced)
        toast.success('剧情已优化')
      }
    } catch (err: any) {
      toast.error(err?.message || '优化失败，请稍后重试')
    } finally {
      setEnhancing(false)
    }
  }

  return (
    <div className="md:col-span-2 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <InlineInput
          initialValue={title}
          onSubmit={handleTitleUpdate}
          placeholder={String(t('editor.placeholderTitle'))}
          className="flex-1 min-w-0"
          renderDisplay={(val) => {
            const display = val?.trim() ? val : String(t('editor.untitled'))
            return (
              <div
                className="text-2xl font-semibold tracking-tight text-foreground truncate"
                title={display}
              >
                {display}
              </div>
            )
          }}
          submitLabel={String(t('editor.save'))}
        />
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 px-3"
          onClick={openFilePicker}
          title={String(t('editor.import.button'))}
          aria-label={String(t('editor.import.button'))}
        >
          <Upload className="h-4 w-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          className="hidden"
          tabIndex={-1}
          onChange={onFileInputChange}
        />
        <Button
          variant="outline"
          size="sm"
          className="ml-auto shrink-0 whitespace-nowrap px-4 sm:px-6"
          onClick={handleEnhance}
          disabled={enhancing || !content.trim()}
        >
          {enhancing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          AI 增强剧情
        </Button>
      </div>
      <div
        className={`relative rounded-2xl border bg-card/40 p-2${isDragging ? ' ring-2 ring-primary/50' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <Textarea
          placeholder="..."
          className="resize-none text-base leading-relaxed sm:text-lg min-h-[220px] max-h-[360px] overflow-y-auto pr-4 scrollbar-themed sm:min-h-[260px] sm:max-h-[420px] lg:min-h-[400px] lg:max-h-[600px]"
          value={content}
          aria-describedby="story-char-count"
          onChange={(e) => setContent(e.target.value)}
        />
        <div
          id="story-char-count"
          className="pointer-events-none absolute bottom-3 right-6 text-xs text-muted-foreground sm:text-sm"
        >
          {charCount}/1000字
        </div>
      </div>

      <Dialog open={confirmPending} onOpenChange={(open) => { if (!open) handleCancel() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{String(t('editor.import.dialogTitle'))}</DialogTitle>
            <DialogDescription>{String(t('editor.import.dialogBody'))}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={handleCancel}>
              {String(t('cancel', { ns: 'common' }))}
            </Button>
            <Button variant="outline" onClick={handleReplace}>
              {String(t('editor.import.replace'))}
            </Button>
            <Button onClick={handleAppend}>
              {String(t('editor.import.append'))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function PanelsView() {
  const { t } = useI18n('comics')
  const [, setStoryStep] = useAtom(storyStepAtom)
  const [panels, setPanels] = useAtom(storyPanelsAtom)

  const handleDelete = (removeIndex: number) => {
    setPanels((prev) =>
      prev
        .filter((_, i) => i !== removeIndex)
        .map((p, i) => ({ ...p, id: i + 1 })),
    )
  }

  return (
    <div className="space-y-8 mt-4">
      <Card>
        <CardContent className="p-6 space-y-4">
          {panels.map((panel, index) => (
            <div key={panel.id} className="flex items-start gap-4 p-4 border rounded-md">
              <div className="text-lg font-bold">{String(panel.id).padStart(2, '0')}</div>
              <div className="flex-1 text-muted-foreground">{panel.text}</div>
              <div className="ml-4 flex items-center gap-3 text-sm text-muted-foreground">
                <span>{panel.text.length}/100</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={String(t('panels.delete'))}
                  title={String(t('panels.delete'))}
                  onClick={() => handleDelete(index)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex justify-center gap-4">
        <Button size="lg" variant="outline" onClick={() => setStoryStep('input')}>
          {String(t('common.back'))}
        </Button>
        <Button size="lg" onClick={() => setStoryStep('generate')}>
          {String(t('common.next'))}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run the tests — expect all to pass**

```bash
cd /root/code/dev/frontend && npm test -- story-editor 2>&1 | tail -30
```

Expected: 7 passing tests. If any test fails, read the error carefully — common issues:
- Dialog not found: Radix portals render in `document.body`; `screen.getByRole('dialog')` searches the full document, so this should work. If not, check that the `open` prop is wired to `confirmPending`.
- Button name not matched: Check that the i18n keys are correctly set. The Cancel button uses `t('cancel', { ns: 'common' })` — key `'cancel'` in the `common` namespace. If it returns an empty string in tests, change the Cancel button to use the literal string `'取消'` and update the test regex accordingly.
- `toast.error` not called: Ensure `vi.mocked(toast.error).mockClear()` runs before each test and that the mock module path matches exactly.

- [ ] **Step 3: Run the full frontend test suite**

```bash
cd /root/code/dev/frontend && npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/comics/story/story-editor.tsx
git commit -m "feat: add .txt file upload and import to story editor"
```

---

## Task 4: Rebuild static files

**Files:**
- Rebuild: `frontend/dist/` → `mangasuperb/static/`

- [ ] **Step 1: Build the frontend**

```bash
cd /root/code/dev/frontend && npm run build 2>&1 | tail -10
```

Expected: `✓ built in Xs` with no errors.

- [ ] **Step 2: Copy to Flask static directory**

```bash
cd /root/code/dev && rm -rf mangasuperb/static/* && cp -r frontend/dist/* mangasuperb/static/
```

Verify the update:
```bash
ls -la /root/code/dev/mangasuperb/static/assets/ | head -5
```

Expected: recently timestamped `.js` and `.css` files.

- [ ] **Step 3: Run backend tests to confirm nothing broke**

```bash
cd /root/code/dev && source .venv/bin/activate && python -m pytest -q 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add mangasuperb/static/ frontend/src/
git commit -m "build: rebuild static files for .txt file import feature"
```

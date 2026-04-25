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

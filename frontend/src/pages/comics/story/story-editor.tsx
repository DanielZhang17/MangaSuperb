import { useAtom } from 'jotai'
import { Trash2, Upload } from 'lucide-react'
import type { ChangeEvent } from 'react'
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

import { fullStoryAtom, mangaTitleAtom, storyPanelsAtom, storyStepAtom } from '../atoms'

export function StoryEditor(){
  const { t } = useI18n('comics')
  const [title, setTitle] = useAtom(mangaTitleAtom)
  const [content, setContent] = useAtom(fullStoryAtom)
  const [pendingImport, setPendingImport] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // 创建漫画逻辑已移动到“生图”阶段，这里仅编辑文本与标题

  const charCount = content.replace(/\s/g, '').length
  const hasContent = content.trim().length > 0

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const applyImport = (nextContent: string) => {
    setContent(nextContent)
    setPendingImport(null)
    resetFileInput()
  }

  const handleImportedText = (text: string) => {
    if (!text.trim()) {
      toast.error('导入文件为空')
      resetFileInput()

      return
    }

    if (!hasContent) {
      applyImport(text)

      return
    }

    setPendingImport(text)
  }

  const closeImportDialog = () => {
    setPendingImport(null)
    resetFileInput()
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const isTextFile = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')

    if (!isTextFile) {
      toast.error('请导入 .txt 文本文件')
      resetFileInput()

      return
    }

    const reader = new FileReader()
    reader.onload = (loadEvent) => {
      const result = loadEvent.target?.result ?? reader.result
      handleImportedText(typeof result === 'string' ? result : '')
    }

    reader.onerror = () => {
      toast.error('文件读取失败，请重试')
      resetFileInput()
    }

    reader.readAsText(file)
  }

  return (
    <div className="md:col-span-2 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <InlineInput
          initialValue={title}
          onSubmit={(val) => setTitle(val)}
          placeholder={String(t('editor.placeholderTitle'))}
          renderDisplay={(val) => (
            <div className="text-2xl font-semibold tracking-tight w-fit">{val || String(t('editor.untitled'))}</div>
          )}
          submitLabel={String(t('editor.save'))}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,text/plain"
          className="sr-only"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="size-4" />
          导入 TXT
        </Button>
      </div>
      <div className="relative">
        <Textarea
          placeholder="..."
          className="resize-none text-xl md:text-xl h-[800px]"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="absolute bottom-4 right-4 text-sm text-muted-foreground">
          {charCount}/1000字
        </div>
      </div>
      <Dialog open={Boolean(pendingImport)} onOpenChange={(open) => !open && closeImportDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导入文本</DialogTitle>
            <DialogDescription>
              当前故事已有内容，请选择替换现有文本或追加到末尾。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeImportDialog}
            >
              取消 Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => pendingImport && applyImport(`${content}\n\n${pendingImport}`)}
            >
              追加 Append
            </Button>
            <Button
              type="button"
              onClick={() => pendingImport && applyImport(pendingImport)}
            >
              替换 Replace
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
    setPanels((prev) => prev
      .filter((_, i) => i !== removeIndex)
      .map((p, i) => ({ ...p, id: i + 1 })))
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
        <Button size="lg" variant="outline" onClick={() => setStoryStep('input')}>{String(t('common.back'))}</Button>
        <Button size="lg" onClick={() => setStoryStep('generate')}>{String(t('common.next'))}</Button>
      </div>
    </div>
  )
}

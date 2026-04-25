import { useAtom } from 'jotai'
import { Loader2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'

import InlineInput from '@/components/common/inline-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/hooks/use-i18n'

import ComicsApi from '@/apis/comics'
import StoriesApi from '@/apis/stories'
import { currentComicIdAtom, fullStoryAtom, mangaTitleAtom, storyPanelsAtom, storyStepAtom } from '../atoms'

export function StoryEditor(){
  const { t } = useI18n('comics')
  const [title, setTitle] = useAtom(mangaTitleAtom)
  const [content, setContent] = useAtom(fullStoryAtom)
  const [comicId] = useAtom(currentComicIdAtom)
  const [enhancing, setEnhancing] = useState(false)
  // 创建漫画逻辑已移动到"生图"阶段，这里仅编辑文本与标题

  const charCount = content.replace(/\s/g, '').length

  const handleTitleUpdate = async (newTitle: string) => {
    setTitle(newTitle)

    // If comic exists, persist to backend
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
          className="ml-auto shrink-0 whitespace-nowrap px-4 sm:px-6"
          onClick={handleEnhance}
          disabled={enhancing || !content.trim()}
        >
          {enhancing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          AI 增强剧情
        </Button>
      </div>
      <div className="relative rounded-2xl border bg-card/40 p-2">
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

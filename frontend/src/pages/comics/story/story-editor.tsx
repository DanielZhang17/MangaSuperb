import { useAtom } from 'jotai'
import { Trash2 } from 'lucide-react'

import InlineInput from '@/components/common/inline-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/hooks/use-i18n'

import { fullStoryAtom, mangaTitleAtom, storyPanelsAtom, storyStepAtom } from '../atoms'

export function StoryEditor(){
  const { t } = useI18n('comics')
  const [title, setTitle] = useAtom(mangaTitleAtom)
  const [content, setContent] = useAtom(fullStoryAtom)
  // 创建漫画逻辑已移动到“生图”阶段，这里仅编辑文本与标题

  const charCount = content.replace(/\s/g, '').length

  return (
    <div className="md:col-span-2 space-y-4">
      <div>
        <InlineInput
          initialValue={title}
          onSubmit={(val) => setTitle(val)}
          placeholder={String(t('editor.placeholderTitle'))}
          renderDisplay={(val) => (
            <div className="text-2xl font-semibold tracking-tight w-fit">{val || String(t('editor.untitled'))}</div>
          )}
          submitLabel={String(t('editor.save'))}
        />
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
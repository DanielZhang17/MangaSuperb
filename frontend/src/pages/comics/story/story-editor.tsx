import { useAtom } from 'jotai'
import { Trash2 } from 'lucide-react'

import InlineInput from '@/components/common/inline-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

import { mangaTitleAtom, storyPanelsAtom, storyStepAtom } from '../atoms'

export function StoryEditor(){
  const [title, setTitle] = useAtom(mangaTitleAtom)
  const [panels] = useAtom(storyPanelsAtom)

  return (
    <div className="md:col-span-2 space-y-4">
      <div>
        <InlineInput
          initialValue={title}
          onSubmit={(val) => setTitle(val)}
          placeholder="输入故事名称"
          renderDisplay={(val) => (
            <div className="text-2xl font-semibold tracking-tight w-fit">{val || '未命名'}</div>
          )}
          submitLabel="保存"
        />
      </div>
      <div className="relative">
        <Textarea
          placeholder="秦飞扬就宛如一个皮球般，伴随着痛苦的惨叫声，顺着石梯，朝下方滚去..."
          className="resize-none text-xl md:text-xl h-[800px]"
          defaultValue={panels.map((p) => p.text).join('\n\n')}
        />
        <div className="absolute bottom-4 right-4 text-sm text-muted-foreground">
              260/1000字
        </div>
      </div>
    </div>
  )
}

export function PanelsView() {
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
                  aria-label="删除分镜"
                  title="删除分镜"
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
        <Button size="lg" variant="outline" onClick={() => setStoryStep('input')}>返回编辑</Button>
        <Button size="lg" onClick={() => setStoryStep('generate')}>下一步</Button>
      </div>
    </div>
  )
}
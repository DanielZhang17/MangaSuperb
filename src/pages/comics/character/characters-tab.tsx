import { useAtom } from 'jotai'
import { Check, Star } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

import { activeTabAtom, charactersCompletedAtom } from '../atoms'

const charactersData = [
  { id: 1, name: '秦飞扬', gender: '男', desc: '阳光少年，性格果断，擅长临场应变与团队协作。' },
  { id: 2, name: '马红梅', gender: '女', desc: '理性可靠，细节控，擅长情报分析与策略制定。' },
  { id: 3, name: '三殿主', gender: '男', desc: '冷静强势，外表高冷但内心重义，拥有神秘力量。' },
]

function SelectionView() {
  const [, setActiveTab] = useAtom(activeTabAtom)
  const [, setCharactersCompleted] = useAtom(charactersCompletedAtom)

  // 多选：默认不选择
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  const totalRecognized = useMemo(() => charactersData.length, [])

  const handleQuickPick = () => {
    // 一键选择：全部选择
    setSelectedIds(charactersData.map((c) => c.id))
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const canProceed = selectedIds.length > 0

  return (
    <div className="space-y-6 mt-4">
      {/* 角色网格 */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-6">
        {charactersData.map((char) => {
          const selected = selectedIds.includes(char.id)

          return (
            <Card
              key={char.id}
              className="relative cursor-pointer transition-all hover:shadow-md"
              onClick={() => toggleSelect(char.id)}
              aria-pressed={selected}
              data-selected={selected}
            >
              {selected && (
                <div className="absolute left-2 top-2 z-10 rounded-full bg-primary text-primary-foreground p-1 shadow">
                  <Check className="h-4 w-4" />
                </div>
              )}
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="w-full aspect-3/4 rounded-md bg-muted" />
                <div className="space-y-1">
                  <p className="font-semibold">
                    {char.gender}，{char.name}
                  </p>
                  <p className="text-sm text-muted-foreground leading-snug overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {char.desc}
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}

        <Card className="flex items-center justify-center bg-muted/70">
          <CardContent className="p-6 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <div className="rounded-xl bg-background/70 p-3">
              <Star className="h-6 w-6" />
            </div>
            <p>更多人物</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-6 py-4">
        <div>
          <p className="mb-2 text-foreground text-xl">请为你的人物选择形象
          </p>
          <p className='text-muted-foreground'>
          已根据故事为你识别到 {totalRecognized} 个角色
          </p>
        </div>
        <Button variant="default" onClick={handleQuickPick}>一键选择人物</Button>
      </div>

      {/* 下一步 */}
      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={() => {
            setActiveTab('image-generation')
            setCharactersCompleted(true)
          }}
          disabled={!canProceed}
        >
          下一步
        </Button>
      </div>
    </div>
  )
}

export function CharactersTab() {
  return <SelectionView />
}

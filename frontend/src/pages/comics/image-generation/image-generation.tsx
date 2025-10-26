import { useAtom } from 'jotai'
import { ChevronDown, ChevronUp, Image as ImageIcon, Plus } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'

import ComicsApi from '@/apis/comics'
import PanelsApi from '@/apis/panels'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateComic } from '@/hooks/use-comics'
import { useCreateComicJob } from '@/hooks/use-jobs'
import { cn } from '@/lib/utils'

import { currentComicDetailAtom, currentComicIdAtom, fullStoryAtom, mangaTitleAtom, selectedCharacterIdsAtom } from '../atoms'

interface Scene {
  id: number
  label: string
}

interface Character {
  id: number
  name: string
}

const INITIAL_SCENES: Scene[] = [
  { id: 1, label: '01' },
  { id: 2, label: '02' },
]

const CHARACTERS: Character[] = [
  { id: 1, name: '秦飞扬' },
  { id: 2, name: '马红梅' },
  { id: 3, name: '三殿主' },
]

const FONT_OPTIONS = [
  { value: 'source-han-sans', label: '思源黑体' },
  { value: 'yahei', label: '微软雅黑' },
  { value: 'heiti', label: '黑体' },
  { value: 'songti', label: '宋体' },
]

const FONT_SIZE_OPTIONS = ['18', '20', '22', '24', '28']

const BUBBLE_SHAPES = [
  { value: 'rect', label: '矩形' },
  { value: 'round', label: '圆角' },
]

function SceneSidebar({
  scenes,
  selectedScene,
  onSelectScene,
  onAddScene,
}: {
  scenes: Scene[]
  selectedScene: number
  onSelectScene: (sceneId: number) => void
  onAddScene: () => void
}) {
  const canScrollUp = false
  const canScrollDown = false

  return (
    <aside className="flex w-32 flex-col items-center">
      <Button variant="ghost" size="icon" disabled={!canScrollUp}>
        <ChevronUp className="h-5 w-5 text-muted-foreground" />
      </Button>
      <div className="mt-4 flex flex-1 flex-col items-center gap-4">
        {scenes.map((scene) => (
          <SceneThumbnail
            key={scene.id}
            label={scene.label}
            isActive={scene.id === selectedScene}
            onClick={() => onSelectScene(scene.id)}
          />
        ))}
        <button
          type="button"
          onClick={onAddScene}
          className="group relative flex h-20 w-28 items-center justify-center rounded-xl border border-dashed border-muted-foreground/30 bg-muted/60 text-muted-foreground transition-colors hover:border-muted-foreground/50"
        >
          <span className="absolute -left-6 text-xs font-medium text-muted-foreground">
            {String(scenes.length + 1).padStart(2, '0')}
          </span>
          <Plus className="h-6 w-6" />
        </button>
      </div>
      <Button variant="ghost" size="icon" disabled={!canScrollDown} className="mt-4">
        <ChevronDown className="h-5 w-5 text-muted-foreground" />
      </Button>
    </aside>
  )
}

function ShapePreview({ shape }: { shape: string }) {
  return (
    <div className="relative h-4 w-8">
      <div
        className={cn(
          'h-full w-full bg-muted-foreground/40',
          shape === 'rect' && 'rounded-none',
          shape === 'round' && 'rounded-md',
        )}
      />
    </div>
  )
}

function SceneThumbnail({
  label,
  isActive,
  onClick,
}: {
  label: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <Card
      role="button"
      onClick={onClick}
      className={cn(
        'relative h-20 w-28 cursor-pointer rounded-xl border border-input bg-card transition-all hover:border-primary',
        isActive && 'border-primary shadow-[0_0_0_3px] shadow-primary/10',
      )}
    >
      <CardContent className="h-full w-full p-2">
        <span className="absolute left-2 top-2 text-xs font-medium text-muted-foreground">{label}</span>
        <div className="flex h-full w-full items-center justify-center rounded-md bg-muted">
          <ImageIcon className="h-8 w-8 text-muted-foreground/60" />
        </div>
      </CardContent>
    </Card>
  )
}

function StoryboardCanvas({ onPreview }: { onPreview: () => void }) {
  return (
    <main className="flex min-h-[540px] flex-1 flex-col items-center gap-6">
      <Button variant="secondary" onClick={onPreview} className="px-8">
        预览
      </Button>
      <div className="flex w-full flex-1 items-center justify-center rounded-3xl border border-dashed border-muted-foreground/40 bg-muted/80">
        <ImageIcon className="h-24 w-24 text-muted-foreground/50" />
      </div>
    </main>
  )
}

function PropertyPanel({
  selectedCharacters,
  onToggleCharacter,
  fontFamily,
  onFontFamilyChange,
  fontSize,
  onFontSizeChange,
  bubbleShape,
  onBubbleShapeChange,
  hasTail,
  onToggleTail,
}: {
  selectedCharacters: number[]
  onToggleCharacter: (characterId: number) => void
  fontFamily: string
  onFontFamilyChange: (value: string) => void
  fontSize: string
  onFontSizeChange: (value: string) => void
  bubbleShape: string
  onBubbleShapeChange: (shape: string) => void
  hasTail: boolean
  onToggleTail: () => void
}) {
  return (
    <aside className="flex w-72 flex-col gap-4">
      <PanelCard title="出镜人物">
        <CharacterPicker selected={selectedCharacters} onToggle={onToggleCharacter} />
      </PanelCard>

      <PanelCard title="文本">
        <LabelRow label="字体">
          <Select value={fontFamily} onValueChange={onFontFamilyChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="选择字体" />
            </SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabelRow>
        <LabelRow label="字体大小">
          <Select value={fontSize} onValueChange={onFontSizeChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="选择大小" />
            </SelectTrigger>
            <SelectContent>
              {FONT_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={size}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabelRow>
      </PanelCard>

      <PanelCard title="会话框">
        <div className='flex gap-4 justify-between items-center'>
          <Select value={bubbleShape} onValueChange={onBubbleShapeChange}>
            <SelectTrigger className="w-30">
              <SelectValue placeholder="选择类型" />
            </SelectTrigger>
            <SelectContent>
              {BUBBLE_SHAPES.map((shape) => (
                <SelectItem key={shape.value} value={shape.value}>
                  <div className="flex items-center gap-2">
                    <ShapePreview shape={shape.value} />
                    <span>{shape.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Checkbox id="bubble-tail" checked={hasTail} onCheckedChange={onToggleTail} />
            <Label htmlFor="bubble-tail">{hasTail ? '有' : '无'}尾巴</Label>
          </div>
        </div>
      </PanelCard>

      <Card className="rounded-3xl border border-border/60 bg-muted/60 p-4">
        <div className="flex flex-col gap-3">
          <Button
            variant="outline"
            className="h-11 justify-center"
            onClick={() => toast.success('PDF 导出成功', { position: 'top-center' })}
          >
            PDF 导出
          </Button>
          <Button
            variant="outline"
            className="h-11 justify-center"
            onClick={() => toast.success('图片 导出成功', { position: 'top-center' })}
          >
            图片 导出
          </Button>
        </div>
      </Card>
    </aside>
  )
}

function PanelCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="rounded-3xl border border-border/60 bg-muted/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-foreground/80">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  )
}

function CharacterPicker({ selected, onToggle }: { selected: number[]; onToggle: (id: number) => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      {CHARACTERS.map((character, index) => {
        const isActive = selected.includes(character.id)

        return (
          <button
            key={character.id}
            type="button"
            onClick={() => onToggle(character.id)}
            className={cn(
              'flex w-20 flex-col items-center gap-2 rounded-xl border border-input bg-card p-3 transition-colors hover:border-primary',
              isActive && 'border-primary shadow-[0_0_0_3px] shadow-primary/10',
            )}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted" aria-hidden />
            <span className="text-xs font-medium text-foreground/80">
              {String.fromCharCode(0x30 + index + 1).padStart(2, '0')}
              {character.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function LabelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

/**
 * 故事板生图配置页
 */
export function ImageGeneration() {
  const [scenes, setScenes] = useState(INITIAL_SCENES)
  const [selectedScene, setSelectedScene] = useState(INITIAL_SCENES[0]?.id ?? 1)
  const [selectedCharacters, setSelectedCharacters] = useState<number[]>([1, 2])
  const [fontFamily, setFontFamily] = useState(FONT_OPTIONS[0].value)
  const [fontSize, setFontSize] = useState(FONT_SIZE_OPTIONS[1])
  const [bubbleShape, setBubbleShape] = useState(BUBBLE_SHAPES[0].value)
  const [hasTail, setHasTail] = useState(true)
  const { create: createComic, state: createComicState } = useCreateComic()
  const { state: createJobState } = useCreateComicJob()
  const [selectedIds] = useAtom(selectedCharacterIdsAtom)
  const [comicId, setComicId] = useAtom(currentComicIdAtom)
  // const [panels] = useAtom(storyPanelsAtom) // 不再用于 story_optimization 入口
  const [, setComicDetail] = useAtom(currentComicDetailAtom)
  const [title] = useAtom(mangaTitleAtom)
  const [fullStory] = useAtom(fullStoryAtom)

  const handleAddScene = () => {
    setScenes((prev) => {
      const nextIndex = prev.length + 1

      return [...prev, { id: nextIndex, label: String(nextIndex).padStart(2, '0') }]
    })
  }

  const previewHandler = () => {
    // 预览动作由后续业务接入，此处占位方便绑定
    console.info('preview scene', selectedScene)
  }

  const toggleCharacter = (characterId: number) => {
    setSelectedCharacters((prev) =>
      prev.includes(characterId) ? prev.filter((id) => id !== characterId) : [...prev, characterId],
    )
  }

  const handleCreateComic = async () => {
    if (!selectedIds || selectedIds.length === 0) {
      toast.error('请先在“人物”页选择出镜人物')

      return
    }

    // 角色编排：第一个为 protagonist，其余为 supporting
    const characters = selectedIds.map((id, idx) => ({
      id,
      order_index: idx + 1,
      role: idx === 0 ? 'protagonist' : 'supporting',
    }))

    try {
      const res = await createComic({
        title: title || '未命名漫画',
        story: fullStory,
        style: 'Classic manga black and white linework.',
        aspect_ratio: '16:9',
        characters,
      })
      const id = (res as any)?.comic?.id ?? (res as any)?.comic_id ?? null
      if (id) {
        setComicId(Number(id))
        toast.success('漫画创建成功，接下来可以生图了')
      } else {
        toast.success('漫画创建已提交')
      }
    } catch (err: any) {
      toast.error(err?.message || '创建漫画失败')
    }
  }

  const handleGenerate = async () => {
    if (!comicId) {
      toast.error('请先创建漫画（点击“生成漫画”）')

      return
    }

    try {
      const pageNumber = selectedScene

      // 若后端需要先确定页面布局，则根据当前漫画详情为该页设置布局（若存在建议布局）
      const detail = await (async () => {
        // 优先使用已缓存的详情
        const [, setDetail] = [null, setComicDetail]
        try {
          const d = await ComicsApi.get(comicId)
          setDetail(d)

          return d
        } catch {
          return null as any
        }
      })()

      try {
        const layout = detail?.page_layouts?.find((l: any) => l.page_number === pageNumber)
        if (layout?.layout_key) {
          const panel_order = Array.isArray(layout.panel_assignments)
            ? layout.panel_assignments
              .slice()
              .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
              .map((x: any) => x.panel_shot_id)
            : undefined

          await PanelsApi.setLayout(comicId, {
            page_number: pageNumber,
            layout_key: layout.layout_key,
            panel_order,
          })
        }
      } catch (e) {
        // 设置布局失败不阻断渲染
        console.warn('设置布局失败，继续渲染当前页面', e)
      }

      // 触发生图：POST /panels/{comic_id}/pages/{page_number}/render
      const renderRes = await PanelsApi.renderPage(comicId, pageNumber)
      const jobId = (renderRes as any)?.job_id || '—'
      toast.success(`第 ${pageNumber} 页渲染任务已创建（Job: ${jobId}）`)

      // 随后拉取漫画详情，存入全局 atom 以便后续使用
      try {
        const detail = await ComicsApi.get(comicId)
        setComicDetail(detail)
      } catch (e) {
        // 详情获取失败不阻断主流程
        console.warn('获取漫画详情失败', e)
      }
    } catch (err: any) {
      toast.error(err?.message || '生图任务创建失败')
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex w-full gap-6 rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
        <SceneSidebar
          scenes={scenes}
          selectedScene={selectedScene}
          onSelectScene={setSelectedScene}
          onAddScene={() => {
            handleAddScene()
          }}
        />
        <StoryboardCanvas onPreview={previewHandler} />
        <PropertyPanel
          selectedCharacters={selectedCharacters}
          onToggleCharacter={toggleCharacter}
          fontFamily={fontFamily}
          onFontFamilyChange={setFontFamily}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          bubbleShape={bubbleShape}
          onBubbleShapeChange={setBubbleShape}
          hasTail={hasTail}
          onToggleTail={() => setHasTail((prev) => !prev)}
        />
      </div>
      <div className="flex w-full justify-center gap-4">
        <Button size="lg" onClick={handleCreateComic} disabled={createComicState.isMutating}>
          {createComicState.isMutating ? '创建中...' : (comicId ? '重新生成漫画' : '生成漫画')}
        </Button>
        <Button size="lg" onClick={handleGenerate} disabled={createJobState.isMutating || !comicId}>
          {createJobState.isMutating ? '生成中...' : '生图'}
        </Button>
      </div>
    </div>
  )
}

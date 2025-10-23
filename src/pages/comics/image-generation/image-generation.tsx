import { ChevronDown, ChevronUp, Image as ImageIcon, Plus } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'

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
import { cn } from '@/lib/utils'

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

  return (
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
  )
}

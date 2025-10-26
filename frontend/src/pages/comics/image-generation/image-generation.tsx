/* eslint-disable simple-import-sort/imports */
import { useAtom } from 'jotai'
import { ChevronDown, ChevronUp, Image as ImageIcon, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'

import ComicsApi from '@/apis/comics'
import JobsApi from '@/apis/jobs'
import PanelsApi from '@/apis/panels'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateComic } from '@/hooks/use-comics'
import { cn } from '@/lib/utils'

import {
  aspectRatioAtom,
  activeTabAtom,
  currentComicDetailAtom,
  currentComicIdAtom,
  previousComicDetailAtom,
  fullStoryAtom,
  mangaTitleAtom,
  selectedCharacterIdsAtom,
  selectedCharacterRolesAtom,
  storyStepAtom,
  styleAtom,
} from '../atoms'
/* eslint-enable simple-import-sort/imports */

interface Scene {
  // Use page_number as id for selection consistency
  id: number
  label: string
  pageId?: number
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
const LAYOUT_OPTIONS = [
  { value: 'auto-grid', label: '自动布局 (auto-grid)' },
  { value: 'grid-2x2', label: '四宫格 (grid-2x2)' },
  { value: 'vertical', label: '竖版长条 (vertical)' },
  { value: 'cinematic', label: '宽银幕 (cinematic)' },
]

const STYLE_PRESETS = [
  { value: 'Classic manga black and white linework.', label: '经典黑白漫画线稿' },
  { value: 'High-contrast ink with splashy gradients', label: '高对比墨线 + 渐变' },
  { value: 'Moebius-inspired clean lines, minimal shading', label: '莫比乌斯风·干净线条' },
  { value: 'Gritty seinen style with textured shading', label: '青年向质感阴影' },
]

function SceneSidebar({
  scenes,
  pages,
  selectedScene,
  onSelectScene,
  onAddScene,
}: {
  scenes: Scene[]
  pages: { page_id: number; page_number: number; image_url: string | null }[]
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
        {scenes.map((scene) => {
          const p = pages.find((x) => x.page_number === scene.id)

          return (
            <SceneThumbnail
              key={scene.id}
              label={scene.label}
              isActive={scene.id === selectedScene}
              onClick={() => onSelectScene(scene.id)}
              imageUrl={toProxiedStatic(p?.image_url)}
            />
          )
        })}
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
  imageUrl,
}: {
  label: string
  isActive: boolean
  onClick: () => void
  imageUrl?: string
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
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-md bg-muted">
          {imageUrl ? (
            <img alt="thumb" src={imageUrl} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-8 w-8 text-muted-foreground/60" />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function StoryboardCanvas({ onPreview, imageUrl }: { onPreview: () => void; imageUrl?: string | null }) {
  return (
    <main className="flex min-h-[540px] flex-1 flex-col items-center gap-6">
      <Button variant="secondary" onClick={onPreview} className="px-8">
        预览
      </Button>
      <div className="flex w-full flex-1 items-center justify-center overflow-hidden rounded-3xl border border-dashed border-muted-foreground/40 bg-muted/80">
        {imageUrl ? (
          <img
            alt="page preview"
            src={imageUrl}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <ImageIcon className="h-24 w-24 text-muted-foreground/50" />
        )}
      </div>
    </main>
  )
}

// Ensure storage images go through dev proxy: '/static' -> storage origin with Referer/Origin
function toProxiedStatic(url?: string | null): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url)
    if (u.hostname === 'storage.mangasuperb.anranz.xyz') {
      return '/static' + u.pathname + (u.search || '')
    }
  } catch {
    // non-absolute or invalid URLs: leave as-is
  }

  return url || undefined
}

function PropertyPanel({
  selectedCharacters,
  onToggleCharacter,
  selectedLayout,
  onLayoutChange,
  styleValue,
  onStyleChange,
  panelShots,
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
  selectedLayout: string
  onLayoutChange: (value: string) => void
  styleValue: string
  onStyleChange: (value: string) => void
  panelShots?: { panel_number: number; description: string }[]
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
      <PanelCard title="布局">
        <LabelRow label="页面布局">
          <Select value={selectedLayout} onValueChange={onLayoutChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="选择布局" />
            </SelectTrigger>
            <SelectContent>
              {LAYOUT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabelRow>
      </PanelCard>
      {!!(panelShots && panelShots.length) && (
        <PanelCard title="分镜头（当前页）">
          <div className="flex flex-col gap-2 max-h-60 overflow-auto pr-1">
            {panelShots!.map((ps) => (
              <div key={ps.panel_number} className="rounded-md border p-2 text-xs leading-snug text-foreground/80">
                <span className="mr-2 inline-block w-5 text-center rounded bg-muted text-muted-foreground">
                  {ps.panel_number}
                </span>
                <span className="align-middle">{ps.description}</span>
              </div>
            ))}
          </div>
        </PanelCard>
      )}

      <PanelCard title="风格">
        <LabelRow label="渲染风格">
          <Select value={styleValue} onValueChange={onStyleChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="选择风格" />
            </SelectTrigger>
            <SelectContent>
              {STYLE_PRESETS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabelRow>
      </PanelCard>
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
  // Pages data from images API
  const [pages, setPages] = useState<{ page_id: number; page_number: number; image_url: string | null }[]>([])
  const [selectedCharacters, setSelectedCharacters] = useState<number[]>([1, 2])
  const [fontFamily, setFontFamily] = useState(FONT_OPTIONS[0].value)
  const [fontSize, setFontSize] = useState(FONT_SIZE_OPTIONS[1])
  const [bubbleShape, setBubbleShape] = useState(BUBBLE_SHAPES[0].value)
  const [hasTail, setHasTail] = useState(true)
  const [isRendering, setIsRendering] = useState(false)
  const [pollTries, setPollTries] = useState(0)
  const MAX_POLL_TRIES = 15 // 15 * 2s = 30s
  const pollTimerRef = useRef<number | null>(null)
  const triesRef = useRef<number>(0)
  const [selectedLayout, setSelectedLayout] = useState<string>(LAYOUT_OPTIONS[0].value)
  const { create: createComic, state: createComicState } = useCreateComic()
  const [selectedIds, setSelectedIds] = useAtom(selectedCharacterIdsAtom)
  const [comicId, setComicId] = useAtom(currentComicIdAtom)
  const [prevComicDetail, setPrevComicDetail] = useAtom(previousComicDetailAtom)
  const [comicDetail, setComicDetail] = useAtom(currentComicDetailAtom)
  const [title] = useAtom(mangaTitleAtom)
  const [fullStory] = useAtom(fullStoryAtom)
  const [style, setStyle] = useAtom(styleAtom)
  const [aspectRatio] = useAtom(aspectRatioAtom)
  const [rolesMap, setRolesMap] = useAtom(selectedCharacterRolesAtom)
  const [, setActiveTab] = useAtom(activeTabAtom)
  const [, setStoryStep] = useAtom(storyStepAtom)

  const handleAddScene = () => {
    // 跳转到故事流程并重置当前漫画相关状态，开始新一轮
    setActiveTab('story')
    setStoryStep('input')
    setComicId(null)
    setComicDetail(null)
    setPrevComicDetail(null)
    setSelectedIds([])
    setRolesMap({})
    setPages([])
    setScenes(INITIAL_SCENES)
    setSelectedScene(INITIAL_SCENES[0]?.id ?? 1)
    toast.success('已切换到故事流程，重新开始')
  }

  const previewHandler = () => {
    // 预览动作由后续业务接入，此处占位方便绑定
    console.info('preview scene', selectedScene)
  }

  // 从 comicDetail 或 prevComicDetail 中获取某页的分镜头
  const getPanelShotsForPage = (page: number) => {
    const src: any = comicDetail || prevComicDetail
    const shots: any[] = Array.isArray(src?.panel_shots) ? src.panel_shots : []

    return shots
      .filter((s) => s?.page_number === page)
      .sort((a, b) => (a?.panel_number ?? 0) - (b?.panel_number ?? 0))
      .map((s) => ({ panel_number: s.panel_number, description: s.description }))
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
      role: rolesMap[id] || (idx === 0 ? 'protagonist' : 'supporting'),
    }))

    try {
      const res = await createComic({
        title: title || '未命名漫画',
        story: fullStory,
        style,
        aspect_ratio: aspectRatio,
        characters,
      })
      const id = (res as any)?.comic?.id ?? (res as any)?.comic_id ?? null
      if (id) {
        setComicId(Number(id))
        // 触发剧情优化任务
        try {
          await JobsApi.createComic({ job_type: 'story_optimization', comic_id: Number(id) })
          toast.success('漫画创建成功，已提交剧情优化任务')
        } catch (e: any) {
          toast.error(e?.message || '剧情优化任务提交失败')
        }

        // 刷新漫画详情
        try {
          const detail = await ComicsApi.get(Number(id))
          setComicDetail(detail)
        } catch {}
      } else {
        toast.success('漫画创建已提交')
      }
    } catch (err: any) {
      toast.error(err?.message || '创建漫画失败')
    }
  }

  const clearPoll = () => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }

    triesRef.current = 0
  }

  const handleGenerate = async () => {
    if (!comicId) {
      toast.error('请先创建漫画（点击“生成漫画”）')

      return
    }

    try {
      // 先设置该页布局 → 触发该页渲染 → 轮询整本漫画 images
      setIsRendering(true)
      setPollTries(0)
      clearPoll()

      // A) 设置布局
      const layoutRes = await PanelsApi.setLayout(comicId, {
        page_number: selectedScene,
        layout_key: selectedLayout,
      })
      const layoutComic = (layoutRes as any)?.comic
      if (layoutComic) {
        setPrevComicDetail(layoutComic)
        setComicDetail(layoutComic)

        // 根据返回的分镜或 page_layouts 同步侧边栏场景
        try {
          const pageNumberSet = new Set<number>()
          const shotsTmp: any[] = Array.isArray(layoutComic?.panel_shots) ? layoutComic.panel_shots : []
          for (const s of shotsTmp) {
            if (s && typeof s.page_number === 'number') pageNumberSet.add(s.page_number as number)
          }

          const pageNumbers = Array.from(pageNumberSet).sort((a: number, b: number) => a - b)

          if (pageNumbers.length > 0) {
            const newScenes: Scene[] = pageNumbers.map((n) => ({ id: n, label: String(n).padStart(2, '0') }))
            setScenes(newScenes)
            if (!newScenes.some((s) => s.id === selectedScene)) {
              setSelectedScene(newScenes[0].id)
            }
          }
        } catch {}
      }

      // B) 触发该页渲染
      await PanelsApi.renderPage(comicId, selectedScene)

      toast.success('已提交渲染，开始轮询 images…')

      // C) 轮询 /api/comics/{comic_id}/images 直到有结果（任意页面拿到 image_url 即视为有数据）
      pollTimerRef.current = window.setInterval(async () => {
        try {
          const imagesRes = await ComicsApi.listImages(comicId)
          // Expected sample: { comic_id, page_count, pages: [{ page_id, page_number, image_url }] }
          const pagesArr = (imagesRes as any)?.pages ?? []
          const hasAnyImage = Array.isArray(pagesArr) && pagesArr.some((p: any) => !!p?.image_url)
          triesRef.current += 1
          setPollTries(triesRef.current)

          if (hasAnyImage) {
            // 更新本地 pages 数据 & 同步侧边栏场景
            setPages(pagesArr)
            if (Array.isArray(pagesArr) && pagesArr.length > 0) {
              const newScenes: Scene[] = pagesArr
                .sort((a: any, b: any) => a.page_number - b.page_number)
                .map((p: any) => ({ id: p.page_number, label: String(p.page_number).padStart(2, '0'), pageId: p.page_id }))
              setScenes(newScenes)
              if (!newScenes.some((s) => s.id === selectedScene)) {
                setSelectedScene(newScenes[0].id)
              }
            }

            toast.success('生图完成')
            clearPoll()
            setIsRendering(false)

            // 刷新详情
            try {
              const d = await ComicsApi.get(comicId)
              setComicDetail(d)
            } catch {}
          } else if (triesRef.current >= MAX_POLL_TRIES) {
            toast.error('生图超时（30s），请稍后重试或检查任务队列')
            clearPoll()
            setIsRendering(false)
          }
        } catch (e) {
          console.warn('轮询生图失败', e)
          triesRef.current += 1
          setPollTries(triesRef.current)
          if (triesRef.current >= MAX_POLL_TRIES) {
            toast.error('生图轮询失败或超时')
            clearPoll()
            setIsRendering(false)
          }
        }
      }, 2000)

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
      clearPoll()
      setIsRendering(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex w-full gap-6 rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
        <SceneSidebar
          scenes={scenes}
          pages={pages}
          selectedScene={selectedScene}
          onSelectScene={setSelectedScene}
          onAddScene={() => {
            handleAddScene()
          }}
        />
        <StoryboardCanvas
          onPreview={previewHandler}
          imageUrl={toProxiedStatic(pages.find((p) => p.page_number === selectedScene)?.image_url)}
        />
        <PropertyPanel
          selectedCharacters={selectedCharacters}
          onToggleCharacter={toggleCharacter}
          selectedLayout={selectedLayout}
          onLayoutChange={setSelectedLayout}
          styleValue={style}
          onStyleChange={setStyle}
          panelShots={getPanelShotsForPage(selectedScene)}
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
        <Button size="lg" onClick={handleGenerate} disabled={isRendering || !comicId}>
          {isRendering ? `渲染中... (${pollTries}/${MAX_POLL_TRIES})` : '生图'}
        </Button>
      </div>
    </div>
  )
}

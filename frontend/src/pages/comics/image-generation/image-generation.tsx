 
import { useAtom } from 'jotai'
import { ChevronDown, ChevronUp, Image as ImageIcon, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'

import ComicsApi from '@/apis/comics'
import PanelsApi from '@/apis/panels'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

import { activeTabAtom, currentComicDetailAtom, currentComicIdAtom, storyStepAtom, styleAtom } from '../atoms'

interface Scene {
  // Use page_number as id for selection consistency
  id: number
  label: string
  pageId?: number
}

const INITIAL_SCENES: Scene[] = [
  { id: 1, label: '01' },
  { id: 2, label: '02' },
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
  styleValue,
  onStyleChange,
  fontFamily,
  onFontFamilyChange,
  fontSize,
  onFontSizeChange,
  bubbleShape,
  onBubbleShapeChange,
  hasTail,
  onToggleTail,
  onOpenPublish,
  onExportImage,
  canExport,
  isPublishing,
}: {
  styleValue: string
  onStyleChange: (value: string) => void
  fontFamily: string
  onFontFamilyChange: (value: string) => void
  fontSize: string
  onFontSizeChange: (value: string) => void
  bubbleShape: string
  onBubbleShapeChange: (shape: string) => void
  hasTail: boolean
  onToggleTail: () => void
  onOpenPublish: () => void
  onExportImage: () => void
  canExport: boolean
  isPublishing: boolean
}) {
  return (
    <aside className="flex w-72 flex-col gap-4">
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

      <PanelCard title="导出">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={onOpenPublish}
            disabled={!canExport || isPublishing}
          >
            导出 PDF
          </Button>
          <Button
            variant="outline"
            onClick={onExportImage}
            disabled={!canExport}
          >
            导出图片
          </Button>
        </div>
      </PanelCard>

      {null}
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

// 角色选择卡片已移除

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
  const [fontFamily, setFontFamily] = useState(FONT_OPTIONS[0].value)
  const [fontSize, setFontSize] = useState(FONT_SIZE_OPTIONS[1])
  const [bubbleShape, setBubbleShape] = useState(BUBBLE_SHAPES[0].value)
  const [hasTail, setHasTail] = useState(true)
  const [isRendering, setIsRendering] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [makePublic, setMakePublic] = useState(true)
  const [pollTries, setPollTries] = useState(0)
  const MAX_POLL_TRIES = 15 // 15 * 2s = 30s
  const pollTimerRef = useRef<number | null>(null)
  const triesRef = useRef<number>(0)
  const [comicId] = useAtom(currentComicIdAtom)
  const [, setComicDetail] = useAtom(currentComicDetailAtom)
  const [style, setStyle] = useAtom(styleAtom)
  const [, setActiveTab] = useAtom(activeTabAtom)
  const [, setStoryStep] = useAtom(storyStepAtom)

  const handleAddScene = () => {
    // 回到故事流程继续编辑；保持当前 comicId 不变
    setActiveTab('story')
    setStoryStep('input')
    toast.success('已切换到故事流程，继续编辑当前漫画')
  }

  const previewHandler = () => {
    // 预览动作由后续业务接入，此处占位方便绑定
    console.info('preview scene', selectedScene)
  }

  // 进入生图页时，如已有 comicId，则预载该漫画的已生成页面，供左侧缩略图展示
  // 这样即使重新走流程，左侧依然能看到上一流程的漫画内容
  useEffect(() => {
    if (!comicId) return
    let cancelled = false
    ;(async () => {
      try {
        const imagesRes = await ComicsApi.listImages(comicId)
        const pagesArr = (imagesRes as any)?.pages ?? []
        if (cancelled) return
        if (Array.isArray(pagesArr) && pagesArr.length > 0) {
          setPages(pagesArr)
          const newScenes: Scene[] = pagesArr
            .sort((a: any, b: any) => a.page_number - b.page_number)
            .map((p: any) => ({ id: p.page_number, label: String(p.page_number).padStart(2, '0'), pageId: p.page_id }))
          setScenes(newScenes)
          if (!newScenes.some((s) => s.id === selectedScene)) {
            setSelectedScene(newScenes[0].id)
          }
        }
      } catch {
        // 忽略加载失败，不阻断页面
      }
    })()

    return () => {
      cancelled = true
    }
  }, [comicId, selectedScene])

  // 分镜头列表卡片已移除

  // 重新生成漫画逻辑已移除

  const clearPoll = () => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }

    triesRef.current = 0
  }

  const handleGenerate = async () => {
    if (!comicId) {
      toast.error('请先完成“分镜”步骤后再来生图')

      return
    }

    try {
      // 触发该页渲染 → 轮询整本漫画 images
      setIsRendering(true)
      setPollTries(0)
      clearPoll()

      // A) 触发该页渲染（布局已在“分镜”步骤完成）
      await PanelsApi.renderPage(comicId, selectedScene)

      // B) 轮询 /api/comics/{comic_id}/images 直到有结果（任意页面拿到 image_url 即视为有数据）
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
          styleValue={style}
          onStyleChange={setStyle}
          fontFamily={fontFamily}
          onFontFamilyChange={setFontFamily}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          bubbleShape={bubbleShape}
          onBubbleShapeChange={setBubbleShape}
          hasTail={hasTail}
          onToggleTail={() => setHasTail((prev) => !prev)}
          onOpenPublish={() => setPublishOpen(true)}
          onExportImage={() => {
            const p = pages.find((x) => x.page_number === selectedScene)
            const url = toProxiedStatic(p?.image_url)
            if (!url) {
              toast.error('当前页暂无图片可导出')

              return
            }

            const a = document.createElement('a')
            a.href = url
            a.download = `comic_${comicId}_page_${selectedScene}`
            document.body.appendChild(a)
            a.click()
            a.remove()
          }}
          canExport={Boolean(comicId)}
          isPublishing={isPublishing}
        />
      </div>
      <div className="flex w-full justify-center gap-4">
        <Button size="lg" onClick={handleGenerate} disabled={isRendering || !comicId}>
          {isRendering ? `渲染中... (${pollTries}/${MAX_POLL_TRIES})` : '生图'}
        </Button>
      </div>

      {/* 发布/导出 PDF 对话框 */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导出 PDF</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between gap-4 py-2">
            <div>
              <p className="text-sm font-medium">是否将漫画设为公开</p>
              <p className="text-xs text-muted-foreground">公开后他人可访问你的漫画</p>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="make-public" className="text-sm">公开</Label>
              <Switch id="make-public" checked={makePublic} onCheckedChange={(v) => setMakePublic(Boolean(v))} />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                if (!comicId) return
                try {
                  setIsPublishing(true)
                  const resp = await ComicsApi.publish(comicId, { make_public: makePublic })
                  // 暂存输出，等待你提供 PDF 字段名
                   
                  console.info('publish response:', resp)
                  toast.success('发布完成，等待确认 PDF 地址字段')
                  setPublishOpen(false)
                } catch (e: any) {
                  toast.error(e?.message || '发布失败')
                } finally {
                  setIsPublishing(false)
                }
              }}
              disabled={isPublishing}
            >
              {isPublishing ? '发布中…' : '确定'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

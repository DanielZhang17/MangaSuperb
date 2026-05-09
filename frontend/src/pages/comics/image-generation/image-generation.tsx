 
import { useAtom } from 'jotai'
import { ChevronDown, ChevronUp, Image as ImageIcon, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'

import ComicsApi from '@/apis/comics'
import PanelsApi from '@/apis/panels'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { AI_PROVIDER_LABELS, useAiProviders } from '@/hooks/use-ai-providers'
import { cn, proxiedStatic } from '@/lib/utils'
import type { AiProviderId } from '@/service/types'

import { activeTabAtom, currentComicDetailAtom, currentComicIdAtom, imageProviderAtom, storyStepAtom, styleAtom, textProviderAtom } from '../atoms'
import { ComicsWorkflowShell, WorkflowActionBar } from '../components/workflow-layout'
import type { RenderProgressState } from '../workflow-types'
import { GeneratedImage } from './generated-image'
import { GenerationStatusPanel } from './generation-status-panel'

interface Scene {
  // Use page_number as id for selection consistency
  id: number
  label: string
  pageId?: number
}

interface PageImage {
  page_id: number
  page_number: number
  image_url: string | null
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

function renderFailureMessage(comic: any): string | null {
  const stages = Array.isArray(comic?.workflow_stages) ? comic.workflow_stages : []
  const renderStage = stages.find((stage: any) => stage?.stage === 'render')

  if (renderStage?.status === 'failed') {
    return renderStage.error_message || comic?.error_message || '渲染任务失败'
  }

  if (comic?.workflow_stage === 'render' && comic?.workflow_status === 'failed') {
    return comic?.error_message || '渲染任务失败'
  }

  return null
}

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
  const hasAnyPage = Array.isArray(pages) && pages.length > 0
  const canScrollUp = false
  const canScrollDown = false

  return (
    <aside className="flex min-w-0 flex-row items-center gap-3 overflow-x-auto xl:w-28 xl:flex-col xl:overflow-visible">
      {hasAnyPage && (
        <Button variant="ghost" size="icon" disabled={!canScrollUp} className="hidden xl:inline-flex">
          <ChevronUp className="h-5 w-5 text-muted-foreground" />
        </Button>
      )}
      <div className="flex flex-1 flex-row items-center gap-3 xl:mt-4 xl:flex-col xl:gap-4">
        {hasAnyPage &&
          scenes.map((scene) => {
            const p = pages.find((x) => x.page_number === scene.id)

            return (
              <SceneThumbnail
                key={scene.id}
                label={scene.label}
                isActive={scene.id === selectedScene}
                onClick={() => onSelectScene(scene.id)}
                imageUrl={proxiedStatic(p?.image_url)}
              />
            )
          })}
        <button
          type="button"
          onClick={onAddScene}
          className="group relative flex h-20 w-24 shrink-0 items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 bg-muted/60 text-muted-foreground transition-colors hover:border-muted-foreground/50 xl:w-28"
        >
          {hasAnyPage && (
            <span className="absolute -left-6 text-xs font-medium text-muted-foreground">
              {String(scenes.length + 1).padStart(2, '0')}
            </span>
          )}
          <Plus className="h-6 w-6" />
        </button>
      </div>
      {hasAnyPage && (
        <Button variant="ghost" size="icon" disabled={!canScrollDown} className="mt-4 hidden xl:inline-flex">
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        </Button>
      )}
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
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative h-20 w-24 shrink-0 cursor-pointer rounded-lg border border-input bg-card p-2 text-left transition-all hover:border-primary xl:w-28',
        isActive && 'border-primary shadow-[0_0_0_3px] shadow-primary/10',
      )}
    >
      <span className="absolute left-2 top-2 z-10 text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-md bg-muted">
        {imageUrl ? (
          <GeneratedImage alt="thumb" src={imageUrl} aspectRatio="7 / 5" className="h-full border-0 p-0" />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground/60" />
        )}
      </div>
    </button>
  )
}

function StoryboardCanvas({ onPreview, imageUrl }: { onPreview: () => void; imageUrl?: string | null }) {
  return (
    <main className="flex min-h-[420px] flex-1 flex-col items-center gap-4 lg:min-h-[540px]">
      <Button variant="secondary" onClick={onPreview} className="px-8">
        预览
      </Button>
      <div className="flex w-full flex-1 items-center justify-center overflow-hidden rounded-lg border border-dashed border-muted-foreground/40 bg-muted/80 p-3">
        {imageUrl ? (
          <GeneratedImage alt="page preview" src={imageUrl} aspectRatio="16 / 10" className="max-h-full max-w-full border-0 bg-transparent" />
        ) : (
          <ImageIcon className="h-24 w-24 text-muted-foreground/50" />
        )}
      </div>
    </main>
  )
}

// 去除本地实现，统一使用全局 proxiedStatic

function PropertyPanel({
  imageProvider,
  onImageProviderChange,
  imageProviderOptions,
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
  imageProvider: AiProviderId
  onImageProviderChange: (value: AiProviderId) => void
  imageProviderOptions: AiProviderId[]
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
    <aside className="flex min-w-0 flex-col gap-4 xl:w-80">
      <PanelCard title="AI模型">
        <LabelRow label="生图模型">
          <Select value={imageProvider} onValueChange={(value) => onImageProviderChange(value as AiProviderId)}>
            <SelectTrigger className="w-44 max-w-full">
              <SelectValue placeholder="选择模型" />
            </SelectTrigger>
            <SelectContent>
              {imageProviderOptions.map((provider) => (
                <SelectItem key={provider} value={provider}>
                  {AI_PROVIDER_LABELS[provider]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabelRow>
      </PanelCard>

      <PanelCard title="风格">
        <LabelRow label="渲染风格">
          <Select value={styleValue} onValueChange={onStyleChange}>
            <SelectTrigger className="w-44 max-w-full">
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
            <SelectTrigger className="w-44 max-w-full">
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Select value={bubbleShape} onValueChange={onBubbleShapeChange}>
            <SelectTrigger className="w-36">
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
        <div className="flex flex-wrap items-center justify-between gap-3">
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
    <section className="rounded-lg border border-border/60 bg-card p-4 shadow-sm">
      <h3 className="mb-4 text-base font-semibold text-foreground/80">{title}</h3>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
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

function createRenderProgress(maxPollTries: number): RenderProgressState {
  return {
    status: 'idle',
    elapsedMs: 0,
    pollTries: 0,
    maxPollTries,
    message: '准备生成漫画页',
  }
}

/**
 * 故事板生图配置页
 */
export function ImageGeneration() {
  const [scenes, setScenes] = useState(INITIAL_SCENES)
  const [selectedScene, setSelectedScene] = useState(INITIAL_SCENES[0]?.id ?? 1)
  // Pages data from images API
  const [pages, setPages] = useState<PageImage[]>([])
  const [fontFamily, setFontFamily] = useState(FONT_OPTIONS[0].value)
  const [fontSize, setFontSize] = useState(FONT_SIZE_OPTIONS[1])
  const [bubbleShape, setBubbleShape] = useState(BUBBLE_SHAPES[0].value)
  const [hasTail, setHasTail] = useState(true)
  const [isRendering, setIsRendering] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [makePublic, setMakePublic] = useState(true)
  const MAX_POLL_TRIES = 180 // 180 * 2s = 6min; keep ahead of backend image timeout
  const [pollTries, setPollTries] = useState(0)
  const [renderProgress, setRenderProgress] = useState<RenderProgressState>(() => createRenderProgress(MAX_POLL_TRIES))
  const pollTimerRef = useRef<number | null>(null)
  const triesRef = useRef<number>(0)
  const renderStartedAtRef = useRef<number | null>(null)
  const renderTargetRef = useRef<{ pageNumber: number; previousImageUrl: string | null } | null>(null)
  // PDF 导出轮询
  const MAX_PDF_POLL_TRIES = 30 // 30 * 2s = 60s
  const pdfPollTimerRef = useRef<number | null>(null)
  const pdfTriesRef = useRef<number>(0)
  const [comicId] = useAtom(currentComicIdAtom)
  const [, setComicDetail] = useAtom(currentComicDetailAtom)
  const [style, setStyle] = useAtom(styleAtom)
  const [imageProvider, setImageProvider] = useAtom(imageProviderAtom)
  const [textProvider] = useAtom(textProviderAtom)
  const { providers, imageProviders, loading: providersLoading } = useAiProviders()
  const imageProviderInitializedRef = useRef(false)
  const imageProviderChangedRef = useRef(false)

  useEffect(() => {
    if (providersLoading || !imageProviders.length) return

    if (!imageProviderInitializedRef.current) {
      imageProviderInitializedRef.current = true
      if (!imageProviderChangedRef.current && imageProvider === 'gemini') {
        const defaultProvider = imageProviders.includes(providers.defaults.image)
          ? providers.defaults.image
          : imageProviders[0]
        setImageProvider(defaultProvider)

        return
      }
    }

    if (!imageProviders.includes(imageProvider) && imageProviders[0]) {
      setImageProvider(imageProviders[0])
    }
  }, [imageProvider, imageProviders, providers.defaults.image, providersLoading, setImageProvider])
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

  // 组件卸载时清理所有轮询
  useEffect(() => {
    return () => {
      clearPoll()
      clearPdfPoll()
    }
  }, [])

  const clearPoll = () => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }

    triesRef.current = 0
  }

  const clearPdfPoll = () => {
    if (pdfPollTimerRef.current) {
      window.clearInterval(pdfPollTimerRef.current)
      pdfPollTimerRef.current = null
    }

    pdfTriesRef.current = 0
  }

  const getRenderElapsedMs = () => {
    if (!renderStartedAtRef.current) return 0

    return Date.now() - renderStartedAtRef.current
  }

  const updateRenderProgress = (
    next: Partial<RenderProgressState> & Pick<RenderProgressState, 'status' | 'message'>,
  ) => {
    setRenderProgress((prev) => ({
      ...prev,
      ...next,
      elapsedMs: next.elapsedMs ?? getRenderElapsedMs(),
      pollTries: next.pollTries ?? triesRef.current,
      maxPollTries: MAX_POLL_TRIES,
    }))
  }

  const handleGenerate = async () => {
    if (!comicId) {
      toast.error('请先完成“分镜”步骤后再来生图')

      return
    }

    const targetPageNumber = selectedScene
    let previousImageUrl = pages.find((p) => p.page_number === targetPageNumber)?.image_url ?? null

    try {
      // 触发该页渲染 → 轮询整本漫画 images
      setIsRendering(true)
      setPollTries(0)
      clearPoll()
      renderStartedAtRef.current = Date.now()
      updateRenderProgress({
        status: 'submitting',
        message: '正在提交渲染任务',
        elapsedMs: 0,
        pollTries: 0,
        error: null,
      })

      try {
        const latestImages = await ComicsApi.listImages(comicId)
        const latestPages = (latestImages as any)?.pages ?? []
        if (Array.isArray(latestPages)) {
          const latestTarget = latestPages.find((p: any) => p?.page_number === targetPageNumber)
          previousImageUrl = latestTarget?.image_url ?? previousImageUrl
        }
      } catch (e) {
        console.warn('获取当前漫画页图片失败', e)
      }

      renderTargetRef.current = {
        pageNumber: targetPageNumber,
        previousImageUrl,
      }
      setPages((prev) => prev.map((page) => (
        page.page_number === targetPageNumber && page.image_url === previousImageUrl
          ? { ...page, image_url: null }
          : page
      )))

      // A) 触发该页渲染（布局已在“分镜”步骤完成）
      await PanelsApi.renderPage(comicId, targetPageNumber, {
        image_provider: imageProvider,
        text_provider: textProvider,
      })
      updateRenderProgress({
        status: 'rendering',
        message: '正在生成漫画页',
        pollTries: 0,
        error: null,
      })

      // B) 轮询 /api/comics/{comic_id}/images，直到本次目标页拿到新的 image_url。
      pollTimerRef.current = window.setInterval(async () => {
        try {
          const imagesRes = await ComicsApi.listImages(comicId)
          // Expected sample: { comic_id, page_count, pages: [{ page_id, page_number, image_url }] }
          const pagesArr = Array.isArray((imagesRes as any)?.pages) ? ((imagesRes as any).pages as PageImage[]) : []
          const renderTarget = renderTargetRef.current ?? {
            pageNumber: targetPageNumber,
            previousImageUrl,
          }
          const targetPage = pagesArr.find((p) => p.page_number === renderTarget.pageNumber)
          const targetImageUrl = targetPage?.image_url ?? null
          const hasFreshTargetImage = Boolean(targetImageUrl)
            && (!renderTarget.previousImageUrl || targetImageUrl !== renderTarget.previousImageUrl)
          const displayPagesArr = pagesArr.map((page) => (
            page.page_number === renderTarget.pageNumber
              && renderTarget.previousImageUrl
              && page.image_url === renderTarget.previousImageUrl
              ? { ...page, image_url: null }
              : page
          ))
          triesRef.current += 1
          setPollTries(triesRef.current)
          updateRenderProgress({
            status: 'rendering',
            message: '正在生成漫画页',
            pollTries: triesRef.current,
          })

          if (hasFreshTargetImage) {
            // 更新本地 pages 数据 & 同步侧边栏场景
            setPages(displayPagesArr)
            if (displayPagesArr.length > 0) {
              const newScenes: Scene[] = displayPagesArr
                .sort((a: any, b: any) => a.page_number - b.page_number)
                .map((p: any) => ({ id: p.page_number, label: String(p.page_number).padStart(2, '0'), pageId: p.page_id }))
              setScenes(newScenes)
              if (!newScenes.some((s) => s.id === targetPageNumber)) {
                setSelectedScene(newScenes[0].id)
              }
            }

            toast.success('生图完成')
            updateRenderProgress({
              status: 'completed',
              message: '生图完成',
              pollTries: triesRef.current,
              error: null,
            })
            renderTargetRef.current = null
            clearPoll()
            setIsRendering(false)

            // 刷新详情
            try {
              const d = await ComicsApi.get(comicId)
              setComicDetail(d)
            } catch {}
          } else {
            setPages(displayPagesArr)
            const detail = await ComicsApi.get(comicId)
            const failureMessage = renderFailureMessage(detail)
            if (failureMessage) {
              const message = `生图失败：${failureMessage}`
              setComicDetail(detail)
              updateRenderProgress({
                status: 'failed',
                message,
                pollTries: triesRef.current,
                error: message,
              })
              toast.error(message)
              renderTargetRef.current = null
              clearPoll()
              setIsRendering(false)

              return
            }

            if (triesRef.current >= MAX_POLL_TRIES) {
              const message = '生图超时（6min），请稍后重试或检查任务队列'
              updateRenderProgress({
                status: 'timeout',
                message,
                pollTries: triesRef.current,
                error: message,
              })
              toast.error(message)
              renderTargetRef.current = null
              clearPoll()
              setIsRendering(false)
            }
          }
        } catch (e) {
          console.warn('轮询生图失败', e)
          triesRef.current += 1
          setPollTries(triesRef.current)
          updateRenderProgress({
            status: 'rendering',
            message: '正在生成漫画页',
            pollTries: triesRef.current,
          })
          if (triesRef.current >= MAX_POLL_TRIES) {
            const message = '生图轮询失败或超时'
            updateRenderProgress({
              status: 'timeout',
              message,
              pollTries: triesRef.current,
              error: message,
            })
            toast.error(message)
            renderTargetRef.current = null
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
      const message = err?.message || '生图任务创建失败'
      updateRenderProgress({
        status: 'failed',
        message,
        error: message,
      })
      toast.error(message)
      renderTargetRef.current = null
      clearPoll()
      setIsRendering(false)
    }
  }

  const selectedImageUrl = useMemo(
    () => proxiedStatic(pages.find((p) => p.page_number === selectedScene)?.image_url),
    [pages, selectedScene],
  )

  return (
    <ComicsWorkflowShell>
      <div className="grid w-full gap-6 xl:grid-cols-[112px_minmax(0,1fr)_320px]">
        <SceneSidebar
          scenes={scenes}
          pages={pages}
          selectedScene={selectedScene}
          onSelectScene={setSelectedScene}
          onAddScene={() => {
            handleAddScene()
          }}
        />
        <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-border/60 bg-card p-4 shadow-sm sm:p-5">
          <GenerationStatusPanel progress={renderProgress} />
          <WorkflowActionBar>
            <Button size="lg" onClick={handleGenerate} disabled={isRendering || !comicId}>
              {isRendering ? `渲染中... (${pollTries}/${MAX_POLL_TRIES})` : '生图'}
            </Button>
          </WorkflowActionBar>
          <StoryboardCanvas
            onPreview={previewHandler}
            imageUrl={selectedImageUrl}
          />
        </section>
        <PropertyPanel
          imageProvider={imageProvider}
          onImageProviderChange={(provider) => {
            imageProviderChangedRef.current = true
            setImageProvider(provider)
          }}
          imageProviderOptions={imageProviders}
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
            const url = proxiedStatic(p?.image_url)
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
                  toast.success('发布成功，开始生成 PDF…')
                  setPublishOpen(false)

                  // 开始轮询 comic 详情，直到出现 pdf_url 或超时
                  clearPdfPoll()
                  pdfPollTimerRef.current = window.setInterval(async () => {
                    try {
                      const d = await ComicsApi.get(comicId)
                      const pdfUrl = (d as any)?.pdf_url as string | null | undefined
                      pdfTriesRef.current += 1

                      if (pdfUrl) {
                        clearPdfPoll()
                        setIsPublishing(false)
                        // 下载 PDF（开发态使用代理，避免防盗链）
                        const href = proxiedStatic(pdfUrl) || pdfUrl
                        const a = document.createElement('a')
                        a.href = href
                        a.download = `comic_${comicId}.pdf`
                        document.body.appendChild(a)
                        a.click()
                        a.remove()
                        toast.success('PDF 已就绪，开始下载')
                        // 更新详情
                        try { setComicDetail(d) } catch {}
                      } else if (pdfTriesRef.current >= MAX_PDF_POLL_TRIES) {
                        clearPdfPoll()
                        setIsPublishing(false)
                        toast.error('等待 PDF 超时（60s），请稍后在“我的创意”重试下载')
                      }
                    } catch (e) {
                      console.warn('轮询 PDF 失败', e)
                      pdfTriesRef.current += 1
                      if (pdfTriesRef.current >= MAX_PDF_POLL_TRIES) {
                        clearPdfPoll()
                        setIsPublishing(false)
                        toast.error('PDF 生成轮询失败或超时')
                      }
                    }
                  }, 2000)
                } catch (e: any) {
                  toast.error(e?.message || '发布失败')
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
    </ComicsWorkflowShell>
  )
}

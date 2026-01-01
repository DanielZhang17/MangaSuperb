import { useAtom } from 'jotai'
import { Image as ImageIcon, Loader2, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'

import ComicsApi from '@/apis/comics'
import PanelsApi from '@/apis/panels'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/hooks/use-i18n'
import { usePreferences } from '@/hooks/use-preferences'
import { DEFAULT_COLOR_MODES, DEFAULT_STYLE_PRESETS } from '@/config/preferences'
import type { ColorMode, UserStylePreset } from '@/service/types'
import { cn, proxiedStatic } from '@/lib/utils'

import {
  currentComicDetailAtom,
  currentComicIdAtom,
  customPagesAtom,
  selectedPageAtom,
  styleAtom,
  aspectRatioAtom,
  colorModeAtom,
} from '../atoms'
import { PageSidebar } from '../components/page-sidebar'

type RenderedPage = {
  page_id: number
  page_number: number
  image_url: string | null
}

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

const ASPECT_RATIO_OPTIONS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
]

const MAX_POLL_TRIES = 15 // 15 * 2s = 30s
const MAX_PDF_POLL_TRIES = 30 // 30 * 2s = 60s
const IMAGE_CACHE_PREFIX = 'manga:page_image'

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

const getImageCacheKey = (comicId: number, pageNumber: number) =>
  `${IMAGE_CACHE_PREFIX}:${comicId}:${pageNumber}`

const getCachedImageUrl = (comicId: number, pageNumber: number): string | null => {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(getImageCacheKey(comicId, pageNumber))
}

const cacheImageUrl = (comicId: number, pageNumber: number, url: string | null) => {
  if (typeof window === 'undefined' || !url) return
  localStorage.setItem(getImageCacheKey(comicId, pageNumber), url)
}

function StoryboardCanvas({ imageUrl }: { imageUrl?: string | null }) {
  return (
    <main className="flex min-h-[480px] flex-1 flex-col items-center justify-center">
      <div className="flex w-full flex-1 items-center justify-center overflow-hidden rounded-3xl border border-dashed border-muted-foreground/40 bg-muted/80">
        {imageUrl ? (
          <img
            alt="page preview"
            src={imageUrl}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <ImageIcon className="h-20 w-20 text-muted-foreground/50" />
        )}
      </div>
    </main>
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

function LabelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function PropertyPanel({
  styleValue,
  styleOptions,
  onStyleChange,
  colorMode,
  colorModeOptions,
  onColorModeChange,
  fontFamily,
  onFontFamilyChange,
  fontSize,
  onFontSizeChange,
  bubbleShape,
  onBubbleShapeChange,
  hasTail,
  onToggleTail,
  onOpenPublish,
  onDownloadPdf,
  onExportImage,
  canExport,
  isPublishing,
  hasPdf,
  aspectRatio,
  onAspectRatioChange,
}: {
  styleValue: string
  styleOptions: UserStylePreset[]
  onStyleChange: (value: string) => void
  colorMode: ColorMode
  colorModeOptions: ColorMode[]
  onColorModeChange: (value: ColorMode) => void
  fontFamily: string
  onFontFamilyChange: (value: string) => void
  fontSize: string
  onFontSizeChange: (value: string) => void
  bubbleShape: string
  onBubbleShapeChange: (shape: string) => void
  hasTail: boolean
  onToggleTail: () => void
  onOpenPublish: () => void
  onDownloadPdf: () => void
  onExportImage: () => void
  canExport: boolean
  isPublishing: boolean
  hasPdf: boolean
  aspectRatio: string
  onAspectRatioChange: (value: string) => void
}) {
  const { t } = useI18n(['comics', 'common'])

  return (
    <div className="flex flex-col gap-4">
      <PanelCard title="风格">
        <LabelRow label={String(t('style.select'))}>
          <Select value={styleValue} onValueChange={onStyleChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={String(t('style.select'))} />
            </SelectTrigger>
            <SelectContent>
              {styleOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
              <SelectItem value="__custom__">{String(t('style.addCustom'))}</SelectItem>
            </SelectContent>
          </Select>
        </LabelRow>
        <LabelRow label="画幅比例">
          <Select value={aspectRatio} onValueChange={onAspectRatioChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="选择画幅" />
            </SelectTrigger>
            <SelectContent>
              {ASPECT_RATIO_OPTIONS.map((ratio) => (
                <SelectItem key={ratio} value={ratio}>
                  {ratio}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabelRow>
        <LabelRow label={String(t('colorMode.title'))}>
          <Select
            value={colorMode}
            onValueChange={(value) => onColorModeChange(value as ColorMode)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder={String(t('colorMode.title'))} />
            </SelectTrigger>
            <SelectContent>
              {colorModeOptions.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {mode === 'color'
                    ? String(t('colorMode.color'))
                    : String(t('colorMode.blackWhite'))}
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
        <div className="flex items-center justify-between gap-4">
          <Select value={bubbleShape} onValueChange={onBubbleShapeChange}>
            <SelectTrigger className="w-32">
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
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              onClick={onOpenPublish}
              disabled={!canExport || isPublishing}
              className="flex-1"
            >
              导出 PDF
            </Button>
            <Button
              variant="outline"
              onClick={onDownloadPdf}
              disabled={!hasPdf}
              className="flex-1"
            >
              下载 PDF
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={onExportImage}
            disabled={!canExport}
            className="w-full"
          >
            导出图片
          </Button>
        </div>
      </PanelCard>
    </div>
  )
}

function PageStatusCard({
  selectedPage,
  hasImage,
  isPlaceholder,
  onDeletePage,
  deleteLoading,
}: {
  selectedPage: number | null
  hasImage: boolean
  isPlaceholder: boolean
  onDeletePage: () => Promise<void>
  deleteLoading: boolean
}) {
  const pageLabel = selectedPage ? `第${String(selectedPage).padStart(2, '0')}页` : '当前未选择页面'
  const statusText = !selectedPage
    ? '请先在左侧选择一个页面'
    : hasImage
      ? '该页面已生成图片，可直接导出或替换。'
      : isPlaceholder
        ? '该页面尚未生成分镜或图片，请先在“分镜”步骤设置布局。'
        : '该页面暂无图片，请点击“生图”开始生成。'

  return (
    <PanelCard title="页面状态">
      <div className="space-y-2 text-sm text-muted-foreground">
        <p className="font-medium text-foreground/80">{pageLabel}</p>
        <p className="leading-relaxed">{statusText}</p>
      </div>
      <Button
        variant="outline"
        className="justify-start"
        onClick={onDeletePage}
        disabled={!selectedPage || deleteLoading}
      >
        {deleteLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            删除中…
          </>
        ) : (
          <>
            <Trash2 className="mr-2 h-4 w-4" />
            删除当前页面
          </>
        )}
      </Button>
    </PanelCard>
  )
}

export function ImageGeneration() {
  const [comicId] = useAtom(currentComicIdAtom)
  const [comicDetail, setComicDetail] = useAtom(currentComicDetailAtom)
  const [style, setStyle] = useAtom(styleAtom)
  const [colorMode, setColorMode] = useAtom(colorModeAtom)
  const [aspectRatio, setAspectRatio] = useAtom(aspectRatioAtom)
  const [selectedPage, setSelectedPage] = useAtom(selectedPageAtom)
  const [customPages, setCustomPages] = useAtom(customPagesAtom)
  const { t } = useI18n('comics')
  const { preferences, update: updatePreferences, colorModes } = usePreferences()
  const styleOptions = useMemo<UserStylePreset[]>(
    () => (preferences?.style_presets?.length ? preferences.style_presets : DEFAULT_STYLE_PRESETS),
    [preferences],
  )
  const colorModeOptions = colorModes?.length ? colorModes : DEFAULT_COLOR_MODES
  const [customStyleOpen, setCustomStyleOpen] = useState(false)
  const [customLabel, setCustomLabel] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [customSaving, setCustomSaving] = useState(false)

  const [pages, setPages] = useState<RenderedPage[]>([])
  const [fontFamily, setFontFamily] = useState(FONT_OPTIONS[0]!.value)
  const [fontSize, setFontSize] = useState(FONT_SIZE_OPTIONS[1]!)
  const [bubbleShape, setBubbleShape] = useState(BUBBLE_SHAPES[0]!.value)
  const [hasTail, setHasTail] = useState(true)
  const [isRendering, setIsRendering] = useState(false)
  const [pollTries, setPollTries] = useState(0)
  const pollTimerRef = useRef<number | null>(null)
  const triesRef = useRef<number>(0)
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [makePublic, setMakePublic] = useState(true)
  const pdfPollTimerRef = useRef<number | null>(null)
  const pdfTriesRef = useRef<number>(0)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const handleStyleChange = async (value: string) => {
    if (!value) return
    if (value === '__custom__') {
      setCustomStyleOpen(true)
      setCustomLabel('')
      setCustomPrompt('')
      return
    }
    if (value === style) return
    const previous = style
    setStyle(value)
    try {
      await updatePreferences({ selected_style: value })
    } catch (err: any) {
      setStyle(previous)
      const message = err?.response?.data?.error || String(t('style.updateFailed'))
      toast.error(message)
    }
  }

  const handleColorModeChange = async (value: ColorMode) => {
    if (!value || value === colorMode) return
    const previous = colorMode
    setColorMode(value)
    try {
      await updatePreferences({ color_mode: value })
    } catch (err: any) {
      setColorMode(previous)
      const message = err?.response?.data?.error || String(t('colorMode.updateFailed'))
      toast.error(message)
    }
  }

  const handleAspectRatioChange = (value: string) => {
    if (!value) return
    setAspectRatio(value)
  }

  const handleSaveCustomStyle = async () => {
    const prompt = customPrompt.trim()
    if (!prompt) {
      toast.error(String(t('style.customPromptRequired')))
      return
    }

    const labelInput = customLabel.trim()
    const label = labelInput || String(t('style.customDefaultName'))
    const existing = (preferences?.style_presets ?? DEFAULT_STYLE_PRESETS).map((item) => ({
      value: item.value,
      label: item.label,
      is_custom: item.is_custom ?? !DEFAULT_STYLE_PRESETS.some((preset) => preset.value === item.value),
    }))

    const filtered = existing.filter((item) => !(item.is_custom && item.value === prompt))
    const nextPresets: UserStylePreset[] = [...filtered, { value: prompt, label, is_custom: true }]

    setCustomSaving(true)
    try {
      await updatePreferences({ style_presets: nextPresets, selected_style: prompt })
      setStyle(prompt)
      setCustomStyleOpen(false)
      setCustomLabel('')
      setCustomPrompt('')
      toast.success(String(t('style.customSaved')))
    } catch (err: any) {
      const message = err?.response?.data?.error || String(t('style.customSaveFailed'))
      toast.error(message)
    } finally {
      setCustomSaving(false)
    }
  }

  const normalizePages = useCallback((pagesArr: any[]): RenderedPage[] => {
    return pagesArr
      .filter((entry: any) => Number.isFinite(Number(entry?.page_number)))
      .map((entry: any) => ({
        page_id: Number(entry?.page_id ?? 0),
        page_number: Number(entry?.page_number),
        image_url: typeof entry?.image_url === 'string' ? entry.image_url : null,
      }))
      .sort((a, b) => a.page_number - b.page_number)
  }, [])

  const fetchPages = useCallback(async () => {
    if (!comicId) return [] as RenderedPage[]
    const imagesRes = await ComicsApi.listImages(comicId)
    const pagesArr = Array.isArray((imagesRes as any)?.pages) ? (imagesRes as any).pages : []
    const normalized = normalizePages(pagesArr)
    setPages(normalized)
    normalized.forEach((page) => cacheImageUrl(comicId, page.page_number, page.image_url))
    return normalized
  }, [comicId, normalizePages])

  useEffect(() => {
    let cancelled = false
    if (!comicId) {
      setPages([])
      return
    }

    ;(async () => {
      try {
        const result = await fetchPages()
        if (!cancelled) {
          setPages(result)
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('加载漫画图片失败', err)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [comicId, fetchPages])

  useEffect(() => {
    setCustomPages((prev) => {
      if (!prev.length) return prev
      const normalized = new Set(pages.map((p) => p.page_number))
      const filtered = prev.filter((page) => !normalized.has(page))
      return filtered.length === prev.length ? prev : filtered
    })
  }, [pages, setCustomPages])

  useEffect(() => {
    const ratio = (comicDetail as any)?.aspect_ratio
    if (typeof ratio === 'string' && ASPECT_RATIO_OPTIONS.includes(ratio)) {
      setAspectRatio(ratio)
    }
  }, [comicDetail, setAspectRatio])

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
      if (pdfPollTimerRef.current) {
        window.clearInterval(pdfPollTimerRef.current)
        pdfPollTimerRef.current = null
      }
    }
  }, [])

  const currentPage = useMemo(() => {
    if (!selectedPage) return null
    return pages.find((page) => page.page_number === selectedPage) ?? null
  }, [pages, selectedPage])

  const hasImage = Boolean(currentPage?.image_url)
  const isPlaceholder = useMemo(() => {
    if (!selectedPage) return false
    if (currentPage && currentPage.page_id > 0) return false
    return !pages.some((page) => page.page_number === selectedPage)
  }, [currentPage, pages, selectedPage])

  const clearPoll = () => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }

    triesRef.current = 0
    setPollTries(0)
  }

  const clearPdfPoll = () => {
    if (pdfPollTimerRef.current) {
      window.clearInterval(pdfPollTimerRef.current)
      pdfPollTimerRef.current = null
    }

    pdfTriesRef.current = 0
  }

  const handleDeletePage = async () => {
    if (!selectedPage) return

    const pageNumber = selectedPage
    const hasBackendPage = Boolean(currentPage && currentPage.page_id > 0)

    if (!comicId || !hasBackendPage) {
      setCustomPages((prev) => prev.filter((page) => page !== pageNumber))
      setSelectedPage((prev) => {
        if (prev !== pageNumber) return prev
        const remainingActual = pages.filter((p) => p.page_number !== pageNumber)
        if (remainingActual.length > 0) return remainingActual[remainingActual.length - 1]!.page_number
        const remainingCustom = customPages.filter((page) => page !== pageNumber)
        return remainingCustom[0] ?? 1
      })
      return
    }

    setDeleteLoading(true)
    try {
      await ComicsApi.deletePage(comicId, pageNumber)
      toast.success('页面已删除')

      const updated = await fetchPages()
      const availableNumbers = updated.map((page) => page.page_number)
      const placeholderNumbers = customPages.filter((page) => page !== pageNumber)

      setCustomPages(placeholderNumbers)

      const fallback = (() => {
        if (availableNumbers.includes(pageNumber)) return pageNumber
        if (availableNumbers.length > 0) return availableNumbers[Math.max(0, availableNumbers.length - 1)]
        if (placeholderNumbers.length > 0) return placeholderNumbers[0]
        return 1
      })()

      setSelectedPage(fallback)

      try {
        const detail = await ComicsApi.get(comicId)
        setComicDetail(detail)
      } catch (err) {
        console.warn('刷新漫画详情失败', err)
      }
    } catch (err: any) {
      toast.error(err?.message || '删除页面失败')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleGenerate = async () => {
    if (!comicId) {
      toast.error('请先完成“分镜”步骤后再来生图')
      return
    }

    if (!selectedPage || selectedPage <= 0) {
      toast.error('请选择要生成的页面')
      return
    }

    let detail = comicDetail
    try {
      const latest = await ComicsApi.get(comicId)
      detail = latest as any
      setComicDetail(latest)
    } catch (err) {
      console.warn('刷新漫画详情失败', err)
    }

    const panelShots = (detail?.panel_shots ?? []) as any[]
    const hasShotsForPage = panelShots.some((shot) => Number(shot?.page_number) === selectedPage)
    if (!hasShotsForPage) {
      toast.error('当前页面尚未生成分镜，请先在“分镜”步骤完成该页的布局。')
      return
    }

    const layouts = (detail?.page_layouts ?? []) as any[]
    const layoutForPage = layouts.find((layout) => Number(layout?.page_number) === selectedPage)
    if (!layoutForPage) {
      toast.error('未找到该页的布局，请返回“分镜”步骤选择布局后再尝试。')
      return
    }

    try {
      setIsRendering(true)
      setPollTries(0)
      clearPoll()

      await PanelsApi.renderPage(comicId, selectedPage, {
        font_family: fontFamily,
        font_size: fontSize,
        bubble_shape: bubbleShape,
        bubble_tail: hasTail,
        color_mode: colorMode,
        aspect_ratio: aspectRatio,
      })

      // Wait 2 seconds before starting to poll
      window.setTimeout(() => {
        pollTimerRef.current = window.setInterval(async () => {
          try {
            const imagesRes = await ComicsApi.listImages(comicId)
            const pagesArr = Array.isArray((imagesRes as any)?.pages) ? (imagesRes as any).pages : []
            const normalized = normalizePages(pagesArr)
            const hasTargetImage = normalized.some(
              (page) => page.page_number === selectedPage && page.image_url,
            )
            triesRef.current += 1
            setPollTries(triesRef.current)

            const targetPage = normalized.find((page) => page.page_number === selectedPage)
            const cachedUrl =
              comicId && selectedPage ? getCachedImageUrl(comicId, selectedPage) : null
            const isNewImage =
              Boolean(targetPage?.image_url) &&
              (!cachedUrl || targetPage?.image_url !== cachedUrl)

            if (isNewImage) {
              setPages(normalized)
              if (comicId) {
                cacheImageUrl(comicId, selectedPage, targetPage?.image_url ?? null)
              }

              toast.success('生图完成')
              clearPoll()
              setIsRendering(false)

              try {
                const d = await ComicsApi.get(comicId)
                setComicDetail(d)
              } catch (err) {
                console.warn('刷新漫画详情失败', err)
              }
            } else if (triesRef.current >= MAX_POLL_TRIES) {
              toast.error('生图超时（30s），请稍后重试或检查任务队列')
              clearPoll()
              setIsRendering(false)
            }
          } catch (err) {
            console.warn('轮询生图失败', err)
            triesRef.current += 1
            setPollTries(triesRef.current)
            if (triesRef.current >= MAX_POLL_TRIES) {
              toast.error('生图轮询失败或超时')
              clearPoll()
              setIsRendering(false)
            }
          }
        }, 2000)
      }, 2000)
    } catch (err: any) {
      toast.error(err?.message || '生图任务创建失败')
      clearPoll()
      setIsRendering(false)
    }
  }

  const handleExportImage = () => {
    if (!selectedPage) return
    if (!currentPage || !currentPage.image_url) {
      toast.error('当前页暂无图片可导出')
      return
    }

    const url = proxiedStatic(currentPage.image_url)
    const a = document.createElement('a')
    a.href = url
    a.download = `comic_${comicId}_page_${selectedPage}`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const handleDownloadPdf = () => {
    const pdfUrl = (comicDetail as any)?.pdf_url
    if (!pdfUrl) {
      toast.error('暂无 PDF 可下载，请先导出')
      return
    }

    const href = proxiedStatic(pdfUrl) || pdfUrl
    const a = document.createElement('a')
    a.href = href
    a.download = `comic_${comicId}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    toast.success('开始下载 PDF')
  }

  const hasPdf = Boolean((comicDetail as any)?.pdf_url)

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex w-full flex-col gap-6 rounded-3xl border border-border/60 bg-card p-6 shadow-sm lg:flex-row">
        <div className="flex w-full flex-col gap-4 lg:w-48">
          <PageSidebar className="w-full" />
          <PageStatusCard
            selectedPage={selectedPage ?? null}
            hasImage={hasImage}
            isPlaceholder={isPlaceholder}
            onDeletePage={handleDeletePage}
            deleteLoading={deleteLoading}
          />
        </div>
        <StoryboardCanvas imageUrl={proxiedStatic(currentPage?.image_url ?? undefined)} />
        <div className="flex w-full flex-col gap-4 lg:max-w-sm">
          <PropertyPanel
            styleValue={style}
            styleOptions={styleOptions}
            onStyleChange={handleStyleChange}
            colorMode={colorMode}
            colorModeOptions={colorModeOptions}
            onColorModeChange={handleColorModeChange}
            fontFamily={fontFamily}
            onFontFamilyChange={setFontFamily}
            fontSize={fontSize}
            onFontSizeChange={setFontSize}
            bubbleShape={bubbleShape}
            onBubbleShapeChange={setBubbleShape}
            hasTail={hasTail}
            onToggleTail={() => setHasTail((prev) => !prev)}
            onOpenPublish={() => setPublishOpen(true)}
            onDownloadPdf={handleDownloadPdf}
            onExportImage={handleExportImage}
            canExport={Boolean(comicId)}
            isPublishing={isPublishing}
            hasPdf={hasPdf}
            aspectRatio={aspectRatio}
            onAspectRatioChange={handleAspectRatioChange}
          />
        </div>
      </div>

      <div className="flex w-full justify-center gap-4">
        <Button size="lg" onClick={handleGenerate} disabled={isRendering || !comicId}>
          {isRendering ? String(t('comics:publish.rendering')) : '生图'}
        </Button>
      </div>

      <Dialog
        open={customStyleOpen}
        onOpenChange={(open) => {
          setCustomStyleOpen(open)
          if (!open) {
            setCustomLabel('')
            setCustomPrompt('')
            setCustomSaving(false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{String(t('style.customDialogTitle'))}</DialogTitle>
            <DialogDescription>{String(t('style.customDialogDescription'))}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="custom-style-label">{String(t('style.customLabel'))}</Label>
              <Input
                id="custom-style-label"
                value={customLabel}
                placeholder={String(t('style.customLabelPlaceholder'))}
                onChange={(event) => setCustomLabel(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-style-prompt">{String(t('style.customPrompt'))}</Label>
              <Textarea
                id="custom-style-prompt"
                value={customPrompt}
                placeholder={String(t('style.customPromptPlaceholder'))}
                onChange={(event) => setCustomPrompt(event.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={customSaving}>
                {String(t('common:cancel'))}
              </Button>
            </DialogClose>
            <Button onClick={handleSaveCustomStyle} disabled={customSaving}>
              {customSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {String(t('style.customSaveAction'))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={publishOpen} onOpenChange={(open) => {
        if (!open) {
          setMakePublic(true)
          clearPdfPoll()
        }
        setPublishOpen(open)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{String(t('comics:publish.exportTitle'))}</DialogTitle>
            <DialogDescription>{String(t('comics:publish.exportDescription'))}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-4 py-2">
            <div>
              <p className="text-sm font-medium">{String(t('comics:publish.makePublic'))}</p>
              <p className="text-xs text-muted-foreground">{String(t('comics:publish.makePublicHint'))}</p>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="make-public" className="text-sm">{String(t('comics:publish.togglePublic'))}</Label>
              <Switch id="make-public" checked={makePublic} onCheckedChange={(v) => setMakePublic(Boolean(v))} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline">{String(t('common:cancel'))}</Button>
            </DialogClose>
            <Button
              onClick={async () => {
                if (!comicId) return
                try {
                  setIsPublishing(true)
                  const resp = await ComicsApi.publish(comicId, { make_public: makePublic })
                  const stageJobs = (resp as any)?.stage_jobs ?? null
                  if (!stageJobs) {
                    console.info('Publish skipped:', resp)
                    toast(String(t('comics:publish.noChanges')))
                    setPublishOpen(false)
                    setIsPublishing(false)
                    return
                  }

                  toast.success(String(t('comics:publish.queueStarted')))
                  setPublishOpen(false)

                  clearPdfPoll()
                  const beforePublish = await ComicsApi.get(comicId)
                  const oldPdfUrl = (beforePublish as any)?.pdf_url

                  // Wait 2 seconds before starting to poll
                  window.setTimeout(() => {
                    pdfPollTimerRef.current = window.setInterval(async () => {
                      try {
                        const d = await ComicsApi.get(comicId)
                        const pdfUrl = (d as any)?.pdf_url as string | null | undefined
                        pdfTriesRef.current += 1

                        // Only accept the PDF if it's different from the old one
                        // If there was no old PDF, accept any new URL
                        const isNewPdf = pdfUrl && (!oldPdfUrl || pdfUrl !== oldPdfUrl)

                        if (isNewPdf) {
                          clearPdfPoll()
                          setIsPublishing(false)
                          const href = proxiedStatic(pdfUrl) || pdfUrl
                          const a = document.createElement('a')
                          a.href = href
                          a.download = `comic_${comicId}.pdf`
                          document.body.appendChild(a)
                          a.click()
                          a.remove()
                          toast.success(String(t('comics:publish.pdfReady')))
                          try { setComicDetail(d) } catch {}
                        } else if (pdfTriesRef.current >= MAX_PDF_POLL_TRIES) {
                          clearPdfPoll()
                          setIsPublishing(false)
                          toast.error(String(t('comics:publish.timeout')))
                        }
                      } catch (err) {
                        console.warn('轮询 PDF 失败', err)
                        pdfTriesRef.current += 1
                        if (pdfTriesRef.current >= MAX_PDF_POLL_TRIES) {
                          clearPdfPoll()
                          setIsPublishing(false)
                          toast.error(String(t('comics:publish.downloadFailed')))
                        }
                      }
                    }, 2000)
                  }, 2000)
                } catch (err: any) {
                  toast.error(err?.message || String(t('comics:publish.failed')))
                  setIsPublishing(false)
                }
              }}
              disabled={isPublishing}
            >
              {isPublishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {String(t('comics:publish.submit'))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

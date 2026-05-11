import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { ChevronDown, ChevronUp, Image as ImageIcon, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'

import ComicsApi from '@/apis/comics'
import PanelsApi from '@/apis/panels'
import { type ActiveJobEntry, activeJobsAtom } from '@/atoms'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  DEFAULT_ASPECT_RATIOS,
  DEFAULT_BUBBLE_SHAPES,
  DEFAULT_COLOR_MODES,
  DEFAULT_FONT_FAMILIES,
  DEFAULT_FONT_SIZES,
  DEFAULT_SELECTED_STYLE,
  DEFAULT_STYLE_PRESETS,
} from '@/config/preferences'
import { AI_PROVIDER_LABELS, useAiProviders } from '@/hooks/use-ai-providers'
import { useI18n } from '@/hooks/use-i18n'
import { usePreferences } from '@/hooks/use-preferences'
import { resolveAvailablePreferenceValue, resolvePreferenceValue } from '@/lib/auto-preferences'
import { cn, proxiedStatic } from '@/lib/utils'
import type { AiProviderId, AutoPreference, ColorMode, RenderRun } from '@/service/types'

import {
  activeRenderRunAtom,
  activeTabAtom,
  aspectRatioAtom,
  currentComicDetailAtom,
  currentComicIdAtom,
  currentComicOverridesAtom,
  imageProviderAtom,
  storyStepAtom,
  styleAtom,
  textProviderAtom,
} from '../atoms'
import { AutoSelectControl, type AutoSelectOption } from '../components/auto-select-control'
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

const FONT_LABELS: Record<string, string> = {
  'source-han-sans': '思源黑体',
  yahei: '微软雅黑',
  heiti: '黑体',
  songti: '宋体',
}

const FONT_OPTIONS = DEFAULT_FONT_FAMILIES.map((value) => ({
  value,
  label: FONT_LABELS[value] ?? value,
}))

const FONT_SIZE_OPTIONS = DEFAULT_FONT_SIZES.map((value) => ({
  value,
  label: value,
}))

const ASPECT_RATIO_OPTIONS = DEFAULT_ASPECT_RATIOS.map((value) => ({
  value,
  label: value,
}))

const DEFAULT_ASPECT_RATIO = DEFAULT_ASPECT_RATIOS[0] ?? '16:9'
const DEFAULT_FONT_FAMILY = DEFAULT_FONT_FAMILIES[0] ?? 'source-han-sans'
const DEFAULT_FONT_SIZE = DEFAULT_FONT_SIZES[1] ?? DEFAULT_FONT_SIZES[0] ?? '20'
const DEFAULT_BUBBLE_SHAPE = DEFAULT_BUBBLE_SHAPES[0] ?? 'rect'
const DEFAULT_COLOR_MODE = DEFAULT_COLOR_MODES[0] ?? 'black-white'

type RenderRunMode = RenderRun['mode']

const RENDER_RUN_ACTIONS: { mode: RenderRunMode; labelKey: string }[] = [
  { mode: 'first_page', labelKey: 'image.generateFirst' },
  { mode: 'remaining_pages', labelKey: 'image.generateRemaining' },
  { mode: 'all_pages', labelKey: 'image.generateAll' },
]

const RENDER_RUN_MODE_LABELS: Record<RenderRunMode, string> = {
  first_page: 'image.mode.firstPage',
  remaining_pages: 'image.mode.remainingPages',
  all_pages: 'image.mode.allPages',
}

function isActiveRenderRun(renderRun: RenderRun | null) {
  return Boolean(
    renderRun
      && (renderRun.status === 'queued' || renderRun.status === 'running'),
  )
}

function isActiveRenderJobStatus(status: string | null | undefined) {
  return status === 'queued' || status === 'started' || status === 'running'
}

function renderRunProgressStatus(renderRun: RenderRun): RenderProgressState['status'] {
  if (renderRun.status === 'aborted') return 'idle'
  if (renderRun.status === 'queued') return 'submitting'
  if (renderRun.status === 'running') return 'rendering'
  if (renderRun.status === 'completed') return 'completed'
  if (renderRun.status === 'failed') return 'failed'

  return 'idle'
}

function renderRunStatusMessage(renderRun: RenderRun, t: (key: string, options?: any) => unknown) {
  const modeLabel = String(t(RENDER_RUN_MODE_LABELS[renderRun.mode]))

  if (renderRun.status === 'aborted') {
    return String(t('image.run.aborted'))
  }

  if (renderRun.abort_requested) {
    return String(t('image.run.abortRequested'))
  }

  if (renderRun.status === 'queued') {
    return String(t('image.run.queued', { mode: modeLabel }))
  }

  if (renderRun.status === 'running') {
    return String(t('image.run.running', { mode: modeLabel }))
  }

  if (renderRun.status === 'completed') {
    return String(t('image.run.completed', { mode: modeLabel }))
  }

  if (renderRun.status === 'failed') {
    return renderRun.error_message
      ? String(t('image.run.failedWithError', { mode: modeLabel, message: renderRun.error_message }))
      : String(t('image.run.failed', { mode: modeLabel }))
  }

  return String(t('image.run.aborted'))
}

function renderRunHelperText(renderRun: RenderRun | null, t: (key: string, options?: any) => unknown) {
  if (!renderRun) return undefined

  if (renderRun.status === 'aborted') {
    return String(t('image.run.helperAborted'))
  }

  if (renderRun.abort_requested) {
    return String(t('image.run.helperAbortRequested'))
  }

  if (renderRun.status === 'completed') {
    return String(t('image.run.helperCompleted'))
  }

  if (renderRun.status === 'failed') {
    return String(t('image.run.helperFailed'))
  }

  return String(t('image.run.helperRunning'))
}

function createActiveRenderJob(renderRun: RenderRun, title?: string | null, fallbackTitle = 'Render run'): ActiveJobEntry {
  return {
    job_id: renderRun.job_id ?? `render-run-${renderRun.id}`,
    render_run_id: renderRun.id,
    comic_id: renderRun.comic_id,
    stage: 'render',
    status: renderRun.status,
    title: title ?? fallbackTitle,
    started_at: renderRun.started_at,
    rq_status: renderRun.status,
    workflow_stages: [{ stage: 'render', status: renderRun.status }],
    render_progress: {
      completed: renderRun.completed_pages.length,
      total: renderRun.requested_pages.length,
    },
    render_run: renderRun,
    reconnecting: false,
    warning: null,
  }
}

function parseImagePages(imagesRes: unknown): PageImage[] {
  const pagesArr = (imagesRes as { pages?: unknown })?.pages

  return Array.isArray(pagesArr) ? pagesArr as PageImage[] : []
}

function pagesToScenes(pagesArr: PageImage[]): Scene[] {
  return [...pagesArr]
    .sort((a, b) => a.page_number - b.page_number)
    .map((page) => ({
      id: page.page_number,
      label: String(page.page_number).padStart(2, '0'),
      pageId: page.page_id,
    }))
}

function renderFailureMessage(comic: any): string | null {
  const stages = Array.isArray(comic?.workflow_stages) ? comic.workflow_stages : []
  const renderStage = stages.find((stage: any) => stage?.stage === 'render')

  if (renderStage?.status === 'failed') {
    return renderStage.error_message || comic?.error_message || 'image.error.renderFailed'
  }

  if (comic?.workflow_stage === 'render' && comic?.workflow_status === 'failed') {
    return comic?.error_message || 'image.error.renderFailed'
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

function AutoBooleanSelectControl({
  label,
  value,
  trueLabel,
  falseLabel,
  onChange,
}: {
  label: string
  value: AutoPreference<boolean>
  trueLabel: string
  falseLabel: string
  onChange: (value: AutoPreference<boolean>) => void
}) {
  const { t } = useI18n('common')
  const selectValue = value.mode === 'manual' ? String(value.value) : 'auto'

  return (
    <LabelRow label={label}>
      <Select
        value={selectValue}
        onValueChange={(nextValue) => {
          if (nextValue === 'auto') {
            onChange({ mode: 'auto' })

            return
          }

          onChange({ mode: 'manual', value: nextValue === 'true' })
        }}
      >
        <SelectTrigger className="w-44 max-w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">{String(t('preference.auto'))}</SelectItem>
          <SelectItem value="true">{trueLabel}</SelectItem>
          <SelectItem value="false">{falseLabel}</SelectItem>
        </SelectContent>
      </Select>
    </LabelRow>
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

function StoryboardCanvas({ imageUrl }: { imageUrl?: string | null }) {
  return (
    <main className="flex min-h-[420px] flex-1 flex-col items-center lg:min-h-[540px]">
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
  imageProviderPreference,
  onImageProviderPreferenceChange,
  imageProviderOptions,
  textProviderPreference,
  onTextProviderPreferenceChange,
  textProviderOptions,
  stylePreference,
  onStylePreferenceChange,
  styleOptions,
  colorModePreference,
  onColorModePreferenceChange,
  aspectRatioPreference,
  onAspectRatioPreferenceChange,
  fontFamilyPreference,
  onFontFamilyPreferenceChange,
  fontSizePreference,
  onFontSizePreferenceChange,
  bubbleShapePreference,
  onBubbleShapePreferenceChange,
  bubbleTailPreference,
  onBubbleTailPreferenceChange,
  onOpenPublish,
  onExportImage,
  canExport,
  isPublishing,
}: {
  imageProviderPreference: AutoPreference<AiProviderId>
  onImageProviderPreferenceChange: (value: AutoPreference<AiProviderId>) => void
  imageProviderOptions: AutoSelectOption<AiProviderId>[]
  textProviderPreference: AutoPreference<AiProviderId>
  onTextProviderPreferenceChange: (value: AutoPreference<AiProviderId>) => void
  textProviderOptions: AutoSelectOption<AiProviderId>[]
  stylePreference: AutoPreference<string>
  onStylePreferenceChange: (value: AutoPreference<string>) => void
  styleOptions: AutoSelectOption<string>[]
  colorModePreference: AutoPreference<ColorMode>
  onColorModePreferenceChange: (value: AutoPreference<ColorMode>) => void
  aspectRatioPreference: AutoPreference<string>
  onAspectRatioPreferenceChange: (value: AutoPreference<string>) => void
  fontFamilyPreference: AutoPreference<string>
  onFontFamilyPreferenceChange: (value: AutoPreference<string>) => void
  fontSizePreference: AutoPreference<string>
  onFontSizePreferenceChange: (value: AutoPreference<string>) => void
  bubbleShapePreference: AutoPreference<string>
  onBubbleShapePreferenceChange: (value: AutoPreference<string>) => void
  bubbleTailPreference: AutoPreference<boolean>
  onBubbleTailPreferenceChange: (value: AutoPreference<boolean>) => void
  onOpenPublish: () => void
  onExportImage: () => void
  canExport: boolean
  isPublishing: boolean
}) {
  const { t } = useI18n('comics')
  const colorModeOptions = useMemo(() => (
    DEFAULT_COLOR_MODES.map((value) => ({
      value,
      label: String(t(value === 'black-white' ? 'format.color.blackWhite' : 'format.color.color')),
    }))
  ), [t])
  const bubbleShapeOptions = useMemo(() => (
    DEFAULT_BUBBLE_SHAPES.map((value) => ({
      value,
      label: value === 'rect' ? String(t('options.bubbleShape.rect', { ns: 'me' })) : String(t('options.bubbleShape.round', { ns: 'me' })),
    }))
  ), [t])

  return (
    <aside className="flex min-w-0 flex-col gap-4 xl:w-80">
      <PanelCard title={String(t('image.model'))}>
        <AutoSelectControl
          label={String(t('image.imageModel'))}
          value={imageProviderPreference}
          options={imageProviderOptions}
          onChange={onImageProviderPreferenceChange}
        />
        <AutoSelectControl
          label={String(t('image.textModel'))}
          value={textProviderPreference}
          options={textProviderOptions}
          onChange={onTextProviderPreferenceChange}
        />
      </PanelCard>

      <PanelCard title={String(t('image.style'))}>
        <AutoSelectControl
          label={String(t('image.renderStyle'))}
          value={stylePreference}
          options={styleOptions}
          onChange={onStylePreferenceChange}
        />
        <AutoSelectControl
          label={String(t('image.color'))}
          value={colorModePreference}
          options={colorModeOptions}
          onChange={onColorModePreferenceChange}
        />
        <AutoSelectControl
          label={String(t('image.aspectRatio'))}
          value={aspectRatioPreference}
          options={ASPECT_RATIO_OPTIONS}
          onChange={onAspectRatioPreferenceChange}
        />
      </PanelCard>

      <PanelCard title={String(t('image.text'))}>
        <AutoSelectControl
          label={String(t('image.font'))}
          value={fontFamilyPreference}
          options={FONT_OPTIONS}
          onChange={onFontFamilyPreferenceChange}
        />
        <AutoSelectControl
          label={String(t('image.fontSize'))}
          value={fontSizePreference}
          options={FONT_SIZE_OPTIONS}
          onChange={onFontSizePreferenceChange}
        />
      </PanelCard>

      <PanelCard title={String(t('image.bubble'))}>
        <AutoSelectControl
          label={String(t('image.bubbleType'))}
          value={bubbleShapePreference}
          options={bubbleShapeOptions}
          onChange={onBubbleShapePreferenceChange}
        />
        <div className="flex justify-end">
          <ShapePreview
            shape={bubbleShapePreference.mode === 'manual'
              ? bubbleShapePreference.value
              : DEFAULT_BUBBLE_SHAPE}
          />
        </div>
        <AutoBooleanSelectControl
          label={String(t('image.bubbleTail'))}
          value={bubbleTailPreference}
          trueLabel={String(t('image.tailOn'))}
          falseLabel={String(t('image.tailOff'))}
          onChange={onBubbleTailPreferenceChange}
        />
      </PanelCard>

      <PanelCard title={String(t('image.export'))}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={onOpenPublish}
            disabled={!canExport || isPublishing}
          >
            {String(t('image.exportPdf'))}
          </Button>
          <Button
            variant="outline"
            onClick={onExportImage}
            disabled={!canExport}
          >
            {String(t('image.exportImages'))}
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

function createRenderProgress(maxPollTries: number, message: string): RenderProgressState {
  return {
    status: 'idle',
    elapsedMs: 0,
    pollTries: 0,
    maxPollTries,
    message,
  }
}

/**
 * 故事板生图配置页
 */
export function ImageGeneration() {
  const { t } = useI18n('comics')
  const [scenes, setScenes] = useState(INITIAL_SCENES)
  const [selectedScene, setSelectedScene] = useState(INITIAL_SCENES[0]?.id ?? 1)
  // Pages data from images API
  const [pages, setPages] = useState<PageImage[]>([])
  const [fontFamily, setFontFamily] = useState(DEFAULT_FONT_FAMILY)
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE)
  const [bubbleShape, setBubbleShape] = useState(DEFAULT_BUBBLE_SHAPE)
  const [hasTail, setHasTail] = useState(true)
  const [colorMode, setColorMode] = useState<ColorMode>(DEFAULT_COLOR_MODE)
  const [isRendering, setIsRendering] = useState(false)
  const [isStartingRenderRun, setIsStartingRenderRun] = useState(false)
  const [isAbortingRenderRun, setIsAbortingRenderRun] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [makePublic, setMakePublic] = useState(true)
  const MAX_POLL_TRIES = 180 // 180 * 2s = 6min; keep ahead of backend image timeout
  const [pollTries, setPollTries] = useState(0)
  const [renderProgress, setRenderProgress] = useState<RenderProgressState>(() => (
    createRenderProgress(MAX_POLL_TRIES, String(t('image.readyMessage')))
  ))
  const pollTimerRef = useRef<number | null>(null)
  const triesRef = useRef<number>(0)
  const renderStartedAtRef = useRef<number | null>(null)
  const renderTargetRef = useRef<{ pageNumber: number; previousImageUrl: string | null } | null>(null)
  const refreshedRenderRunIdsRef = useRef<Set<number>>(new Set())
  // PDF 导出轮询
  const MAX_PDF_POLL_TRIES = 30 // 30 * 2s = 60s
  const pdfPollTimerRef = useRef<number | null>(null)
  const pdfTriesRef = useRef<number>(0)
  const [comicId] = useAtom(currentComicIdAtom)
  const [, setComicDetail] = useAtom(currentComicDetailAtom)
  const [activeRenderRun, setActiveRenderRun] = useAtom(activeRenderRunAtom)
  const setActiveJobs = useSetAtom(activeJobsAtom)
  const [style, setStyle] = useAtom(styleAtom)
  const [aspectRatio, setAspectRatio] = useAtom(aspectRatioAtom)
  const [overrides, setOverrides] = useAtom(currentComicOverridesAtom)
  const [imageProvider, setImageProvider] = useAtom(imageProviderAtom)
  const [textProvider, setTextProvider] = useAtom(textProviderAtom)
  const { providers, imageProviders, textProviders, loading: providersLoading } = useAiProviders()
  const { preferences } = usePreferences()
  const imageProviderOptions = useMemo(() => (
    imageProviders.map((provider) => ({
      value: provider,
      label: AI_PROVIDER_LABELS[provider],
    }))
  ), [imageProviders])
  const textProviderOptions = useMemo(() => (
    textProviders.map((provider) => ({
      value: provider,
      label: AI_PROVIDER_LABELS[provider],
    }))
  ), [textProviders])
  const styleOptions = useMemo(() => {
    const preferencePresets = preferences?.style_presets
    const presets = Array.isArray(preferencePresets) && preferencePresets.length > 0
      ? preferencePresets
      : DEFAULT_STYLE_PRESETS

    return presets.map((preset) => ({
      value: preset.value,
      label: preset.label,
    }))
  }, [preferences?.style_presets])

  const imageProviderFallback = imageProviders.includes(providers.defaults.image)
    ? providers.defaults.image
    : (imageProviders[0] ?? providers.defaults.image)
  const textProviderFallback = textProviders.includes(providers.defaults.text)
    ? providers.defaults.text
    : (textProviders[0] ?? providers.defaults.text)
  const preferenceImageProvider = preferences?.fields?.image_provider
  const preferenceTextProvider = preferences?.fields?.text_provider
  const defaultImageProvider = resolveAvailablePreferenceValue(
    preferenceImageProvider,
    imageProviders,
    imageProviderFallback,
  )
  const defaultTextProvider = resolveAvailablePreferenceValue(
    preferenceTextProvider,
    textProviders,
    textProviderFallback,
  )
  const imageProviderPreference = (
    overrides.image_provider ?? preferenceImageProvider ?? { mode: 'auto' }
  ) as AutoPreference<AiProviderId>
  const textProviderPreference = (
    overrides.text_provider ?? preferenceTextProvider ?? { mode: 'auto' }
  ) as AutoPreference<AiProviderId>
  const resolvedImageProvider = resolveAvailablePreferenceValue(
    imageProviderPreference,
    imageProviders,
    defaultImageProvider,
  )
  const resolvedTextProvider = resolveAvailablePreferenceValue(
    textProviderPreference,
    textProviders,
    defaultTextProvider,
  )

  const preferenceStyle = preferences?.fields?.style
  const defaultStyle = resolvePreferenceValue(
    preferenceStyle,
    styleOptions[0]?.value ?? DEFAULT_SELECTED_STYLE,
  )
  const stylePreference = (overrides.style ?? preferenceStyle ?? { mode: 'auto' }) as AutoPreference<string>
  const resolvedStyle = resolvePreferenceValue(stylePreference, defaultStyle)
  const preferenceColorMode = preferences?.fields?.color_mode
  const defaultColorMode = resolvePreferenceValue(preferenceColorMode, DEFAULT_COLOR_MODE)
  const colorModePreference = (
    overrides.color_mode ?? preferenceColorMode ?? { mode: 'auto' }
  ) as AutoPreference<ColorMode>
  const resolvedColorMode = resolvePreferenceValue(colorModePreference, defaultColorMode)
  const preferenceAspectRatio = preferences?.fields?.aspect_ratio
  const defaultAspectRatio = resolvePreferenceValue(preferenceAspectRatio, DEFAULT_ASPECT_RATIO)
  const aspectRatioPreference = (
    overrides.aspect_ratio ?? preferenceAspectRatio ?? { mode: 'auto' }
  ) as AutoPreference<string>
  const resolvedAspectRatio = resolvePreferenceValue(aspectRatioPreference, defaultAspectRatio)
  const preferenceFontFamily = preferences?.fields?.font_family
  const defaultFontFamily = resolvePreferenceValue(preferenceFontFamily, DEFAULT_FONT_FAMILY)
  const fontFamilyPreference = (
    overrides.font_family ?? preferenceFontFamily ?? { mode: 'auto' }
  ) as AutoPreference<string>
  const resolvedFontFamily = resolvePreferenceValue(fontFamilyPreference, defaultFontFamily)
  const preferenceFontSize = preferences?.fields?.font_size
  const defaultFontSize = resolvePreferenceValue(preferenceFontSize, DEFAULT_FONT_SIZE)
  const fontSizePreference = (
    overrides.font_size ?? preferenceFontSize ?? { mode: 'auto' }
  ) as AutoPreference<string>
  const resolvedFontSize = resolvePreferenceValue(fontSizePreference, defaultFontSize)
  const preferenceBubbleShape = preferences?.fields?.bubble_shape
  const defaultBubbleShape = resolvePreferenceValue(preferenceBubbleShape, DEFAULT_BUBBLE_SHAPE)
  const bubbleShapePreference = (
    overrides.bubble_shape ?? preferenceBubbleShape ?? { mode: 'auto' }
  ) as AutoPreference<string>
  const resolvedBubbleShape = resolvePreferenceValue(bubbleShapePreference, defaultBubbleShape)
  const preferenceBubbleTail = preferences?.fields?.bubble_tail
  const defaultBubbleTail = resolvePreferenceValue(preferenceBubbleTail, true)
  const bubbleTailPreference = (
    overrides.bubble_tail ?? preferenceBubbleTail ?? { mode: 'auto' }
  ) as AutoPreference<boolean>
  const resolvedBubbleTail = resolvePreferenceValue(bubbleTailPreference, defaultBubbleTail)
  const renderOptions = useMemo(() => ({
    image_provider: resolvedImageProvider,
    text_provider: resolvedTextProvider,
    style_description: resolvedStyle,
    color_mode: resolvedColorMode,
    aspect_ratio: resolvedAspectRatio,
    font_family: resolvedFontFamily,
    font_size: resolvedFontSize,
    bubble_shape: resolvedBubbleShape,
    bubble_tail: resolvedBubbleTail,
  }), [
    resolvedAspectRatio,
    resolvedBubbleShape,
    resolvedBubbleTail,
    resolvedColorMode,
    resolvedFontFamily,
    resolvedFontSize,
    resolvedImageProvider,
    resolvedStyle,
    resolvedTextProvider,
  ])
  const applyImagePages = useCallback((pagesArr: PageImage[]) => {
    if (!Array.isArray(pagesArr) || pagesArr.length === 0) return

    const sortedPages = [...pagesArr].sort((a, b) => a.page_number - b.page_number)
    const newScenes = pagesToScenes(sortedPages)

    setPages(sortedPages)
    setScenes(newScenes)
    setSelectedScene((current) => (
      newScenes.some((scene) => scene.id === current) ? current : newScenes[0].id
    ))
  }, [])

  const fetchImagePages = useCallback(async (targetComicId: number) => {
    const imagesRes = await ComicsApi.listImages(targetComicId)

    return parseImagePages(imagesRes)
  }, [])

  const activeJobs = useAtomValue(activeJobsAtom)
  const lightweightActiveRenderJobForComic = useMemo(() => {
    if (comicId === null) return null

    return activeJobs.find((job) => (
      job.comic_id === comicId
      && Boolean(job.render_run_id)
      && !job.render_run
      && (isActiveRenderJobStatus(job.status) || isActiveRenderJobStatus(job.rq_status))
    )) ?? null
  }, [activeJobs, comicId])
  const activeJobRenderRunForComic = useMemo(() => {
    if (comicId === null) return null

    const renderRuns = activeJobs
      .map((job) => job.render_run)
      .filter((renderRun): renderRun is RenderRun => Boolean(renderRun && renderRun.comic_id === comicId))

    const activeJobRun = renderRuns.find((renderRun) => isActiveRenderRun(renderRun))
    if (activeJobRun) return activeJobRun

    const trackedRenderRunId = activeRenderRun?.comic_id === comicId ? activeRenderRun.id : null
    for (const job of activeJobs) {
      const renderRun = job.render_run
      if (!renderRun || renderRun.comic_id !== comicId) continue
      if (trackedRenderRunId === null || renderRun.id === trackedRenderRunId) return renderRun
    }

    return null
  }, [activeJobs, activeRenderRun?.comic_id, activeRenderRun?.id, comicId])
  const activeRenderRunForComic = activeJobRenderRunForComic
    ?? (comicId !== null && activeRenderRun?.comic_id === comicId ? activeRenderRun : null)
  const hasActiveRenderRun = isActiveRenderRun(activeRenderRunForComic) || Boolean(lightweightActiveRenderJobForComic)
  const canAbortActiveRenderRun = Boolean(
    (isActiveRenderRun(activeRenderRunForComic) && !activeRenderRunForComic?.abort_requested)
      || lightweightActiveRenderJobForComic,
  )
  const disableRenderRunActions = !comicId || isRendering || isStartingRenderRun || hasActiveRenderRun

  useEffect(() => {
    if (!activeJobRenderRunForComic) return
    setActiveRenderRun((current) => {
      if (
        current?.id === activeJobRenderRunForComic.id
        && current.status === activeJobRenderRunForComic.status
        && current.abort_requested === activeJobRenderRunForComic.abort_requested
      ) {
        return current
      }

      return activeJobRenderRunForComic
    })
  }, [activeJobRenderRunForComic, setActiveRenderRun])

  useEffect(() => {
    if (!comicId || !activeRenderRunForComic || activeRenderRunForComic.status !== 'completed') return
    if (refreshedRenderRunIdsRef.current.has(activeRenderRunForComic.id)) return

    refreshedRenderRunIdsRef.current.add(activeRenderRunForComic.id)
    let cancelled = false
    ;(async () => {
      try {
        const [pagesArr, detail] = await Promise.all([
          fetchImagePages(comicId),
          ComicsApi.get(comicId).catch(() => null),
        ])
        if (cancelled) return
        applyImagePages(pagesArr)
        if (detail) setComicDetail(detail)
      } catch (error) {
        console.warn('刷新后台渲染结果失败', error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    activeRenderRunForComic,
    applyImagePages,
    comicId,
    fetchImagePages,
    setComicDetail,
  ])

  useEffect(() => {
    if (providersLoading) return

    if (imageProvider !== resolvedImageProvider) {
      setImageProvider(resolvedImageProvider)
    }

    if (textProvider !== resolvedTextProvider) {
      setTextProvider(resolvedTextProvider)
    }
  }, [
    imageProvider,
    providersLoading,
    resolvedImageProvider,
    resolvedTextProvider,
    setImageProvider,
    setTextProvider,
    textProvider,
  ])

  useEffect(() => {
    if (style !== resolvedStyle) setStyle(resolvedStyle)
    if (aspectRatio !== resolvedAspectRatio) setAspectRatio(resolvedAspectRatio)
    if (fontFamily !== resolvedFontFamily) setFontFamily(resolvedFontFamily)
    if (fontSize !== resolvedFontSize) setFontSize(resolvedFontSize)
    if (bubbleShape !== resolvedBubbleShape) setBubbleShape(resolvedBubbleShape)
    if (hasTail !== resolvedBubbleTail) setHasTail(resolvedBubbleTail)
    if (colorMode !== resolvedColorMode) setColorMode(resolvedColorMode)
  }, [
    aspectRatio,
    bubbleShape,
    colorMode,
    fontFamily,
    fontSize,
    hasTail,
    resolvedAspectRatio,
    resolvedBubbleShape,
    resolvedBubbleTail,
    resolvedColorMode,
    resolvedFontFamily,
    resolvedFontSize,
    resolvedStyle,
    setAspectRatio,
    setStyle,
    style,
  ])
  const [, setActiveTab] = useAtom(activeTabAtom)
  const [, setStoryStep] = useAtom(storyStepAtom)

  const handleAddScene = () => {
    // 回到故事流程继续编辑；保持当前 comicId 不变
    setActiveTab('story')
    setStoryStep('input')
    toast.success(String(t('image.backToStory')))
  }

  // 进入生图页时，如已有 comicId，则预载该漫画的已生成页面，供左侧缩略图展示
  // 这样即使重新走流程，左侧依然能看到上一流程的漫画内容
  useEffect(() => {
    if (!comicId) return
    let cancelled = false
    ;(async () => {
      try {
        const pagesArr = await fetchImagePages(comicId)
        if (cancelled) return
        applyImagePages(pagesArr)
      } catch {
        // 忽略加载失败，不阻断页面
      }
    })()

    return () => {
      cancelled = true
    }
  }, [applyImagePages, comicId, fetchImagePages])

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
      toast.error(String(t('image.error.needPanels')))

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
        message: String(t('image.run.submitting', { mode: String(t('image.mode.firstPage')) })),
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
      await PanelsApi.renderPage(comicId, targetPageNumber, renderOptions)
      updateRenderProgress({
        status: 'rendering',
        message: String(t('image.generatingMessage')),
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
            message: String(t('image.generatingMessage')),
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

            toast.success(String(t('image.success.completed')))
            updateRenderProgress({
              status: 'completed',
              message: String(t('image.success.completed')),
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
              const translatedFailure = failureMessage === 'image.error.renderFailed'
                ? String(t('image.error.renderFailed'))
                : failureMessage
              const message = String(t('image.run.failedWithError', {
                mode: String(t('image.mode.firstPage')),
                message: translatedFailure,
              }))
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
              const message = String(t('image.error.timeout'))
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
            message: String(t('image.generatingMessage')),
            pollTries: triesRef.current,
          })
          if (triesRef.current >= MAX_POLL_TRIES) {
            const message = String(t('image.error.pollFailed'))
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
      const message = err?.message || String(t('image.error.createFailed'))
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

  const handleStartRenderRun = async (mode: RenderRunMode) => {
    if (!comicId) {
      toast.error(String(t('image.error.needPanels')))

      return
    }

    try {
      setIsStartingRenderRun(true)
      clearPoll()
      setIsRendering(false)
      setPollTries(0)
      renderTargetRef.current = null
      renderStartedAtRef.current = Date.now()
      updateRenderProgress({
        status: 'submitting',
        message: String(t('image.run.submitting', {
          mode: String(t(RENDER_RUN_MODE_LABELS[mode])),
        })),
        elapsedMs: 0,
        pollTries: 0,
        error: null,
      })

      const response = await PanelsApi.startRenderRun(comicId, {
        mode,
        ...renderOptions,
      })
      const renderRun = response.render_run
      setActiveRenderRun(renderRun)
      setActiveJobs((current) => {
        const nextById = new Map(current.map((job) => [job.job_id, job]))
        const job = createActiveRenderJob(renderRun, response.comic?.title, String(t('image.run.title')))
        nextById.set(job.job_id, {
          ...nextById.get(job.job_id),
          ...job,
        })

        return [...nextById.values()]
      })

      if (response.comic) {
        setComicDetail(response.comic)
      }

      updateRenderProgress({
        status: renderRunProgressStatus(renderRun),
        message: renderRunStatusMessage(renderRun, t),
        pollTries: 0,
        error: renderRun.status === 'failed' ? renderRun.error_message : null,
      })
    } catch (err: any) {
      const message = err?.message || String(t('image.error.createFailed'))
      updateRenderProgress({
        status: 'failed',
        message,
        error: message,
      })
      toast.error(message)
    } finally {
      setIsStartingRenderRun(false)
    }
  }

  const handleAbortRenderRun = async () => {
    const fullRenderRunAbortId = activeRenderRunForComic
      && isActiveRenderRun(activeRenderRunForComic)
      && !activeRenderRunForComic.abort_requested
      ? activeRenderRunForComic.id
      : null
    const renderRunId = fullRenderRunAbortId ?? lightweightActiveRenderJobForComic?.render_run_id
    if (!renderRunId || !canAbortActiveRenderRun) return

    try {
      setIsAbortingRenderRun(true)
      const response = await PanelsApi.abortRenderRun(renderRunId)
      const renderRun = response.render_run
      setActiveRenderRun(renderRun)
      setActiveJobs((current) => {
        const job = createActiveRenderJob(renderRun, undefined, String(t('image.run.title')))
        const existingJob = current.find((activeJob) => (
          activeJob.render_run_id === renderRun.id || activeJob.render_run?.id === renderRun.id
        ))
        const jobId = existingJob?.job_id ?? job.job_id
        const nextById = new Map(current.map((activeJob) => [activeJob.job_id, activeJob]))
        nextById.set(jobId, {
          ...existingJob,
          ...job,
          job_id: jobId,
          title: existingJob?.title ?? job.title,
        })

        return [...nextById.values()]
      })
      clearPoll()
      setIsRendering(false)
      setPollTries(0)
      renderTargetRef.current = null
      renderStartedAtRef.current = null
      updateRenderProgress({
        status: renderRunProgressStatus(renderRun),
        message: renderRunStatusMessage(renderRun, t),
        elapsedMs: 0,
        pollTries: 0,
        error: renderRun.status === 'failed' ? renderRun.error_message : null,
      })
    } catch (err: any) {
      const message = err?.message || String(t('image.error.abortFailed'))
      toast.error(message)
    } finally {
      setIsAbortingRenderRun(false)
    }
  }

  const handleImageProviderPreferenceChange = (nextPreference: AutoPreference<AiProviderId>) => {
    setOverrides((prev) => ({
      ...prev,
      image_provider: nextPreference,
    }))
    setImageProvider(resolveAvailablePreferenceValue(nextPreference, imageProviders, defaultImageProvider))
  }

  const handleTextProviderPreferenceChange = (nextPreference: AutoPreference<AiProviderId>) => {
    setOverrides((prev) => ({
      ...prev,
      text_provider: nextPreference,
    }))
    setTextProvider(resolveAvailablePreferenceValue(nextPreference, textProviders, defaultTextProvider))
  }

  const handleStylePreferenceChange = (nextPreference: AutoPreference<string>) => {
    setOverrides((prev) => ({
      ...prev,
      style: nextPreference,
    }))
    setStyle(resolvePreferenceValue(nextPreference, defaultStyle))
  }

  const handleColorModePreferenceChange = (nextPreference: AutoPreference<ColorMode>) => {
    setOverrides((prev) => ({
      ...prev,
      color_mode: nextPreference,
    }))
    setColorMode(resolvePreferenceValue(nextPreference, defaultColorMode))
  }

  const handleAspectRatioPreferenceChange = (nextPreference: AutoPreference<string>) => {
    setOverrides((prev) => ({
      ...prev,
      aspect_ratio: nextPreference,
    }))
    setAspectRatio(resolvePreferenceValue(nextPreference, defaultAspectRatio))
  }

  const handleFontFamilyPreferenceChange = (nextPreference: AutoPreference<string>) => {
    setOverrides((prev) => ({
      ...prev,
      font_family: nextPreference,
    }))
    setFontFamily(resolvePreferenceValue(nextPreference, defaultFontFamily))
  }

  const handleFontSizePreferenceChange = (nextPreference: AutoPreference<string>) => {
    setOverrides((prev) => ({
      ...prev,
      font_size: nextPreference,
    }))
    setFontSize(resolvePreferenceValue(nextPreference, defaultFontSize))
  }

  const handleBubbleShapePreferenceChange = (nextPreference: AutoPreference<string>) => {
    setOverrides((prev) => ({
      ...prev,
      bubble_shape: nextPreference,
    }))
    setBubbleShape(resolvePreferenceValue(nextPreference, defaultBubbleShape))
  }

  const handleBubbleTailPreferenceChange = (nextPreference: AutoPreference<boolean>) => {
    setOverrides((prev) => ({
      ...prev,
      bubble_tail: nextPreference,
    }))
    setHasTail(resolvePreferenceValue(nextPreference, defaultBubbleTail))
  }

  const selectedImageUrl = useMemo(
    () => proxiedStatic(pages.find((p) => p.page_number === selectedScene)?.image_url),
    [pages, selectedScene],
  )
  const renderProgressHelperText = renderRunHelperText(activeRenderRunForComic, t)

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
          <GenerationStatusPanel progress={renderProgress} helperText={renderProgressHelperText} />
          <WorkflowActionBar>
            <Button size="lg" onClick={handleGenerate} disabled={isRendering || isStartingRenderRun || hasActiveRenderRun || !comicId}>
              {isRendering
                ? String(t('image.rendering', { current: pollTries, max: MAX_POLL_TRIES }))
                : String(t('image.generate'))}
            </Button>
            {RENDER_RUN_ACTIONS.map((action) => (
              <Button
                key={action.mode}
                size="lg"
                variant="outline"
                onClick={() => void handleStartRenderRun(action.mode)}
                disabled={disableRenderRunActions}
              >
                {String(t(action.labelKey))}
              </Button>
            ))}
            {canAbortActiveRenderRun && (
              <Button
                size="lg"
                variant="destructive"
                onClick={() => void handleAbortRenderRun()}
                disabled={isAbortingRenderRun}
              >
                {String(t('image.abort'))}
              </Button>
            )}
          </WorkflowActionBar>
          <StoryboardCanvas
            imageUrl={selectedImageUrl}
          />
        </section>
        <PropertyPanel
          imageProviderPreference={imageProviderPreference}
          onImageProviderPreferenceChange={handleImageProviderPreferenceChange}
          imageProviderOptions={imageProviderOptions}
          textProviderPreference={textProviderPreference}
          onTextProviderPreferenceChange={handleTextProviderPreferenceChange}
          textProviderOptions={textProviderOptions}
          stylePreference={stylePreference}
          onStylePreferenceChange={handleStylePreferenceChange}
          styleOptions={styleOptions}
          colorModePreference={colorModePreference}
          onColorModePreferenceChange={handleColorModePreferenceChange}
          aspectRatioPreference={aspectRatioPreference}
          onAspectRatioPreferenceChange={handleAspectRatioPreferenceChange}
          fontFamilyPreference={fontFamilyPreference}
          onFontFamilyPreferenceChange={handleFontFamilyPreferenceChange}
          fontSizePreference={fontSizePreference}
          onFontSizePreferenceChange={handleFontSizePreferenceChange}
          bubbleShapePreference={bubbleShapePreference}
          onBubbleShapePreferenceChange={handleBubbleShapePreferenceChange}
          bubbleTailPreference={bubbleTailPreference}
          onBubbleTailPreferenceChange={handleBubbleTailPreferenceChange}
          onOpenPublish={() => setPublishOpen(true)}
          onExportImage={() => {
            const p = pages.find((x) => x.page_number === selectedScene)
            const url = proxiedStatic(p?.image_url)
            if (!url) {
              toast.error(String(t('image.error.currentPageNoImage')))

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
            <DialogTitle>{String(t('image.publish.title'))}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between gap-4 py-2">
            <div>
              <p className="text-sm font-medium">{String(t('image.publish.publicTitle'))}</p>
              <p className="text-xs text-muted-foreground">{String(t('image.publish.publicDescription'))}</p>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="make-public" className="text-sm">{String(t('image.publish.publicLabel'))}</Label>
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
                  toast.success(String(t('image.publish.success')))
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
                        toast.success(String(t('image.publish.pdfReady')))
                        // 更新详情
                        try { setComicDetail(d) } catch {}
                      } else if (pdfTriesRef.current >= MAX_PDF_POLL_TRIES) {
                        clearPdfPoll()
                        setIsPublishing(false)
                        toast.error(String(t('image.publish.pdfTimeout')))
                      }
                    } catch (e) {
                      console.warn('轮询 PDF 失败', e)
                      pdfTriesRef.current += 1
                      if (pdfTriesRef.current >= MAX_PDF_POLL_TRIES) {
                        clearPdfPoll()
                        setIsPublishing(false)
                        toast.error(String(t('image.publish.pdfPollFailed')))
                      }
                    }
                  }, 2000)
                } catch (e: any) {
                  toast.error(e?.message || String(t('image.error.publishFailed')))
                  setIsPublishing(false)
                }
              }}
              disabled={isPublishing}
            >
              {isPublishing ? String(t('image.publish.publishing')) : String(t('image.publish.confirm'))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ComicsWorkflowShell>
  )
}

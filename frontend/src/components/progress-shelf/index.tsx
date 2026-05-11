import { useSetAtom } from 'jotai'
import { ChevronUp, Layers3 } from 'lucide-react'
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router'

import PanelsApi from '@/apis/panels'
import { type ActiveJobEntry, activeJobsAtom, type ActiveJobStage } from '@/atoms'
import { Button } from '@/components/ui/button'
import useActiveJobs, { mapStageToComicsTab } from '@/hooks/use-active-jobs'
import { useI18n } from '@/hooks/use-i18n'
import {
  activeTabAtom,
  aspectRatioAtom,
  charactersCompletedAtom,
  currentComicDetailAtom,
  currentComicIdAtom,
  currentComicOverridesAtom,
  fullStoryAtom,
  mangaTitleAtom,
  selectedCharacterIdsAtom,
  selectedCharacterRolesAtom,
  storyCompletedAtom,
  styleAtom,
  workflowModeAtom,
} from '@/pages/comics/atoms'
import { getComicWorkflowHydration } from '@/pages/comics/lib/workflow-hydration'

import { ProgressRow } from './progress-row'

const STAGE_ORDER = ['outline', 'shots', 'render', 'cover', 'export', 'publish']
const STORAGE_KEY = 'progress-shelf-position'
const ORB_SIZE = 56
const HALF_ORB = ORB_SIZE / 2
const PANEL_WIDTH = 360
const PANEL_GAP = 12
const VIEWPORT_MARGIN = 12

type ShelfEdge = 'left' | 'right' | 'top' | 'bottom'

interface ShelfPosition {
  x: number
  y: number
  edge: ShelfEdge
}

interface ViewportSize {
  width: number
  height: number
}

function viewportSize(): ViewportSize {
  if (typeof window === 'undefined') {
    return { width: 1024, height: 768 }
  }

  return {
    width: window.innerWidth || 1024,
    height: window.innerHeight || 768,
  }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min

  return Math.min(Math.max(value, min), max)
}

function safeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function snapPosition(position: ShelfPosition, viewport = viewportSize()): ShelfPosition {
  const centerX = position.x + HALF_ORB
  const centerY = position.y + HALF_ORB
  const edgeDistances: Record<ShelfEdge, number> = {
    left: centerX,
    right: viewport.width - centerX,
    top: centerY,
    bottom: viewport.height - centerY,
  }
  const edge = (Object.entries(edgeDistances) as [ShelfEdge, number][])
    .sort((left, right) => left[1] - right[1])[0]?.[0] ?? 'right'

  if (edge === 'left') {
    return {
      edge,
      x: -HALF_ORB,
      y: clamp(position.y, VIEWPORT_MARGIN, viewport.height - ORB_SIZE - VIEWPORT_MARGIN),
    }
  }

  if (edge === 'right') {
    return {
      edge,
      x: viewport.width - HALF_ORB,
      y: clamp(position.y, VIEWPORT_MARGIN, viewport.height - ORB_SIZE - VIEWPORT_MARGIN),
    }
  }

  if (edge === 'top') {
    return {
      edge,
      x: clamp(position.x, VIEWPORT_MARGIN, viewport.width - ORB_SIZE - VIEWPORT_MARGIN),
      y: -HALF_ORB,
    }
  }

  return {
    edge,
    x: clamp(position.x, VIEWPORT_MARGIN, viewport.width - ORB_SIZE - VIEWPORT_MARGIN),
    y: viewport.height - HALF_ORB,
  }
}

function defaultShelfPosition(): ShelfPosition {
  const viewport = viewportSize()

  return {
    edge: 'right',
    x: viewport.width - HALF_ORB,
    y: clamp(viewport.height - ORB_SIZE - 32, VIEWPORT_MARGIN, viewport.height - ORB_SIZE - VIEWPORT_MARGIN),
  }
}

function readStoredPosition(): ShelfPosition {
  if (typeof window === 'undefined') return defaultShelfPosition()

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultShelfPosition()

    const parsed = JSON.parse(raw) as Partial<ShelfPosition>
    if (
      safeNumber(parsed.x)
      && safeNumber(parsed.y)
      && ['left', 'right', 'top', 'bottom'].includes(String(parsed.edge))
    ) {
      return snapPosition(parsed as ShelfPosition)
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
  }

  return defaultShelfPosition()
}

function persistPosition(position: ShelfPosition) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(position))
}

function panelPosition(position: ShelfPosition) {
  const viewport = viewportSize()
  const width = Math.min(PANEL_WIDTH, Math.max(ORB_SIZE, viewport.width - (VIEWPORT_MARGIN * 2)))
  const maxHeight = Math.min(520, Math.max(ORB_SIZE, viewport.height - (VIEWPORT_MARGIN * 2)))
  const centerX = position.x + HALF_ORB
  const centerY = position.y + HALF_ORB
  let left = centerX - (width / 2)
  let top = centerY - (maxHeight / 2)

  if (position.edge === 'left') {
    left = position.x + ORB_SIZE + PANEL_GAP
  } else if (position.edge === 'right') {
    left = position.x - width - PANEL_GAP
  } else if (position.edge === 'top') {
    top = position.y + ORB_SIZE + PANEL_GAP
  } else {
    top = position.y - maxHeight - PANEL_GAP
  }

  return {
    left: `${clamp(left, VIEWPORT_MARGIN, viewport.width - width - VIEWPORT_MARGIN)}px`,
    top: `${clamp(top, VIEWPORT_MARGIN, viewport.height - maxHeight - VIEWPORT_MARGIN)}px`,
    width: `${width}px`,
    maxHeight: `${maxHeight}px`,
  }
}

function rankStage(stage: string): number {
  const index = STAGE_ORDER.indexOf(stage)

  return index === -1 ? STAGE_ORDER.length : index
}

function mergeWorkflowStages(jobs: ActiveJobEntry[]): ActiveJobStage[] | undefined {
  const map = new Map<string, ActiveJobStage>()
  for (const job of jobs) {
    for (const stage of job.workflow_stages ?? []) {
      map.set(stage.stage, stage)
    }
  }

  if (map.size === 0) return undefined

  return [...map.values()].sort((left, right) => rankStage(left.stage) - rankStage(right.stage))
}

function isAutoRunJob(job: ActiveJobEntry): boolean {
  return job.kind === 'auto_run' || Boolean(job.auto_run_id || job.auto_run)
}

function groupJobs(jobs: ActiveJobEntry[]): ActiveJobEntry[] {
  const grouped = new Map<string, ActiveJobEntry[]>()

  for (const job of jobs) {
    const key = isAutoRunJob(job)
      ? `auto-run:${job.auto_run?.id ?? job.auto_run_id ?? job.job_id}`
      : job.render_run_id || job.render_run
      ? `render-run:${job.render_run?.id ?? job.render_run_id ?? job.job_id}`
      : job.comic_id ? `comic:${job.comic_id}` : `job:${job.job_id}`
    const bucket = grouped.get(key) ?? []
    bucket.push(job)
    grouped.set(key, bucket)
  }

  return [...grouped.values()].map((bucket) => {
    const sorted = [...bucket].sort((left, right) => rankStage(right.stage) - rankStage(left.stage))
    const primary = sorted[0]!
    const workflow_stages = mergeWorkflowStages(bucket)
    const comic = bucket.find((job) => job.comic)?.comic ?? primary.comic ?? null

    return {
      ...primary,
      title: comic?.title ?? primary.title,
      comic,
      workflow_stages,
    }
  })
}

export function ProgressShelf() {
  const { t } = useI18n('progressShelf')
  const navigate = useNavigate()
  const setAspectRatio = useSetAtom(aspectRatioAtom)
  const setCharactersCompleted = useSetAtom(charactersCompletedAtom)
  const setComicId = useSetAtom(currentComicIdAtom)
  const setComicDetail = useSetAtom(currentComicDetailAtom)
  const setFullStory = useSetAtom(fullStoryAtom)
  const setMangaTitle = useSetAtom(mangaTitleAtom)
  const setOverrides = useSetAtom(currentComicOverridesAtom)
  const setSelectedCharacterIds = useSetAtom(selectedCharacterIdsAtom)
  const setSelectedCharacterRoles = useSetAtom(selectedCharacterRolesAtom)
  const setActiveTab = useSetAtom(activeTabAtom)
  const setActiveJobs = useSetAtom(activeJobsAtom)
  const setStoryCompleted = useSetAtom(storyCompletedAtom)
  const setStyle = useSetAtom(styleAtom)
  const setWorkflowMode = useSetAtom(workflowModeAtom)
  const { jobs } = useActiveJobs()
  const [expanded, setExpanded] = useState(false)
  const [abortingJobIds, setAbortingJobIds] = useState<Set<string>>(() => new Set())
  const [position, setPosition] = useState<ShelfPosition>(() => readStoredPosition())
  const positionRef = useRef(position)
  const dragStateRef = useRef<{
    pointerId: number
    offsetX: number
    offsetY: number
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)

  const groupedJobs = useMemo(() => groupJobs(jobs), [jobs])
  const panelStyle = useMemo(() => panelPosition(position), [position])

  useEffect(() => {
    positionRef.current = position
  }, [position])

  useEffect(() => {
    const handleResize = () => {
      setPosition((current) => {
        const next = snapPosition(current)
        persistPosition(next)

        return next
      })
    }

    window.addEventListener('resize', handleResize)

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const dragState = dragStateRef.current
      if (!dragState || event.pointerId !== dragState.pointerId) return

      const viewport = viewportSize()
      const next = {
        edge: position.edge,
        x: clamp(event.clientX - dragState.offsetX, -HALF_ORB, viewport.width - HALF_ORB),
        y: clamp(event.clientY - dragState.offsetY, -HALF_ORB, viewport.height - HALF_ORB),
      }

      if (Math.abs(next.x - position.x) > 3 || Math.abs(next.y - position.y) > 3) {
        dragState.moved = true
      }

      positionRef.current = next
      setPosition(next)
    }

    const handlePointerUp = (event: globalThis.PointerEvent) => {
      const dragState = dragStateRef.current
      if (!dragState || event.pointerId !== dragState.pointerId) return

      const next = snapPosition(positionRef.current)
      suppressClickRef.current = dragState.moved
      dragStateRef.current = null
      positionRef.current = next
      setPosition(next)
      persistPosition(next)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [position])

  useEffect(() => {
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== -1) return

      const viewport = viewportSize()
      const next = {
        edge: position.edge,
        x: clamp(event.clientX - dragState.offsetX, -HALF_ORB, viewport.width - HALF_ORB),
        y: clamp(event.clientY - dragState.offsetY, -HALF_ORB, viewport.height - HALF_ORB),
      }

      if (Math.abs(next.x - position.x) > 3 || Math.abs(next.y - position.y) > 3) {
        dragState.moved = true
      }

      positionRef.current = next
      setPosition(next)
    }

    const handleMouseUp = () => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== -1) return

      const next = snapPosition(positionRef.current)
      suppressClickRef.current = dragState.moved
      dragStateRef.current = null
      positionRef.current = next
      setPosition(next)
      persistPosition(next)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [position])

  const beginDrag = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    positionRef.current = position
    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - position.x,
      offsetY: event.clientY - position.y,
      moved: false,
    }
  }, [position.x, position.y])

  const beginMouseDrag = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return

    positionRef.current = position
    dragStateRef.current = {
      pointerId: -1,
      offsetX: event.clientX - position.x,
      offsetY: event.clientY - position.y,
      moved: false,
    }
  }, [position])

  const toggleExpanded = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false

      return
    }

    setExpanded((current) => !current)
  }, [])

  const handleOpen = (job: ActiveJobEntry) => {
    if (job.character_id || job.kind === 'character_image' || job.kind === 'character_optimization') {
      navigate('/create-character')

      return
    }

    const comicId = job.comic_id ?? job.auto_run?.comic_id ?? null
    if (comicId) {
      setComicId(comicId)
    }

    if (job.comic) {
      const hydration = getComicWorkflowHydration(job.comic)
      setComicDetail(job.comic)
      setMangaTitle(hydration.title)
      setFullStory(hydration.story)
      if (hydration.style) setStyle(hydration.style)
      if (hydration.aspectRatio) setAspectRatio(hydration.aspectRatio)
      setOverrides(hydration.overrides)
      setStoryCompleted(true)
      setCharactersCompleted(hydration.characterIds.length > 0)
      setSelectedCharacterIds(hydration.characterIds)
      setSelectedCharacterRoles(hydration.characterRoles)
    }

    if (isAutoRunJob(job)) {
      setWorkflowMode('auto')
      navigate('/comics')

      return
    }

    setWorkflowMode('pro')
    setActiveTab(mapStageToComicsTab(job.stage))
    navigate('/comics')
  }

  const handleAbort = async (job: ActiveJobEntry) => {
    const renderRunId = job.render_run?.id ?? job.render_run_id
    if (!renderRunId) return

    setAbortingJobIds((current) => new Set(current).add(job.job_id))

    try {
      const response = await PanelsApi.abortRenderRun(renderRunId)
      setActiveJobs((current) => {
        const nextById = new Map(current.map((activeJob) => [activeJob.job_id, activeJob]))
        nextById.set(job.job_id, {
          ...nextById.get(job.job_id),
          ...job,
          status: response.render_run.status,
          rq_status: response.render_run.status,
          render_run: response.render_run,
          render_progress: {
            completed: response.render_run.completed_pages.length,
            total: response.render_run.requested_pages.length,
          },
        })

        return [...nextById.values()]
      })
    } catch (error: any) {
      toast.error(error?.message || String(t('error.abortFailed')))
    } finally {
      setAbortingJobIds((current) => {
        const next = new Set(current)
        next.delete(job.job_id)

        return next
      })
    }
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {expanded ? (
        <div
          className="pointer-events-auto fixed overflow-y-auto rounded-3xl border border-white/10 bg-slate-950/95 p-4 shadow-2xl shadow-slate-950/50 backdrop-blur-xl"
          style={panelStyle}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{String(t('title.activeJobs'))}</p>
              <h3 className="truncate text-lg font-semibold text-white">
                {jobs.length > 0
                  ? String(t('title.activeNow', { count: jobs.length }))
                  : String(t('title.noActiveJobs'))}
              </h3>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10"
              onClick={() => setExpanded(false)}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
          </div>

          {groupedJobs.length > 0 ? (
            <div className="space-y-3">
              {groupedJobs.map((job) => (
                <ProgressRow
                  key={`${job.comic_id ?? job.character_id ?? 'job'}:${job.job_id}`}
                  job={job}
                  onOpen={handleOpen}
                  onAbort={(targetJob) => void handleAbort(targetJob)}
                  isAborting={abortingJobIds.has(job.job_id)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              {String(t('empty.description'))}
            </div>
          )}
        </div>
      ) : null}

      <button
        type="button"
        data-testid="progress-shelf-orb"
        aria-label={String(t(
          expanded ? 'toggle.close' : jobs.length > 0 ? 'toggle.active' : 'toggle.idle',
          { count: jobs.length },
        ))}
        title={String(t(expanded ? 'toggle.close' : 'toggle.open'))}
        onPointerDown={beginDrag}
        onMouseDown={beginMouseDrag}
        onClick={toggleExpanded}
        className="pointer-events-auto fixed inline-flex h-14 w-14 touch-none select-none items-center justify-center rounded-full border border-white/10 bg-slate-950/95 text-white shadow-xl shadow-slate-950/40 backdrop-blur-xl transition hover:border-sky-400/40"
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
      >
        <Layers3 className="h-5 w-5 text-sky-200" />
        {jobs.length > 0 ? (
          <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-400 px-1 text-[11px] font-semibold leading-none text-slate-950">
            {jobs.length > 99 ? '99+' : jobs.length}
          </span>
        ) : null}
        <span className="sr-only">
          {jobs.length > 0
            ? String(t('toggle.active', { count: jobs.length }))
            : String(t('toggle.idle'))}
        </span>
      </button>
    </div>
  )
}

export default ProgressShelf

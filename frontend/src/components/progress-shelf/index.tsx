import { useSetAtom } from 'jotai'
import { ChevronUp, Layers3 } from 'lucide-react'
import { useMemo, useState } from 'react'
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

function groupJobs(jobs: ActiveJobEntry[]): ActiveJobEntry[] {
  const grouped = new Map<string, ActiveJobEntry[]>()

  for (const job of jobs) {
    const key = job.render_run_id || job.render_run
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

  const groupedJobs = useMemo(() => groupJobs(jobs), [jobs])

  const handleOpen = (job: ActiveJobEntry) => {
    if (job.character_id || job.kind === 'character_image' || job.kind === 'character_optimization') {
      navigate('/create-character')

      return
    }

    if (job.comic_id) {
      setComicId(job.comic_id)
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
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {expanded ? (
        <div className="pointer-events-auto w-[360px] max-w-full rounded-[28px] border border-white/10 bg-slate-950/95 p-4 shadow-2xl shadow-slate-950/50 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{String(t('title.activeJobs'))}</p>
              <h3 className="text-lg font-semibold text-white">
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
        title={String(t(expanded ? 'toggle.close' : 'toggle.open'))}
        onClick={() => setExpanded((current) => !current)}
        className="pointer-events-auto inline-flex items-center gap-3 rounded-full border border-white/10 bg-slate-950/95 px-4 py-3 text-left text-white shadow-xl shadow-slate-950/40 backdrop-blur-xl transition hover:border-sky-400/40"
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/15 text-sky-200">
          <Layers3 className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-sm font-semibold">
            {jobs.length > 0
              ? String(t('toggle.active', { count: jobs.length }))
              : String(t('toggle.idle'))}
          </span>
          <span className="block text-xs text-slate-300">
            {jobs.length > 0 ? String(t('toggle.activeHint')) : String(t('toggle.idleHint'))}
          </span>
        </span>
      </button>
    </div>
  )
}

export default ProgressShelf

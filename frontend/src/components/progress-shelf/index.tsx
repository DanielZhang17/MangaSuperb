import { useSetAtom } from 'jotai'
import { ChevronUp, Layers3 } from 'lucide-react'
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router'

import PanelsApi from '@/apis/panels'
import { type ActiveJobEntry, activeJobsAtom, type ActiveJobStage } from '@/atoms'
import { Button } from '@/components/ui/button'
import useActiveJobs, { mapStageToComicsTab } from '@/hooks/use-active-jobs'
import { activeTabAtom, currentComicDetailAtom, currentComicIdAtom } from '@/pages/comics/atoms'

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
  const navigate = useNavigate()
  const setComicId = useSetAtom(currentComicIdAtom)
  const setComicDetail = useSetAtom(currentComicDetailAtom)
  const setActiveTab = useSetAtom(activeTabAtom)
  const setActiveJobs = useSetAtom(activeJobsAtom)
  const { jobs } = useActiveJobs()
  const [expanded, setExpanded] = useState(false)
  const [abortingJobIds, setAbortingJobIds] = useState<Set<string>>(() => new Set())

  const groupedJobs = useMemo(() => groupJobs(jobs), [jobs])

  if (groupedJobs.length === 0) return null

  const handleOpen = (job: ActiveJobEntry) => {
    if (job.comic_id) {
      setComicId(job.comic_id)
    }

    if (job.comic) {
      setComicDetail(job.comic)
    }

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
      toast.error(error?.message || 'Render run abort failed')
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
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Active jobs</p>
              <h3 className="text-lg font-semibold text-white">
                {jobs.length} active now
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

          <div className="space-y-3">
            {groupedJobs.map((job) => (
              <ProgressRow
                key={`${job.comic_id ?? 'job'}:${job.job_id}`}
                job={job}
                onOpen={handleOpen}
                onAbort={(targetJob) => void handleAbort(targetJob)}
                isAborting={abortingJobIds.has(job.job_id)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="pointer-events-auto inline-flex items-center gap-3 rounded-full border border-white/10 bg-slate-950/95 px-4 py-3 text-left text-white shadow-xl shadow-slate-950/40 backdrop-blur-xl transition hover:border-sky-400/40"
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/15 text-sky-200">
          <Layers3 className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-sm font-semibold">
            {jobs.length} job{jobs.length === 1 ? '' : 's'} active
          </span>
          <span className="block text-xs text-slate-300">
            Tap to reopen your active workflow
          </span>
        </span>
      </button>
    </div>
  )
}

export default ProgressShelf

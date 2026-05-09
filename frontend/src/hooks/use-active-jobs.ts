import { useAtomValue } from 'jotai'
import { useEffect, useRef, useState } from 'react'

import { ComicsApi } from '@/apis/comics'
import { type ActiveJob as ApiActiveJob, type JobDetail, JobsApi } from '@/apis/jobs'
import {
  type ActiveJobEntry,
  type ActiveJobRenderProgress,
  activeJobsAtom,
  type ActiveJobStage,
  clearActiveJobs,
  mergeActiveJobs,
  removeActiveJob,
  replaceActiveJobs,
} from '@/atoms'
import type { IComic, RenderRun } from '@/service/types'

const VISIBLE_POLL_MS = 2000
const HIDDEN_POLL_MS = 10000
const COMIC_REFRESH_MS = 5000
const REMOVAL_DELAY_MS = 5000
const MAX_BACKOFF_MS = 60000
const TERMINAL_JOB_STATUSES = new Set(['finished', 'completed', 'failed', 'aborted'])

interface ComicCacheEntry {
  comic: IComic
  fetchedAt: number
}

function normalizeActiveJob(job: ApiActiveJob): ActiveJobEntry {
  return {
    job_id: job.job_id,
    render_run_id: job.render_run_id ?? null,
    comic_id: job.comic_id ?? null,
    stage: job.stage,
    status: job.status,
    title: job.title ?? null,
    started_at: job.started_at ?? null,
    reconnecting: false,
    warning: null,
    render_progress: job.render_progress ?? null,
    render_run: null,
  }
}

function countRenderRunProgress(renderRun: RenderRun | null | undefined): ActiveJobRenderProgress | null {
  if (!renderRun) return null

  const completedPages = Array.isArray(renderRun.completed_pages) ? renderRun.completed_pages : []
  const requestedPages = Array.isArray(renderRun.requested_pages) ? renderRun.requested_pages : []

  if (completedPages.length === 0 && requestedPages.length === 0) return null

  return {
    completed: completedPages.length,
    total: requestedPages.length,
  }
}

function countRenderProgress(comic: IComic | null | undefined): ActiveJobRenderProgress | null {
  if (!comic) return null

  const totalPages = new Set<number>()
  const pages = Array.isArray(comic.pages) ? comic.pages : []
  const layouts = Array.isArray(comic.page_layouts) ? comic.page_layouts : []
  const shots = Array.isArray(comic.panel_shots) ? comic.panel_shots : []

  for (const page of layouts) {
    const pageNumber = Number(page?.page_number)
    if (Number.isFinite(pageNumber) && pageNumber > 0) totalPages.add(pageNumber)
  }

  for (const shot of shots) {
    const pageNumber = Number(shot?.page_number)
    if (Number.isFinite(pageNumber) && pageNumber > 0) totalPages.add(pageNumber)
  }

  const completed = pages.filter((page) => Boolean(page?.image_url)).length

  return {
    completed,
    total: totalPages.size,
  }
}

function extractWorkflowStages(comic: IComic | null | undefined): ActiveJobStage[] | undefined {
  if (!comic || !Array.isArray(comic.workflow_stages)) return undefined

  return comic.workflow_stages.map((stage) => ({
    stage: String(stage?.stage ?? ''),
    status: String(stage?.status ?? ''),
    job_id: typeof stage?.job_id === 'string' ? stage.job_id : null,
    completed_at: typeof stage?.completed_at === 'string' ? stage.completed_at : null,
    error_message: typeof stage?.error_message === 'string' ? stage.error_message : null,
  }))
}

function enrichJob(job: ActiveJobEntry, detail?: JobDetail, comic?: IComic): ActiveJobEntry {
  const resolvedComic = comic ?? ((detail?.comic as IComic | undefined) ?? job.comic ?? null)
  const renderRun = detail?.render_run ?? job.render_run ?? null
  const renderRunId = renderRun?.id ?? job.render_run_id ?? null
  const renderRunProgress = countRenderRunProgress(renderRun)
  const isRenderRunJob = Boolean(renderRunId)
  const workflowStages = extractWorkflowStages(resolvedComic) ?? job.workflow_stages
  const currentStage = workflowStages?.find((stage) => stage.stage === job.stage)
  const comicRenderProgress = countRenderProgress(resolvedComic)

  return {
    ...job,
    render_run_id: renderRunId,
    render_run: renderRun,
    comic: resolvedComic,
    comic_id: renderRun?.comic_id ?? resolvedComic?.id ?? job.comic_id,
    title: resolvedComic?.title ?? job.title,
    status: renderRun?.status ?? currentStage?.status ?? job.status,
    rq_status: (detail?.rq_status as ActiveJobEntry['rq_status']) ?? job.rq_status,
    workflow_stages: workflowStages,
    render_progress: renderRunProgress ?? (isRenderRunJob ? job.render_progress ?? comicRenderProgress : comicRenderProgress),
    warning: typeof detail?.warning === 'string' ? detail.warning : job.warning ?? null,
    reconnecting: false,
  }
}

function isUnauthorized(error: unknown): boolean {
  return Boolean((error as { isUnauthorized?: boolean } | undefined)?.isUnauthorized)
}

function isNotFound(error: unknown): boolean {
  const response = (error as { response?: { status?: number } } | undefined)?.response

  return response?.status === 404
}

function isTerminalJobDetail(detail: JobDetail | null | undefined): boolean {
  return [detail?.rq_status, detail?.render_run?.status].some((status) => (
    typeof status === 'string' && TERMINAL_JOB_STATUSES.has(status)
  ))
}

function mapBackoffDelay(visible: boolean, failures: number): number {
  const base = visible ? VISIBLE_POLL_MS : HIDDEN_POLL_MS

  return Math.min(base * (2 ** failures), MAX_BACKOFF_MS)
}

export function mapStageToComicsTab(stage: string): string {
  switch (stage) {
    case 'story':
    case 'outline':
      return 'story'
    case 'characters':
      return 'characters'
    case 'shots':
      return 'panels'
    case 'render':
    case 'cover':
    case 'export':
    case 'publish':
      return 'image-generation'
    default:
      return 'image-generation'
  }
}

export function useActiveJobs() {
  const jobs = useAtomValue(activeJobsAtom)
  const jobsRef = useRef(jobs)
  const comicCacheRef = useRef(new Map<number, ComicCacheEntry>())
  const removalTimersRef = useRef(new Map<string, number>())
  const failureCountRef = useRef(0)
  const [isVisible, setIsVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  )

  useEffect(() => {
    jobsRef.current = jobs
  }, [jobs])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined

    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === 'visible')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  useEffect(() => {
    let cancelled = false

    const hydrate = async () => {
      try {
        const response = await JobsApi.listActive()
        if (cancelled) return
        const hydratedJobs = response.active.map(normalizeActiveJob)
        const hydratedJobIds = new Set(hydratedJobs.map((job) => job.job_id))
        const localOnlyJobs = jobsRef.current.filter((job) => !hydratedJobIds.has(job.job_id))
        replaceActiveJobs([...localOnlyJobs, ...hydratedJobs])
      } catch (error) {
        if (isUnauthorized(error)) {
          clearActiveJobs()
        }
      }
    }

    void hydrate()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (jobs.length === 0) return undefined

    let cancelled = false
    let timerId: number | undefined

    const scheduleRemoval = (jobId: string, delayMs = REMOVAL_DELAY_MS) => {
      if (removalTimersRef.current.has(jobId)) return

      const removalId = window.setTimeout(() => {
        removalTimersRef.current.delete(jobId)
        removeActiveJob(jobId)
      }, delayMs)

      removalTimersRef.current.set(jobId, removalId)
    }

    const cancelRemoval = (jobId: string) => {
      const timer = removalTimersRef.current.get(jobId)
      if (typeof timer === 'number') {
        window.clearTimeout(timer)
        removalTimersRef.current.delete(jobId)
      }
    }

    const fetchComic = async (comicId: number, now: number): Promise<IComic | undefined> => {
      const cached = comicCacheRef.current.get(comicId)
      if (cached && now - cached.fetchedAt < COMIC_REFRESH_MS) {
        return cached.comic
      }

      const comic = await ComicsApi.get(comicId)
      comicCacheRef.current.set(comicId, { comic, fetchedAt: now })

      return comic
    }

    const applyReconnectingFlag = () => {
      const next = jobsRef.current.map((job) => ({
        ...job,
        reconnecting: failureCountRef.current >= 3,
      }))
      mergeActiveJobs(next)
    }

    const tick = async () => {
      if (cancelled) return
      const currentJobs = jobsRef.current
      if (currentJobs.length === 0) return

      const now = Date.now()

      try {
        const details = await Promise.all(
          currentJobs.map(async (job) => {
            try {
              const detail = await JobsApi.get(job.job_id)

              return { job, detail, error: null as null }
            } catch (error) {
              return { job, detail: null as JobDetail | null, error }
            }
          }),
        )

        if (cancelled) return

        const comicIds = new Set<number>()
        for (const item of details) {
          const comicId = item.job.comic_id ?? Number(item.detail?.comic?.id)
          if (Number.isFinite(comicId) && comicId && comicId > 0) {
            comicIds.add(comicId)
          }
        }

        const comicMap = new Map<number, IComic>()
        for (const comicId of comicIds) {
          try {
            const comic = await fetchComic(comicId, now)
            if (comic) comicMap.set(comicId, comic)
          } catch (error) {
            if (isUnauthorized(error)) {
              clearActiveJobs()

              return
            }
          }
        }

        let batchFailed = false
        const nextJobs: ActiveJobEntry[] = []

        for (const item of details) {
          if (item.error) {
            if (isUnauthorized(item.error)) {
              clearActiveJobs()

              return
            }

            if (isNotFound(item.error)) {
              removeActiveJob(item.job.job_id)
              continue
            }

            batchFailed = true
            nextJobs.push(item.job)
            continue
          }

          if (isTerminalJobDetail(item.detail)) {
            scheduleRemoval(item.job.job_id)
          } else {
            cancelRemoval(item.job.job_id)
          }

          const resolvedComicId = item.job.comic_id ?? Number(item.detail?.comic?.id)
          const comic = Number.isFinite(resolvedComicId) && resolvedComicId
            ? comicMap.get(resolvedComicId)
            : undefined
          nextJobs.push(enrichJob(item.job, item.detail ?? undefined, comic))
        }

        if (batchFailed) {
          failureCountRef.current += 1
          applyReconnectingFlag()
        } else {
          failureCountRef.current = 0
          mergeActiveJobs(nextJobs)
        }
      } catch (error) {
        if (isUnauthorized(error)) {
          clearActiveJobs()

          return
        }

        failureCountRef.current += 1
        applyReconnectingFlag()
      } finally {
        if (!cancelled) {
          timerId = window.setTimeout(tick, mapBackoffDelay(isVisible, failureCountRef.current))
        }
      }
    }

    timerId = window.setTimeout(tick, 0)

    return () => {
      cancelled = true
      if (typeof timerId === 'number') {
        window.clearTimeout(timerId)
      }
    }
  }, [isVisible, jobs.length])

  useEffect(() => () => {
    for (const timerId of removalTimersRef.current.values()) {
      window.clearTimeout(timerId)
    }

    removalTimersRef.current.clear()
  }, [])

  return {
    jobs,
  }
}

export default useActiveJobs

import { atom, getDefaultStore } from 'jotai'

import type { IComic, IUser, RenderRun } from '@/service/types'

// Global user session atom
export const userAtom = atom<IUser | null>(null)

export interface ActiveJobStage {
  stage: string
  status: string
  job_id?: string | null
  completed_at?: string | null
  error_message?: string | null
}

export interface ActiveJobRenderProgress {
  completed: number
  total: number
}

export type ActiveJobRqStatus =
  | 'queued'
  | 'started'
  | 'running'
  | 'finished'
  | 'completed'
  | 'failed'
  | 'deferred'
  | 'aborted'
  | 'unknown'

export interface ActiveJobEntry {
  job_id: string
  render_run_id?: number | null
  comic_id?: number | null
  stage: string
  status: string
  title?: string | null
  started_at?: string | null
  rq_status?: ActiveJobRqStatus
  workflow_stages?: ActiveJobStage[]
  render_progress?: ActiveJobRenderProgress | null
  render_run?: RenderRun | null
  warning?: string | null
  reconnecting?: boolean
  comic?: IComic | null
}

export const activeJobsAtom = atom<ActiveJobEntry[]>([])

const store = getDefaultStore()

export function replaceActiveJobs(jobs: ActiveJobEntry[]) {
  store.set(activeJobsAtom, jobs)
}

export function mergeActiveJobs(jobs: ActiveJobEntry[]) {
  store.set(activeJobsAtom, (current) => {
    const nextById = new Map(current.map((job) => [job.job_id, job]))

    for (const job of jobs) {
      nextById.set(job.job_id, {
        ...nextById.get(job.job_id),
        ...job,
      })
    }

    return [...nextById.values()]
  })
}

export function removeActiveJob(jobId: string) {
  store.set(activeJobsAtom, (current) => current.filter((job) => job.job_id !== jobId))
}

export function clearActiveJobs() {
  store.set(activeJobsAtom, [])
}

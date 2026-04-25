import { atom } from 'jotai'
import { atomWithStorage, createJSONStorage } from 'jotai/utils'
import { getDefaultStore } from 'jotai/vanilla'

import type { IComic, IUser, JobStatus } from '@/service/types'

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

export interface ActiveJobEntry {
  job_id: string
  comic_id: number | null
  stage: string
  status: string
  title: string
  started_at: string | null
  rq_status?: JobStatus | 'unknown'
  reconnecting?: boolean
  warning?: string | null
  comic?: IComic | null
  workflow_stages?: ActiveJobStage[]
  render_progress?: ActiveJobRenderProgress | null
}

const storage = createJSONStorage<ActiveJobEntry[]>(() => localStorage)
const STORAGE_KEY = 'mangasuperb.active-jobs'

export const activeJobsAtom = atomWithStorage<ActiveJobEntry[]>(STORAGE_KEY, [], storage)
export const activeJobsCountAtom = atom((get) => get(activeJobsAtom).length)

export const appStore = getDefaultStore()

function sortActiveJobs(jobs: ActiveJobEntry[]): ActiveJobEntry[] {
  return [...jobs].sort((left, right) => {
    const leftTime = left.started_at ? Date.parse(left.started_at) : Number.MAX_SAFE_INTEGER
    const rightTime = right.started_at ? Date.parse(right.started_at) : Number.MAX_SAFE_INTEGER
    if (leftTime !== rightTime) return leftTime - rightTime
    return left.job_id.localeCompare(right.job_id)
  })
}

function mergeJob(existing: ActiveJobEntry | undefined, incoming: ActiveJobEntry): ActiveJobEntry {
  return {
    ...existing,
    ...incoming,
    comic: incoming.comic ?? existing?.comic ?? null,
    workflow_stages: incoming.workflow_stages ?? existing?.workflow_stages,
    render_progress: incoming.render_progress ?? existing?.render_progress ?? null,
    warning: incoming.warning ?? existing?.warning ?? null,
    reconnecting: incoming.reconnecting ?? existing?.reconnecting ?? false,
  }
}

function mergeActiveJobsInternal(
  current: ActiveJobEntry[],
  jobs: ActiveJobEntry[],
  mode: 'merge' | 'replace',
): ActiveJobEntry[] {
  const map = new Map<string, ActiveJobEntry>()

  if (mode === 'merge') {
    for (const job of current) {
      map.set(job.job_id, job)
    }
  }

  for (const job of jobs) {
    const existing = map.get(job.job_id)
    map.set(job.job_id, mergeJob(existing, job))
  }

  return sortActiveJobs([...map.values()])
}

export function appendActiveJob(job: ActiveJobEntry): void {
  const current = appStore.get(activeJobsAtom)
  appStore.set(activeJobsAtom, mergeActiveJobsInternal(current, [job], 'merge'))
}

export function mergeActiveJobs(jobs: ActiveJobEntry[]): void {
  const current = appStore.get(activeJobsAtom)
  appStore.set(activeJobsAtom, mergeActiveJobsInternal(current, jobs, 'merge'))
}

export function replaceActiveJobs(jobs: ActiveJobEntry[]): void {
  appStore.set(activeJobsAtom, mergeActiveJobsInternal([], jobs, 'replace'))
}

export function removeActiveJob(jobId: string): void {
  const current = appStore.get(activeJobsAtom)
  appStore.set(
    activeJobsAtom,
    current.filter((job) => job.job_id !== jobId),
  )
}

export function clearActiveJobs(): void {
  appStore.set(activeJobsAtom, [])
}

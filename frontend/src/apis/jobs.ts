import request from '@/service'
import type { AiProviderId, IComic, RenderRun } from '@/service/types'

// Lightweight job domain types to match backend behavior
export type JobStatus =
  | 'queued'
  | 'started'
  | 'running'
  | 'finished'
  | 'completed'
  | 'failed'
  | 'deferred'
  | 'aborted'
  | 'unknown'

export interface ActiveJobRenderProgress {
  completed: number
  total: number
}

export interface JobDetail {
  id?: string
  job_id?: string
  rq_status: JobStatus
  comic?: IComic | null
  render_run?: RenderRun | null
  warning?: string | null
  // Additional metadata returned by backend
  [k: string]: any
}

export interface ActiveJob {
  job_id: string
  kind?: 'comic' | 'render_run' | 'character_image' | 'character_optimization' | string
  render_run_id?: number | null
  character_id?: number | null
  comic_id?: number | null
  stage: string
  status: string
  title?: string | null
  started_at?: string | null
  render_progress?: ActiveJobRenderProgress | null
}

export interface ActiveJobsResponse {
  active: ActiveJob[]
}

export type CreateComicJobRequest =
  | {
      job_type: 'story_optimization'
      comic_id: number
      text_provider?: AiProviderId
    }
  | {
      job_type: 'comic_generation'
      comic_id: number
      page_number: number
      prompt: string
      description?: string
      style?: string
      aspect_ratio?: string
      image_provider?: AiProviderId
      text_provider?: AiProviderId
      characters: { id: number }[]
    }

export interface CreateComicJobResponse {
  job_id?: string | null
  comic_id: number
  script_id?: number | null
  outline_job_id?: string | null
  shot_job_id?: string | null
  render_job_id?: string | null
  [k: string]: any
}

export const JobsApi = {
  // List active workflow jobs for the logged-in user
  listActive() {
    return request<void, ActiveJobsResponse>({
      url: '/api/jobs/active',
      method: 'GET',
    })
  },

  // Get a job detail and its current rq_status
  get(jobId: string) {
    return request<void, JobDetail>({
      url: `/api/jobs/${jobId}`,
      method: 'GET',
    })
  },

  // Create a job for comics workflow
  createComic(body: CreateComicJobRequest) {
    return request<CreateComicJobRequest, CreateComicJobResponse>({
      url: '/api/jobs',
      method: 'POST',
      data: body,
      timeout: 60000,
    })
  },
}

export default JobsApi

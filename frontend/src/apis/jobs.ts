import request from '@/service'
import { appendActiveJob } from '@/atoms'

// Lightweight job domain types to match backend behavior
export type JobStatus = 'queued' | 'started' | 'finished' | 'failed' | 'deferred'

export interface JobDetail {
  id: string
  rq_status: JobStatus
  // Additional metadata returned by backend
  [k: string]: any
}

export type CreateComicJobRequest =
  | {
      job_type: 'story_optimization'
      comic_id: number
    }
  | {
      job_type: 'comic_generation'
      prompt: string
      description?: string
      style?: string
      aspect_ratio?: string
      characters?: { id: number }[]
    }

export interface CreateComicJobResponse {
  job_id?: string | null
  comic_id: number
  script_id?: number | null
  outline_job_id?: string | null
  shot_job_id?: string | null
  render_job_id?: string | null
  stage_jobs?: {
    outline_job_id?: string | null
    shot_job_id?: string | null
    [k: string]: string | null | undefined
  }
  [k: string]: any
}

export interface ActiveJob {
  job_id: string
  comic_id: number | null
  stage: string
  status: 'pending' | 'in_progress'
  title: string
  started_at: string | null
}

export interface ListActiveJobsResponse {
  active: ActiveJob[]
}

export const JobsApi = {
  // Get a job detail and its current rq_status
  get(jobId: string) {
    return request<void, JobDetail>({
      url: `/api/jobs/${jobId}`,
      method: 'GET',
    })
  },

  // Create a job for comics workflow
  async createComic(body: CreateComicJobRequest) {
    const response = await request<CreateComicJobRequest, CreateComicJobResponse>({
      url: '/api/jobs',
      method: 'POST',
      data: body,
      timeout: 60000,
    })

    if (body.job_type === 'comic_generation' && response.comic_id) {
      const stageJobs = response.stage_jobs ?? {}
      const jobEntries: Array<[string | null | undefined, string]> = [
        [stageJobs.outline_job_id, 'outline'],
        [stageJobs.shot_job_id, 'shots'],
        [response.job_id ?? response.render_job_id, 'render'],
      ]

      for (const [jobId, stage] of jobEntries) {
        if (!jobId) continue
        appendActiveJob({
          job_id: jobId,
          comic_id: response.comic_id,
          stage,
          status: 'pending',
          title: 'Untitled comic',
          started_at: new Date().toISOString(),
        })
      }
    }

    if (body.job_type === 'story_optimization') {
      const comicId = body.comic_id
      const stageJobs = response.stage_jobs ?? {}
      const jobEntries: Array<[string | null | undefined, string]> = [
        [stageJobs.outline_job_id, 'outline'],
        [stageJobs.shot_job_id, 'shots'],
      ]

      for (const [jobId, stage] of jobEntries) {
        if (!jobId) continue
        appendActiveJob({
          job_id: jobId,
          comic_id: comicId,
          stage,
          status: 'pending',
          title: response.comic?.title ?? 'Untitled comic',
          started_at: new Date().toISOString(),
        })
      }
    }

    return response
  },

  // List in-flight jobs owned by the current user
  listActive() {
    return request<void, ListActiveJobsResponse>({
      url: '/api/jobs/active',
      method: 'GET',
    })
  },
}

export default JobsApi

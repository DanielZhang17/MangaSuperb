import request from '@/service'

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
      comic_id: number
      page_number: number
      prompt: string
      description?: string
      style?: string
      aspect_ratio?: string
      characters: { id: number }[]
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

export const JobsApi = {
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

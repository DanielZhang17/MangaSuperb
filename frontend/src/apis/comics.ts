import request from '@/service'
import { appendActiveJob } from '@/atoms'
import type {
  ComicLikeResponse,
  CreateComicRequest,
  CreateComicResponse,
  IComic,
  ListComicsResponse,
  PublishComicResponse,
} from '@/service/types'

export const ComicsApi = {
  // List comics for current user
  list() {
    return request<void, ListComicsResponse>({
      url: '/api/comics',
      method: 'GET',
    })
  },

  // List public comics for homepage/feed
  listPublic() {
    return request<void, ListComicsResponse>({
      url: '/api/comics/public',
      method: 'GET',
    })
  },

  // Trigger images rendering or list images for a comic
  listImages(comicId: number) {
    return request<void, any>({
      url: `/api/comics/${comicId}/images`,
      method: 'GET',
    })
  },

  // Get a comic detail by id
  get(comicId: number) {
    return request<void, IComic>({
      url: `/api/comics/${comicId}`,
      method: 'GET',
    })
  },

  // Update editable comic metadata
  update(comicId: number, body: Partial<{ title: string; style_description: string }>) {
    return request<typeof body, { comic: IComic }>({
      url: `/api/comics/${comicId}`,
      method: 'PATCH',
      data: body,
    })
  },

  // Run publish workflow (export → cover → publish)
  async publish(comicId: number, body: { make_public: boolean }) {
    const response = await request<typeof body, PublishComicResponse>({
      url: `/api/comics/${comicId}/publish`,
      method: 'POST',
      data: body,
    })

    const stageJobs = response.stage_jobs ?? {}
    const jobEntries: Array<[string | undefined, string]> = [
      [stageJobs.cover_job_id, 'cover'],
      [stageJobs.export_job_id, 'export'],
      [stageJobs.publish_job_id, 'publish'],
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

    return response
  },

  unpublish(comicId: number) {
    return request<void, { comic: IComic }>({
      url: `/api/comics/${comicId}/unpublish`,
      method: 'POST',
    })
  },

  // Like a comic
  like(comicId: number) {
    return request<void, ComicLikeResponse>({
      url: `/api/comics/${comicId}/like`,
      method: 'POST',
    })
  },

  unlike(comicId: number) {
    return request<void, ComicLikeResponse>({
      url: `/api/comics/${comicId}/like`,
      method: 'DELETE',
    })
  },

  deletePage(comicId: number, pageNumber: number) {
    return request<void, { message: string; comic: IComic }>({
      url: `/api/comics/${comicId}/pages/${pageNumber}`,
      method: 'DELETE',
    })
  },

  // Delete a comic
  delete(comicId: number) {
    return request<void, { message: string }>({
      url: `/api/comics/${comicId}`,
      method: 'DELETE',
    })
  },

  // Create a comic with story and settings
  create(body: CreateComicRequest) {
    return request<CreateComicRequest, CreateComicResponse>({
      url: '/api/comics',
      method: 'POST',
      data: body,
      timeout: 60000,
    })
  },
}

export default ComicsApi

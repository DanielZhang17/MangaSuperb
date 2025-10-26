import request from '@/service'
import type { CreateComicRequest, CreateComicResponse, IComic, ListComicsResponse, PublishComicResponse } from '@/service/types'

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

  startImages(comicId: number, body?: Record<string, any>) {
    return request<Record<string, any> | undefined, any>({
      url: `/api/comics/${comicId}/images`,
      method: 'POST',
      data: body ?? {},
      timeout: 60000,
    })
  },
  // Get a comic detail by id
  get(comicId: number) {
    return request<void, IComic>({
      url: `/api/comics/${comicId}`,
      method: 'GET',
    })
  },

  // Run publish workflow (export → cover → publish)
  publish(comicId: number, body: { make_public: boolean }) {
    return request<typeof body, PublishComicResponse>({
      url: `/api/comics/${comicId}/publish`,
      method: 'POST',
      data: body,
    })
  },

  // Like a comic
  like(comicId: number) {
    return request<void, { message?: string; comic?: IComic } | IComic>({
      url: `/api/comics/${comicId}/like`,
      method: 'POST',
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

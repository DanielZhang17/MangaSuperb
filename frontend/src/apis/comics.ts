import request from '@/service'
import type { IComic, ListComicsResponse, PublishComicResponse } from '@/service/types'

export const ComicsApi = {
  // List comics for current user
  list() {
    return request<void, ListComicsResponse>({
      url: '/api/comics',
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

  // Run publish workflow (export → cover → publish)
  publish(comicId: number, body: { make_public: boolean }) {
    return request<typeof body, PublishComicResponse>({
      url: `/api/comics/${comicId}/publish`,
      method: 'POST',
      data: body,
    })
  },
}

export default ComicsApi

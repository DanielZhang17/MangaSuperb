import request from '@/service'

export interface UpdateStoryRequest {
  old_story: string
  new_story: string
}

export interface EnhanceStoryRequest {
  story: string
  comic_id?: number
}

export const StoriesApi = {
  // Update story for a comic: send old and new story text
  update(comicId: number, body: UpdateStoryRequest) {
    return request<UpdateStoryRequest, any>({
      url: `/api/stories/${comicId}`,
      method: 'POST',
      data: body,
    })
  },

  // Trigger optimization for the current story of a comic
  optimize(comicId: number) {
    return request<object, any>({
      url: `/api/stories/${comicId}/optimize`,
      method: 'POST',
      data: {},
    })
  },

  enhance(body: EnhanceStoryRequest) {
    return request<EnhanceStoryRequest, { story: string; comic?: any }>({
      url: '/api/stories/enhance',
      method: 'POST',
      data: body,
      timeout: 60000,
    })
  },
}

export default StoriesApi

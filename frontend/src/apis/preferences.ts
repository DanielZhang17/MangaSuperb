import request from '@/service'
import type {
  PreferencesResponse,
  UpdatePreferencesRequest,
  UpdatePreferencesResponse,
} from '@/service/types'

export const PreferencesApi = {
  get() {
    return request<void, PreferencesResponse>({
      url: '/api/preferences',
      method: 'GET',
    })
  },

  update(body: UpdatePreferencesRequest) {
    return request<UpdatePreferencesRequest, UpdatePreferencesResponse>({
      url: '/api/preferences',
      method: 'PUT',
      data: body,
    })
  },
}

export default PreferencesApi

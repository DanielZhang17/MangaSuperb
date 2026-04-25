import request from '@/service'
import type {
  CreateScriptRequest,
  CreateScriptResponse,
  GetScriptResponse,
  ListScriptsResponse,
} from '@/service/types'

export const ScriptsApi = {
  // Create a script draft
  create(body: CreateScriptRequest) {
    return request<CreateScriptRequest, CreateScriptResponse>({
      url: '/api/scripts',
      method: 'POST',
      data: body,
    })
  },

  // Get a single script by id
  get(scriptId: number) {
    return request<void, GetScriptResponse>({
      url: `/api/scripts/${scriptId}`,
      method: 'GET',
    })
  },

  // List scripts for current user
  list() {
    return request<void, ListScriptsResponse>({
      url: '/api/scripts',
      method: 'GET',
    })
  },
}

export default ScriptsApi

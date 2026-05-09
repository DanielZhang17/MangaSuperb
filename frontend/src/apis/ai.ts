import request from '@/service'
import type { AiProvidersResponse } from '@/service/types'

export const AiApi = {
  providers() {
    return request<void, AiProvidersResponse>({
      url: '/api/ai/providers',
      method: 'GET',
    })
  },
}

export default AiApi

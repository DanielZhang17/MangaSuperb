import request from '@/service'
import type { AutoCharacterPrepareRequest, AutoCharacterPrepareResponse } from '@/service/types'

export const AutoApi = {
  prepareCharacters(body: AutoCharacterPrepareRequest) {
    return request<AutoCharacterPrepareRequest, AutoCharacterPrepareResponse>({
      url: '/api/auto/characters/prepare',
      method: 'POST',
      data: body,
      timeout: 60000,
    })
  },
}

export default AutoApi

import request from '@/service'
import type {
  ActiveAutoRunResponse,
  AutoCharacterPrepareRequest,
  AutoCharacterPrepareResponse,
  AutoRunResponse,
  ResolveAutoRunRequest,
  StartAutoRunRequest,
  SuggestAutoTitleRequest,
  SuggestAutoTitleResponse,
} from '@/service/types'

export const AutoApi = {
  suggestTitle(body: SuggestAutoTitleRequest) {
    return request<SuggestAutoTitleRequest, SuggestAutoTitleResponse>({
      url: '/api/auto/title',
      method: 'POST',
      data: body,
      timeout: 60000,
    })
  },

  prepareCharacters(body: AutoCharacterPrepareRequest) {
    return request<AutoCharacterPrepareRequest, AutoCharacterPrepareResponse>({
      url: '/api/auto/characters/prepare',
      method: 'POST',
      data: body,
      timeout: 60000,
    })
  },

  startRun(body: StartAutoRunRequest) {
    return request<StartAutoRunRequest, AutoRunResponse>({
      url: '/api/auto/runs',
      method: 'POST',
      data: body,
      timeout: 60000,
    })
  },

  getActiveRun(comicId?: number | null) {
    return request<void, ActiveAutoRunResponse>({
      url: '/api/auto/runs/active',
      method: 'GET',
      params: comicId ? { comic_id: comicId } : undefined,
    })
  },

  getLatestRun(comicId: number) {
    return request<void, AutoRunResponse>({
      url: '/api/auto/runs/latest',
      method: 'GET',
      params: { comic_id: comicId },
    })
  },

  getRun(autoRunId: number) {
    return request<void, AutoRunResponse>({
      url: `/api/auto/runs/${autoRunId}`,
      method: 'GET',
    })
  },

  abortRun(autoRunId: number) {
    return request<void, AutoRunResponse>({
      url: `/api/auto/runs/${autoRunId}/abort`,
      method: 'POST',
    })
  },

  retryRun(autoRunId: number) {
    return request<void, AutoRunResponse>({
      url: `/api/auto/runs/${autoRunId}/retry`,
      method: 'POST',
    })
  },

  resolveRun(autoRunId: number, body: ResolveAutoRunRequest) {
    return request<ResolveAutoRunRequest, AutoRunResponse>({
      url: `/api/auto/runs/${autoRunId}/resolve`,
      method: 'POST',
      data: body,
    })
  },
}

export default AutoApi

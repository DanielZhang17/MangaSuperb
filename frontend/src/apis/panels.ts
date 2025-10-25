import request from '@/service'
import type { SetPanelLayoutRequest } from '@/service/types'

export const PanelsApi = {
  // Set a manual layout for a specific page within a comic
  setLayout(comicId: number, body: SetPanelLayoutRequest) {
    return request<SetPanelLayoutRequest, any>({
      url: `/api/panels/${comicId}/layouts`,
      method: 'POST',
      data: body,
    })
  },

  // Trigger a render job for a particular page
  renderPage(comicId: number, pageNumber: number) {
    return request<object, { job_id: string }>({
      url: `/api/panels/${comicId}/pages/${pageNumber}/render`,
      method: 'POST',
      data: {},
    })
  },
}

export default PanelsApi

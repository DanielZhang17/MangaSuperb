import request from '@/service'
import type { AiProviderId, SetPanelLayoutRequest } from '@/service/types'

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
  renderPage(comicId: number, pageNumber: number, body: { image_provider?: AiProviderId; text_provider?: AiProviderId } = {}) {
    return request<typeof body, { job_id: string }>({
      url: `/api/panels/${comicId}/pages/${pageNumber}/render`,
      method: 'POST',
      data: body,
    })
  },

  // Update a single panel shot by its id
  updatePanel(panelId: number, body: Partial<{
    camera_notes: string | null
    description: string | null
    dialogue: string
    page_number: number | null
    panel_number: number | null
    status: string
    style_notes: string | null
  }>) {
    return request<typeof body, any>({
      url: `/api/panels/${panelId}`,
      method: 'PATCH',
      data: body,
    })
  },
}

export default PanelsApi

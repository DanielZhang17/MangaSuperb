import request from '@/service'
import { appendActiveJob } from '@/atoms'
import type { ColorMode, SetPanelLayoutRequest } from '@/service/types'

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
  async renderPage(comicId: number, pageNumber: number, options?: {
    font_family?: string
    font_size?: string
    bubble_shape?: string
    bubble_tail?: boolean
    color_mode?: ColorMode
    aspect_ratio?: string
  }) {
    const response = await request<object, { job_id: string; comic?: { title?: string | null } }>({
      url: `/api/panels/${comicId}/pages/${pageNumber}/render`,
      method: 'POST',
      data: options || {},
    })

    appendActiveJob({
      job_id: response.job_id,
      comic_id: comicId,
      stage: 'render',
      status: 'pending',
      title: response.comic?.title ?? 'Untitled comic',
      started_at: new Date().toISOString(),
    })

    return response
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

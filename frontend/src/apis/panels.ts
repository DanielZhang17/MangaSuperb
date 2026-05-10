import request from '@/service'
import type { AiProviderId, RenderRun, SetPanelLayoutRequest } from '@/service/types'

interface RenderOptions {
  image_provider?: AiProviderId
  text_provider?: AiProviderId
  style_description?: string
  color_mode?: string
  aspect_ratio?: string
  font_family?: string
  font_size?: string
  bubble_shape?: string
  bubble_tail?: boolean
}

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
  renderPage(comicId: number, pageNumber: number, body: RenderOptions = {}) {
    return request<typeof body, { job_id: string }>({
      url: `/api/panels/${comicId}/pages/${pageNumber}/render`,
      method: 'POST',
      data: body,
    })
  },

  startRenderRun(comicId: number, body: RenderOptions & {
    mode: 'first_page' | 'all_pages' | 'remaining_pages'
  }) {
    return request<typeof body, { render_run: RenderRun; comic: any }>({
      url: `/api/panels/${comicId}/render-runs`,
      method: 'POST',
      data: body,
    })
  },

  abortRenderRun(renderRunId: number) {
    return request<void, { render_run: RenderRun }>({
      url: `/api/panels/render-runs/${renderRunId}/abort`,
      method: 'POST',
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

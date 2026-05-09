import type { AxiosRequestConfig } from 'axios'

export interface CustomRequestConfig<TRequest = any> extends AxiosRequestConfig {
  showLoading?: boolean
  showError?: boolean
  data?: TRequest
}

export interface IApiResponse<T = any> {
  code: number
  message: string
  data: T
}

// ===== Backend domain types (session-cookie based API) =====
export interface IUser {
  id: number
  username: string
  email: string
  created_at: string
  avatar_index: number
  preferences?: UserPreferences
}

// Auth
export interface AuthLoginRequest {
  email?: string
  username?: string
  password: string
}

export interface AuthLoginResponse {
  user: IUser
}

export interface AuthRegisterRequest {
  username: string
  email: string
  password: string
}

export interface AuthRegisterResponse {
  user: IUser
}

export interface AuthMeResponse {
  user: IUser | null
}

export interface AuthLogoutResponse {
  message: string
}

export interface AuthUpdateUsernameRequest {
  username: string
}

export interface AuthUpdateUsernameResponse {
  user: IUser
}

// ===== Characters =====
export interface ICharacter {
  id: number
  user_id: number
  name: string
  description: string
  sex: string
  is_public: boolean
  style_prompt: string | null
  optimized_description: string | null
  image_status: string
  image_url: string | null
  image_job_id: string | null
  image_error: string | null
  created_at: string | null
  updated_at: string | null
}

export interface CreateCharacterRequest {
  name: string
  description: string
  optimize?: boolean
  reference_images?: string[] // base64-encoded data URLs
  style_prompt?: string
  api_key?: string // required when optimization or reference images are used
  sex?: string
  image_provider?: AiProviderId
  text_provider?: AiProviderId
}

export interface CreateCharacterResponse {
  character: ICharacter
  job_id: string | null
}

// Backend returns a wrapped object for detail: { character: ICharacter }
export interface GetCharacterResponse {
  character: ICharacter
}

export interface ListCharactersResponse {
  characters: ICharacter[]
  count?: number
}

export interface UpdateCharacterNameRequest {
  name: string
}

export interface UpdateCharacterNameResponse {
  character: ICharacter
}

export type AiProviderId = 'gemini' | 'third_party'

export type PreferenceMode = 'auto' | 'manual'

export type AutoPreference<T = unknown> =
  | { mode: 'auto'; value?: never }
  | { mode: 'manual'; value: T }

export type ColorMode = 'black-white' | 'color'

export interface UserStylePreset {
  value: string
  label: string
  is_custom: boolean
}

export interface WorkflowPreferenceFields {
  character_detection: AutoPreference<'enabled'>
  style: AutoPreference<string>
  color_mode: AutoPreference<ColorMode>
  aspect_ratio: AutoPreference<string>
  page_layout: AutoPreference<string>
  font_family: AutoPreference<string>
  font_size: AutoPreference<string>
  bubble_shape: AutoPreference<string>
  bubble_tail: AutoPreference<boolean>
  text_provider: AutoPreference<AiProviderId>
  image_provider: AutoPreference<AiProviderId>
}

export interface UserPreferences {
  version: number
  style_presets?: UserStylePreset[]
  fields: WorkflowPreferenceFields
}

export interface PreferencesAvailableOptions {
  style_presets: UserStylePreset[]
  layout_options: string[]
  color_modes: ColorMode[]
  aspect_ratios: string[]
  font_families: string[]
  font_sizes: string[]
  bubble_shapes: string[]
  ai_providers: AiProviderId[]
}

export interface PreferencesResponse {
  preferences: UserPreferences
  available_options: PreferencesAvailableOptions
  layout_options: string[]
  color_modes: ColorMode[]
}

export type UpdatePreferencesRequest = Partial<{
  style_presets: UserStylePreset[]
  fields: Partial<WorkflowPreferenceFields>
}>

export type UpdatePreferencesResponse = PreferencesResponse

export interface AiProviderCapabilities {
  image: boolean
  text: boolean
}

export interface AiProvidersResponse {
  defaults: {
    image: AiProviderId
    text: AiProviderId
  }
  providers: Record<AiProviderId, AiProviderCapabilities>
}

export interface UpdateCharacterRequest {
  name: string
  description: string
  sex?: string
  style_prompt?: string
  optimize?: boolean
  reference_images?: string[]
  image_provider?: AiProviderId
  text_provider?: AiProviderId
}

export interface UpdateCharacterResponse {
  character: ICharacter
  job_id: string | null
}

export interface DeleteCharacterResponse {
  message: string
}

export interface AutoCharacterReviewItem {
  character: ICharacter
  role: string
}

export interface AutoCharacterConflict {
  candidate: {
    name: string
    aliases: string[]
    description: string
    sex: string
    visual_traits: string[]
    role: string
    confidence: number
  }
  existing_character: ICharacter
  reason: string
  role: string
}

export interface AutoCharacterPrepareRequest {
  story: string
  style_preference?: string
  image_provider?: AiProviderId
  text_provider?: AiProviderId
}

export interface AutoCharacterPrepareResponse {
  reused: AutoCharacterReviewItem[]
  created: AutoCharacterReviewItem[]
  conflicts: AutoCharacterConflict[]
  failed: {
    candidate: AutoCharacterConflict['candidate']
    error: string
    role: string
  }[]
  suggested_roles: Record<number, string>
}

export interface UpdateCharacterNameRequest {
  name: string
}

export interface UpdateCharacterNameResponse {
  character: ICharacter
}

// ===== Scripts =====
export interface IScript {
  id: number
  user_id: number
  title: string
  content: string // JSON string persisted by backend
  created_at: string
  updated_at: string
}

export interface CreateScriptRequest {
  title: string
  content: string // send JSON stringified content
}

export interface CreateScriptResponse {
  script: IScript
}

export type GetScriptResponse = IScript

export interface ListScriptsResponse {
  scripts: IScript[]
}

// ===== Jobs / Comics / Panels =====
export type JobStatus = 'queued' | 'started' | 'finished' | 'failed' | 'deferred'

export interface JobDetail {
  id: string
  rq_status: JobStatus
  [k: string]: any
}

export interface IComic {
  id: number
  title?: string | null
  style_description?: string | null
  aspect_ratio?: string | null
  cover_image_url?: string | null
  pdf_url?: string | null
  zip_url?: string | null
  like_count?: number
  published_at?: string | null
  workflow_stage?: string | null
  workflow_status?: string | null
  // Backend may include panels/pages and other metadata
  [k: string]: any
}

export interface PublishComicResponse {
  stage_jobs: {
    cover_job_id?: string
    export_job_id?: string
    publish_job_id?: string
    [k: string]: string | undefined
  }
}

export interface SetPanelLayoutRequest {
  page_number: number
  layout_key: string
  notes?: string
  panel_order?: number[]
}

export interface ListComicsResponse {
  comics: IComic[]
  count?: number
}

export interface RenderRun {
  id: number
  comic_id: number
  user_id: number
  mode: 'first_page' | 'all_pages' | 'remaining_pages'
  status: 'queued' | 'running' | 'completed' | 'failed' | 'aborted'
  current_page_number: number | null
  requested_pages: number[]
  completed_pages: number[]
  failed_pages: number[]
  abort_requested: boolean
  job_id: string | null
  error_message: string | null
  created_at: string | null
  started_at: string | null
  completed_at: string | null
}

// Create Comic
export interface CreateComicRequest {
  aspect_ratio: string
  story: string // Full story narrative or JSON payload
  style: string // allow empty string
  title: string
  // Optional: include selected characters for initial creation
  characters?: {
    id: number
    order_index: number
    role: string
  }[]
}

export interface CreateComicResponse {
  comic?: IComic
  // backend may also return job ids or workflow info; keep flexible
  [k: string]: any
}

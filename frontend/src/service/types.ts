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

export interface DeleteCharacterResponse {
  message: string
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

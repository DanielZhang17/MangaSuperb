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

export type GetCharacterResponse = ICharacter

export interface ListCharactersResponse {
  characters: ICharacter[]
  count?: number
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

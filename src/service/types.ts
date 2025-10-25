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

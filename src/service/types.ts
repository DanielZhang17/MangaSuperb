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

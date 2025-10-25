import type { AxiosError, AxiosInstance } from 'axios'
import axios from 'axios'

import type { CustomRequestConfig } from './types'

function request<TRequest = any, TResponse = any>(
  config: CustomRequestConfig<TRequest>,
): Promise<TResponse> {
  const instance: AxiosInstance = axios.create({
    baseURL: (import.meta as any).env?.VITE_API_BASE ?? '',
    timeout: 10000,
    withCredentials: true, 
    headers: { 'Content-Type': 'application/json' },
  })

  instance.interceptors.request.use(
    (cfg) => cfg,
    (error: AxiosError) => Promise.reject(error),
  )

  instance.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      let message = ''
      if (error.response) {
        switch (error.response.status) {
          case 400:
            message = 'Bad Request (400)'
            break
          case 401:
            message = 'Unauthorized (401)'
            break
          case 403:
            message = 'Forbidden (403)'
            break
          case 404:
            message = 'Not Found (404)'
            break
          case 500:
            message = 'Internal Server Error (500)'
            break
          default:
            message = `Connection error (${error.response.status})`
        }
        
        const data: any = error.response.data
        if (data && typeof data === 'object' && (data.error || data.message)) {
          message = data.error || data.message || message
        }
      }
      else if (error.request) {
        message = 'Network connection timeout'
      }
      else {
        message = 'Request failed, please check your network'
      }

      if (config.showError !== false) {
        console.error(message)
      }

      return Promise.reject(error)
    },
  )

  return instance.request<TResponse>(config).then((res) => res.data as TResponse)
}

export default request

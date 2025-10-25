import request from '@/service'
import type {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthLogoutResponse,
  AuthMeResponse,
  AuthRegisterRequest,
  AuthRegisterResponse,
  AuthUpdateUsernameRequest,
  AuthUpdateUsernameResponse,
} from '@/service/types'

// Auth API bindings (session-cookie based)
export const AuthApi = {
  login(body: AuthLoginRequest) {
    return request<AuthLoginRequest, AuthLoginResponse>({
      url: '/api/auth/login',
      method: 'POST',
      data: body,
    })
  },

  register(body: AuthRegisterRequest) {
    return request<AuthRegisterRequest, AuthRegisterResponse>({
      url: '/api/auth/register',
      method: 'POST',
      data: body,
    })
  },

  me() {
    return request<void, AuthMeResponse>({
      url: '/api/auth/me',
      method: 'GET',
    })
  },

  logout() {
    return request<void, AuthLogoutResponse>({
      url: '/api/auth/logout',
      method: 'POST',
    })
  },

  updateUsername(body: AuthUpdateUsernameRequest) {
    return request<AuthUpdateUsernameRequest, AuthUpdateUsernameResponse>({
      url: '/api/auth/username',
      method: 'PATCH',
      data: body,
    })
  },
}

export default AuthApi

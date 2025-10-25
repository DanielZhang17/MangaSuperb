import { useSetAtom } from 'jotai'
import { useEffect } from 'react'
import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'

import AuthApi from '@/apis/auth'
import { userAtom } from '@/atoms'
import type {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthLogoutResponse,
  AuthMeResponse,
  AuthRegisterRequest,
  AuthRegisterResponse,
  AuthUpdateUsernameRequest,
  AuthUpdateUsernameResponse,
  IUser,
} from '@/service/types'

const KEY_ME = '/api/auth/me'

export function useAuth() {
  const { data, error, isLoading, mutate } = useSWR<AuthMeResponse>(KEY_ME)
  const setUser = useSetAtom(userAtom)

  // Sync SWR me() result into global atom
  useEffect(() => {
    setUser(data?.user ?? null)
  }, [data?.user, setUser])

  const loginMutation = useSWRMutation<AuthLoginResponse, any, string, AuthLoginRequest>(
    '/api/auth/login',
    async (_key, { arg }) => AuthApi.login(arg),
  )

  const registerMutation = useSWRMutation<AuthRegisterResponse, any, string, AuthRegisterRequest>(
    '/api/auth/register',
    async (_key, { arg }) => AuthApi.register(arg),
  )

  const logoutMutation = useSWRMutation<AuthLogoutResponse, any, string, void>(
    '/api/auth/logout',
    async () => AuthApi.logout(),
  )

  const updateUsernameMutation = useSWRMutation<
    AuthUpdateUsernameResponse,
    any,
    string,
    AuthUpdateUsernameRequest
  >('/api/auth/username', async (_key, { arg }) => AuthApi.updateUsername(arg))

  async function login(arg: AuthLoginRequest) {
    const res = await loginMutation.trigger(arg)
    // Establishes cookie; reflect in cache
    await mutate({ user: res.user }, { revalidate: true })

    setUser(res.user)

    return res
  }

  async function register(arg: AuthRegisterRequest) {
    const res = await registerMutation.trigger(arg)
    await mutate({ user: res.user }, { revalidate: true })

    setUser(res.user)

    return res
  }

  async function logout() {
    await logoutMutation.trigger()
    await mutate({ user: null }, { revalidate: false })

    setUser(null)
  }

  async function updateUsername(arg: AuthUpdateUsernameRequest) {
    const res = await updateUsernameMutation.trigger(arg)
    await mutate({ user: res.user }, { revalidate: false })
    setUser(res.user)

    return res
  }

  return {
    user: data?.user ?? null as IUser | null,
    loading: isLoading,
    error,
    refresh: () => mutate(),
    // actions
    login,
    loginState: { isMutating: loginMutation.isMutating },
    register,
    registerState: { isMutating: registerMutation.isMutating },
    logout,
    logoutState: { isMutating: logoutMutation.isMutating },
    updateUsername,
    updateUsernameState: { isMutating: updateUsernameMutation.isMutating },
  }
}

export default useAuth

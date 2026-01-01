import { useAtom } from 'jotai'
import { useEffect } from 'react'
import useSWR from 'swr'

import PreferencesApi from '@/apis/preferences'
import { userAtom } from '@/atoms'
import { DEFAULT_COLOR_MODES, DEFAULT_LAYOUT_OPTIONS } from '@/config/preferences'
import type { PreferencesResponse, UpdatePreferencesRequest } from '@/service/types'

const KEY = '/api/preferences'

export function usePreferences() {
  const [user, setUser] = useAtom(userAtom)

  const shouldFetch = Boolean(user)
  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<PreferencesResponse>(
    shouldFetch ? KEY : null,
    () => PreferencesApi.get(),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  )

  useEffect(() => {
    if (!user || !data?.preferences) return

    const currentPrefs = JSON.stringify(user.preferences ?? {})
    const nextPrefs = JSON.stringify(data.preferences)

    if (currentPrefs === nextPrefs) return
    setUser({ ...user, preferences: data.preferences })
  }, [data?.preferences, setUser, user])

  const update = async (updates: UpdatePreferencesRequest) => {
    const response = await PreferencesApi.update(updates)
    await mutate(response, false)
    if (response?.preferences && user) {
      const currentPrefs = JSON.stringify(user.preferences ?? {})
      const nextPrefs = JSON.stringify(response.preferences)
      if (currentPrefs !== nextPrefs) {
        setUser({ ...user, preferences: response.preferences })
      }
    }
    return response
  }

  return {
    preferences: data?.preferences ?? user?.preferences,
    layoutOptions: data?.layout_options ?? Array.from(DEFAULT_LAYOUT_OPTIONS),
    colorModes: data?.color_modes ?? DEFAULT_COLOR_MODES,
    loading: isLoading,
    isValidating,
    error,
    refresh: () => mutate(),
    update,
  }
}

export default usePreferences

import useSWR from 'swr'

import type { AiProviderId, AiProvidersResponse } from '@/service/types'

export const AI_PROVIDER_LABELS: Record<AiProviderId, string> = {
  gemini: 'Gemini',
  third_party: 'OpenAI',
}

const FALLBACK_PROVIDERS: AiProvidersResponse = {
  defaults: {
    image: 'gemini',
    text: 'gemini',
  },
  providers: {
    gemini: { image: true, text: true },
    third_party: { image: true, text: true },
  },
}

export function useAiProviders() {
  const { data, error, isLoading, mutate } = useSWR<AiProvidersResponse>('/api/ai/providers')
  const providers = data ?? FALLBACK_PROVIDERS

  const imageProviders = (Object.keys(providers.providers) as AiProviderId[]).filter(
    (provider) => providers.providers[provider]?.image,
  )
  const textProviders = (Object.keys(providers.providers) as AiProviderId[]).filter(
    (provider) => providers.providers[provider]?.text,
  )

  return {
    providers,
    imageProviders: imageProviders.length ? imageProviders : [providers.defaults.image],
    textProviders: textProviders.length ? textProviders : [providers.defaults.text],
    loading: isLoading,
    error,
    refresh: mutate,
  }
}

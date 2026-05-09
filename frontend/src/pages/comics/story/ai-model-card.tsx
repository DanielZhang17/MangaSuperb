import { useAtom } from 'jotai'
import { useEffect, useMemo } from 'react'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AI_PROVIDER_LABELS, useAiProviders } from '@/hooks/use-ai-providers'
import { useI18n } from '@/hooks/use-i18n'
import { usePreferences } from '@/hooks/use-preferences'
import { resolveAvailablePreferenceValue } from '@/lib/auto-preferences'
import type { AiProviderId, AutoPreference } from '@/service/types'

import { currentComicOverridesAtom, textProviderAtom } from '../atoms'
import { AutoSelectControl } from '../components/auto-select-control'

export function AIModelCard() {
  const { t } = useI18n('comics')
  const [textProvider, setTextProvider] = useAtom(textProviderAtom)
  const [overrides, setOverrides] = useAtom(currentComicOverridesAtom)
  const { providers, textProviders, loading } = useAiProviders()
  const { preferences } = usePreferences()
  const providerOptions = useMemo(() => (
    textProviders.map((provider) => ({
      value: provider,
      label: AI_PROVIDER_LABELS[provider],
    }))
  ), [textProviders])
  const fallbackProvider = textProviders.includes(providers.defaults.text)
    ? providers.defaults.text
    : (textProviders[0] ?? providers.defaults.text)
  const preferenceProvider = preferences?.fields?.text_provider
  const defaultProvider = resolveAvailablePreferenceValue(preferenceProvider, textProviders, fallbackProvider)
  const rawTextProviderPreference = (overrides.text_provider ?? preferenceProvider ?? { mode: 'auto' }) as AutoPreference<AiProviderId>
  const resolvedProvider = resolveAvailablePreferenceValue(rawTextProviderPreference, textProviders, defaultProvider)
  const textProviderPreference = rawTextProviderPreference.mode === 'manual' && !textProviders.includes(rawTextProviderPreference.value)
    ? { mode: 'manual', value: resolvedProvider } as AutoPreference<AiProviderId>
    : rawTextProviderPreference

  useEffect(() => {
    if (loading || !textProviders.length) return

    if (textProviders.includes(resolvedProvider) && textProvider !== resolvedProvider) {
      setTextProvider(resolvedProvider)
    }
  }, [loading, resolvedProvider, setTextProvider, textProvider, textProviders])

  const handleTextProviderPreferenceChange = (nextPreference: AutoPreference<AiProviderId>) => {
    setOverrides((prev: any) => ({
      ...prev,
      text_provider: nextPreference,
    }))
    const nextProvider = resolveAvailablePreferenceValue(nextPreference, textProviders, defaultProvider)
    if (textProviders.includes(nextProvider)) {
      setTextProvider(nextProvider)
    }
  }

  return (
    <Card className="rounded-lg">
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-base">{String(t('aiModel.title'))}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <AutoSelectControl
          label="Auto default"
          value={textProviderPreference}
          options={providerOptions}
          onChange={handleTextProviderPreferenceChange}
        />
        <ToggleGroup
          type="single"
          value={resolvedProvider}
          onValueChange={(value) => {
            if (value) {
              handleTextProviderPreferenceChange({ mode: 'manual', value: value as AiProviderId })
            }
          }}
          className="grid w-full grid-cols-2 gap-2"
        >
          {textProviders.map((provider) => (
            <ToggleGroupItem key={provider} value={provider} className="w-full">
              {AI_PROVIDER_LABELS[provider]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardContent>
    </Card>
  )
}

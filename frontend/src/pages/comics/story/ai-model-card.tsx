import { useAtom } from 'jotai'
import { useEffect, useRef } from 'react'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AI_PROVIDER_LABELS, useAiProviders } from '@/hooks/use-ai-providers'
import { useI18n } from '@/hooks/use-i18n'
import type { AiProviderId } from '@/service/types'

import { textProviderAtom } from '../atoms'

export function AIModelCard() {
  const { t } = useI18n('comics')
  const [textProvider, setTextProvider] = useAtom(textProviderAtom)
  const { providers, textProviders, loading } = useAiProviders()
  const initializedFromDefaultsRef = useRef(false)
  const userChangedRef = useRef(false)

  useEffect(() => {
    if (loading || !textProviders.length) return

    if (!initializedFromDefaultsRef.current) {
      initializedFromDefaultsRef.current = true
      if (!userChangedRef.current && textProvider === 'gemini') {
        const defaultProvider = textProviders.includes(providers.defaults.text)
          ? providers.defaults.text
          : textProviders[0]
        setTextProvider(defaultProvider)

        return
      }
    }

    if (!textProviders.includes(textProvider) && textProviders[0]) {
      setTextProvider(textProviders[0])
    }
  }, [loading, providers.defaults.text, setTextProvider, textProvider, textProviders])

  return (
    <Card className="rounded-lg">
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-base">{String(t('aiModel.title'))}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <ToggleGroup
          type="single"
          value={textProvider}
          onValueChange={(value) => {
            if (value) {
              userChangedRef.current = true
              setTextProvider(value as AiProviderId)
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

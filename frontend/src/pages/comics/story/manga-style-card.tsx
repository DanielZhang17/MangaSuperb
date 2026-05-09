import { useAtom } from 'jotai'
import { useEffect, useMemo } from 'react'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DEFAULT_STYLE_PRESETS } from '@/config/preferences'
import { useI18n } from '@/hooks/use-i18n'
import { usePreferences } from '@/hooks/use-preferences'
import { resolvePreferenceValue } from '@/lib/auto-preferences'
import { proxiedStatic } from '@/lib/utils'
import type { AutoPreference } from '@/service/types'

import { currentComicOverridesAtom, styleAtom } from '../atoms'
import { AutoSelectControl } from '../components/auto-select-control'

export function MangaStyleCard() {
  const { t } = useI18n('comics')
  const [style, setStyle] = useAtom(styleAtom)
  const [overrides, setOverrides] = useAtom(currentComicOverridesAtom)
  const { preferences } = usePreferences()

  // 预设四种风格示意图，走存储代理
  const base = 'https://storage.mangasuperb.anranz.xyz/static/'
  const styleImages = [
    proxiedStatic(base + encodeURIComponent('日漫风1.png')),
    proxiedStatic(base + encodeURIComponent('美式漫风1.png')),
    proxiedStatic(base + encodeURIComponent('国漫风1.png')),
    proxiedStatic(base + encodeURIComponent('韩漫风1.png')),
  ]
  const legacyStyleImages: Record<string, string> = {
    jp: proxiedStatic(base + encodeURIComponent('日漫风1.png')),
    us: proxiedStatic(base + encodeURIComponent('美式漫风1.png')),
    cn: proxiedStatic(base + encodeURIComponent('国漫风1.png')),
    kr: proxiedStatic(base + encodeURIComponent('韩漫风1.png')),
  }
  const styleOptions = useMemo(() => {
    const preferencePresets = (preferences as any)?.style_presets
    const presets = Array.isArray(preferencePresets) && preferencePresets.length > 0
      ? preferencePresets
      : DEFAULT_STYLE_PRESETS

    return presets.map((preset: any) => ({
      value: String(preset.value),
      label: String(preset.label ?? preset.value),
    }))
  }, [preferences])
  const preferenceStyle = preferences?.fields?.style as AutoPreference<string> | undefined
  const fallbackStyle = resolvePreferenceValue(preferenceStyle, styleOptions[0]?.value ?? '')
  const stylePreference = (overrides.style ?? preferenceStyle ?? { mode: 'auto' }) as AutoPreference<string>
  const resolvedStyle = resolvePreferenceValue(stylePreference, fallbackStyle)

  useEffect(() => {
    if (resolvedStyle && style !== resolvedStyle) {
      setStyle(resolvedStyle)
    }
  }, [resolvedStyle, setStyle, style])

  const handleStylePreferenceChange = (nextPreference: AutoPreference<string>) => {
    setOverrides((prev: any) => ({
      ...prev,
      style: nextPreference,
    }))
    const nextStyle = resolvePreferenceValue(nextPreference, fallbackStyle)
    if (nextStyle) {
      setStyle(nextStyle)
    }
  }

  return (
    <Card className="rounded-lg">
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-base">{String(t('style.title'))}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <AutoSelectControl
          label="Auto default"
          value={stylePreference}
          options={styleOptions}
          onChange={handleStylePreferenceChange}
        />
        <ToggleGroup
          type="single"
          value={resolvedStyle}
          onValueChange={(value) => {
            if (value) {
              handleStylePreferenceChange({ mode: 'manual', value })
            }
          }}
          className="grid w-full grid-cols-2 gap-2"
        >
          {styleOptions.map((option, index) => (
            <ToggleGroupItem key={option.value} value={option.value} className="flex h-auto min-w-0 flex-col p-1.5">
              <div
                className="mb-2 aspect-[5/3] w-full rounded-md bg-cover bg-center"
                style={{ backgroundImage: `url(${styleImages[index % styleImages.length] ?? legacyStyleImages.jp})` }}
              />
              <span className="text-xs">{option.label}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardContent>
    </Card>
  )
}

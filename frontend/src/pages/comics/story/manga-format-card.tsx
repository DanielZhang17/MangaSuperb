import { useAtom } from 'jotai'
import { useEffect, useMemo } from 'react'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DEFAULT_ASPECT_RATIOS } from '@/config/preferences'
import { useI18n } from '@/hooks/use-i18n'
import { usePreferences } from '@/hooks/use-preferences'
import { resolvePreferenceValue } from '@/lib/auto-preferences'
import type { AutoPreference, ColorMode } from '@/service/types'

import { aspectRatioAtom, currentComicOverridesAtom } from '../atoms'
import { AutoSelectControl } from '../components/auto-select-control'

export function MangaFormatCard() {
  const { t } = useI18n('comics')
  const [aspectRatio, setAspectRatio] = useAtom(aspectRatioAtom)
  const [overrides, setOverrides] = useAtom(currentComicOverridesAtom)
  const { colorModes, preferences } = usePreferences()
  const aspectOptions = useMemo(() => (
    DEFAULT_ASPECT_RATIOS.map((value) => ({
      value,
      label: value,
    }))
  ), [])
  const colorOptions = useMemo(() => (
    colorModes.map((value) => ({
      value,
      label: String(t(value === 'black-white' ? 'format.color.blackWhite' : 'format.color.color')),
    }))
  ), [colorModes, t])

  const preferenceAspectRatio = preferences?.fields?.aspect_ratio
  const fallbackAspectRatio = resolvePreferenceValue(
    preferenceAspectRatio,
    aspectOptions[0]?.value ?? '16:9',
  )
  const aspectRatioPreference = (
    overrides.aspect_ratio ?? preferenceAspectRatio ?? { mode: 'auto' }
  ) as AutoPreference<string>
  const resolvedAspectRatio = resolvePreferenceValue(aspectRatioPreference, fallbackAspectRatio)

  const preferenceColorMode = preferences?.fields?.color_mode
  const colorModePreference = (
    overrides.color_mode ?? preferenceColorMode ?? { mode: 'auto' }
  ) as AutoPreference<ColorMode>
  useEffect(() => {
    if (aspectRatio !== resolvedAspectRatio) {
      setAspectRatio(resolvedAspectRatio)
    }
  }, [aspectRatio, resolvedAspectRatio, setAspectRatio])

  const handleAspectRatioChange = (nextPreference: AutoPreference<string>) => {
    setOverrides((prev) => ({
      ...prev,
      aspect_ratio: nextPreference,
    }))
    setAspectRatio(resolvePreferenceValue(nextPreference, fallbackAspectRatio))
  }

  const handleColorModeChange = (nextPreference: AutoPreference<ColorMode>) => {
    setOverrides((prev) => ({
      ...prev,
      color_mode: nextPreference,
    }))
  }

  return (
    <Card className="rounded-lg">
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-base">{String(t('format.title'))}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <AutoSelectControl
          label={String(t('format.aspectRatio'))}
          value={aspectRatioPreference}
          options={aspectOptions}
          onChange={handleAspectRatioChange}
        />
        <AutoSelectControl
          label={String(t('format.color'))}
          value={colorModePreference}
          options={colorOptions}
          onChange={handleColorModeChange}
        />
      </CardContent>
    </Card>
  )
}

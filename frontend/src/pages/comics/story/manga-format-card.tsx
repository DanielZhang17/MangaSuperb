import { useAtom } from 'jotai'
import { useEffect, useMemo } from 'react'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DEFAULT_ASPECT_RATIOS } from '@/config/preferences'
import { usePreferences } from '@/hooks/use-preferences'
import { resolvePreferenceValue } from '@/lib/auto-preferences'
import type { AutoPreference, ColorMode } from '@/service/types'

import { aspectRatioAtom, currentComicOverridesAtom } from '../atoms'
import { AutoSelectControl } from '../components/auto-select-control'

const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  'black-white': 'Black and white',
  color: 'Color',
}

export function MangaFormatCard() {
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
      label: COLOR_MODE_LABELS[value] ?? value,
    }))
  ), [colorModes])

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
        <CardTitle className="text-base">Format</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <AutoSelectControl
          label="Aspect ratio"
          value={aspectRatioPreference}
          options={aspectOptions}
          onChange={handleAspectRatioChange}
        />
        <AutoSelectControl
          label="Color"
          value={colorModePreference}
          options={colorOptions}
          onChange={handleColorModeChange}
        />
      </CardContent>
    </Card>
  )
}

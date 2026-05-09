import { useAtom } from 'jotai'
import { useMemo } from 'react'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useI18n } from '@/hooks/use-i18n'
import { usePreferences } from '@/hooks/use-preferences'
import { resolvePreferenceValue } from '@/lib/auto-preferences'
import type { AutoPreference } from '@/service/types'

import { currentComicOverridesAtom } from '../atoms'
import { AutoSelectControl } from '../components/auto-select-control'

const LayoutVisual = ({ type }: { type: string }) => {
  const baseBoxClasses = 'bg-gray-400 rounded-sm'
  switch (type) {
    case '四宫格':
      return (
        <div className="grid grid-cols-2 gap-1 w-full h-full">
          <div className={baseBoxClasses}></div>
          <div className={baseBoxClasses}></div>
          <div className={baseBoxClasses}></div>
          <div className={baseBoxClasses}></div>
        </div>
      )
    case '左主右辅':
      return (
        <div className="flex gap-1 w-full h-full">
          <div className={`${baseBoxClasses} w-2/3`}></div>
          <div className="flex flex-col gap-1 w-1/3">
            <div className={`${baseBoxClasses} h-1/2`}></div>
            <div className={`${baseBoxClasses} h-1/2`}></div>
          </div>
        </div>
      )
    case '右侧长栏':
      return (
        <div className="flex gap-1 w-full h-full">
          <div className="flex flex-col gap-1 w-2/3">
            <div className={`${baseBoxClasses} h-1/2`}></div>
            <div className={`${baseBoxClasses} h-1/2`}></div>
          </div>
          <div className={`${baseBoxClasses} w-1/3`}></div>
        </div>
      )
    case '上下错列':
      return (
        <div className="flex flex-col gap-1 w-full h-full">
          <div className="flex gap-1 h-1/2">
            <div className={`${baseBoxClasses} w-1/3`}></div>
            <div className={`${baseBoxClasses} w-2/3`}></div>
          </div>
          <div className="flex gap-1 h-1/2">
            <div className={`${baseBoxClasses} w-2/3`}></div>
            <div className={`${baseBoxClasses} w-1/3`}></div>
          </div>
        </div>
      )
    default:
      return <div className="w-full h-full bg-gray-200 rounded-md"></div>
  }
}

export function MangaGridLayoutCard() {
  const { t } = useI18n('comics')
  const [overrides, setOverrides] = useAtom(currentComicOverridesAtom)
  const { layoutOptions, preferences } = usePreferences()
  const layoutLabels = useMemo<Record<string, string>>(() => ({
    'auto-grid': String(t('grid.4panel')),
    'grid-2x2': String(t('grid.4panel')),
    vertical: String(t('grid.leftMainRightMinor')),
    cinematic: String(t('grid.rightLongBar')),
    staggered: String(t('grid.staggered')),
  }), [t])
  const layouts = useMemo(() => (
    layoutOptions.map((value) => ({
      value,
      label: layoutLabels[value] ?? value,
    }))
  ), [layoutLabels, layoutOptions])
  const preferenceLayout = preferences?.fields?.page_layout
  const fallbackLayout = resolvePreferenceValue(preferenceLayout, layouts[0]?.value ?? 'auto-grid')
  const pageLayoutPreference = (overrides.page_layout ?? preferenceLayout ?? { mode: 'auto' }) as AutoPreference<string>
  const resolvedLayout = resolvePreferenceValue(pageLayoutPreference, fallbackLayout)

  const handleLayoutPreferenceChange = (nextPreference: AutoPreference<string>) => {
    setOverrides((prev: any) => ({
      ...prev,
      page_layout: nextPreference,
    }))
  }

  return (
    <Card className="rounded-lg">
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-base">{String(t('grid.title'))}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <AutoSelectControl
          label="Auto default"
          value={pageLayoutPreference}
          options={layouts}
          onChange={handleLayoutPreferenceChange}
        />
        <ToggleGroup
          type="single"
          value={resolvedLayout}
          onValueChange={(value) => {
            if (value) {
              handleLayoutPreferenceChange({ mode: 'manual', value })
            }
          }}
          className="grid w-full grid-cols-2 gap-2"
        >
          {layouts.map((layout) => (
            <ToggleGroupItem key={layout.value} value={layout.value} className="flex h-auto min-w-0 flex-col p-1.5">
              <div className="mb-2 aspect-[5/3] w-full rounded-md bg-gray-200 p-2">
                <LayoutVisual type={layout.label} />
              </div>
              <span className="text-xs leading-snug">{layout.label}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardContent>
    </Card>
  )
}

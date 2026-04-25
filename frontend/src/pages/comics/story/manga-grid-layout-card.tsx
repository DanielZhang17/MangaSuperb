import { useAtom } from 'jotai'
import toast from 'react-hot-toast'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useI18n } from '@/hooks/use-i18n'
import { usePreferences } from '@/hooks/use-preferences'
import { DEFAULT_LAYOUT_OPTIONS } from '@/config/preferences'
import { defaultLayoutAtom } from '../atoms'

const LayoutVisual = ({ layoutKey }: { layoutKey: string }) => {
  const baseBoxClasses = 'bg-gray-400 rounded-sm'
  switch (layoutKey) {
    case 'auto-grid':
    case 'grid-2x2':
      return (
        <div className="grid h-full w-full grid-cols-2 gap-1">
          <div className={baseBoxClasses} />
          <div className={baseBoxClasses} />
          <div className={baseBoxClasses} />
          <div className={baseBoxClasses} />
        </div>
      )
    case 'vertical':
      return (
        <div className="flex h-full w-full flex-col gap-1">
          <div className={`${baseBoxClasses} h-1/3`} />
          <div className={`${baseBoxClasses} h-1/3`} />
          <div className={`${baseBoxClasses} h-1/3`} />
        </div>
      )
    case 'cinematic':
      return (
        <div className="flex h-full w-full flex-col gap-1">
          <div className={`${baseBoxClasses} h-1/2`} />
          <div className="flex h-1/2 gap-1">
            <div className={`${baseBoxClasses} w-1/2`} />
            <div className={`${baseBoxClasses} w-1/2`} />
          </div>
        </div>
      )
    default:
      return <div className="h-full w-full rounded-md bg-gray-200"></div>
  }
}

export function MangaGridLayoutCard() {
  const { t } = useI18n('comics')
  const { layoutOptions: preferenceLayouts, update: updatePreferences } = usePreferences()
  const [defaultLayout, setDefaultLayout] = useAtom(defaultLayoutAtom)

  const layoutOptions = preferenceLayouts?.length
    ? preferenceLayouts
    : Array.from(DEFAULT_LAYOUT_OPTIONS)

  const resolvedLayout = layoutOptions.includes(defaultLayout)
    ? defaultLayout
    : layoutOptions[0]!

  const layoutLabels: Record<string, string> = {
    'auto-grid': String(t('grid.auto')),
    'grid-2x2': String(t('grid.grid2x2')),
    vertical: String(t('grid.vertical')),
    cinematic: String(t('grid.cinematic')),
  }

  return (
    <Card>
      <CardHeader className="p-4">
        <CardTitle className="text-center text-lg">{String(t('grid.title'))}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <ToggleGroup
          type="single"
          value={resolvedLayout}
          onValueChange={async (value) => {
            if (!value || !layoutOptions.includes(value)) return
            const previous = resolvedLayout
            setDefaultLayout(value)
            try {
              await updatePreferences({ default_layout: value })
            } catch (err: any) {
              setDefaultLayout(previous)
              const message = err?.response?.data?.error || String(t('grid.updateFailed'))
              toast.error(message)
            }
          }}
          className="grid grid-cols-2 xl:grid-cols-4 gap-2 w-fit mx-auto"
        >
          {layoutOptions.map((layoutKey) => (
            <ToggleGroupItem key={layoutKey} value={layoutKey} className="flex flex-col h-auto p-1">
              <div className="w-30 h-20 bg-gray-200 rounded-md mb-2 p-2">
                <LayoutVisual layoutKey={layoutKey} />
              </div>
              <span>{layoutLabels[layoutKey] ?? layoutKey}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardContent>
    </Card>
  )
}

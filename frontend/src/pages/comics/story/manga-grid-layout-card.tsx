import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useI18n } from '@/hooks/use-i18n'

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
  const layouts = [
    { key: 'grid.4panel', label: String(t('grid.4panel')) },
    { key: 'grid.leftMainRightMinor', label: String(t('grid.leftMainRightMinor')) },
    { key: 'grid.rightLongBar', label: String(t('grid.rightLongBar')) },
    { key: 'grid.staggered', label: String(t('grid.staggered')) },
  ]

  return (
    <Card>
      <CardHeader className="p-4">
        <CardTitle className="text-center text-lg">{String(t('grid.title'))}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <ToggleGroup
          type="single"
          defaultValue={String(t('grid.4panel'))}
          className="grid grid-cols-2 xl:grid-cols-4 gap-2 w-fit mx-auto"
        >
          {layouts.map((layout) => (
            <ToggleGroupItem key={layout.key} value={layout.label} className="flex flex-col h-auto p-1">
              <div className="w-30 h-20 bg-gray-200 rounded-md mb-2 p-2">
                <LayoutVisual type={layout.label} />
              </div>
              <span>{layout.label}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardContent>
    </Card>
  )
}

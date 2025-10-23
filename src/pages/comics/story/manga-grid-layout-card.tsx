import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

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
  const layouts = ['四宫格', '左主右辅', '右侧长栏', '上下错列']

  return (
    <Card>
      <CardHeader className="p-4">
        <CardTitle className="text-center text-lg">漫画网格布局</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <ToggleGroup
          type="single"
          defaultValue="四宫格"
          className="grid grid-cols-2 xl:grid-cols-4 gap-2 w-fit mx-auto"
        >
          {layouts.map((layout) => (
            <ToggleGroupItem key={layout} value={layout} className="flex flex-col h-auto p-1">
              <div className="w-30 h-20 bg-gray-200 rounded-md mb-2 p-2">
                <LayoutVisual type={layout} />
              </div>
              <span>{layout}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardContent>
    </Card>
  )
}

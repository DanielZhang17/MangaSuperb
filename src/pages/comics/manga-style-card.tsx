import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export function MangaStyleCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center">漫画风格</CardTitle>
      </CardHeader>
      <CardContent>
        <ToggleGroup type="single" defaultValue="日漫" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ToggleGroupItem value="日漫" className="flex flex-col h-auto p-2">
            <div className="w-30 h-24 bg-gray-200 rounded-md mb-2"></div>
            <span>日漫</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="美漫" className="flex flex-col h-auto p-2">
            <div className="w-30 h-24 bg-gray-200 rounded-md mb-2"></div>
            <span>美漫</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="国漫" className="flex flex-col h-auto p-2">
            <div className="w-30 h-24 bg-gray-200 rounded-md mb-2"></div>
            <span>国漫</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="韩漫" className="flex flex-col h-auto p-2">
            <div className="w-30 h-24 bg-gray-200 rounded-md mb-2"></div>
            <span>韩漫</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </CardContent>
    </Card>
  )
}

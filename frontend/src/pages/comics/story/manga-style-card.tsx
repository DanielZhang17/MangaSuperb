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
      <CardHeader className="p-4">
        <CardTitle className="text-center text-lg">漫画风格</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {/* 在超大屏下让选项区域自适应宽度并水平居中 */}
        <ToggleGroup
          type="single"
          defaultValue="日漫"
          className="grid grid-cols-2 xl:grid-cols-4 gap-2 w-fit mx-auto"
        >
          <ToggleGroupItem value="日漫" className="flex flex-col h-auto p-1">
            <div className="w-30 h-16 bg-gray-200 rounded-md mb-2"></div>
            <span>日漫</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="美漫" className="flex flex-col h-auto p-1">
            <div className="w-30 h-16 bg-gray-200 rounded-md mb-2"></div>
            <span>美漫</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="国漫" className="flex flex-col h-auto p-1">
            <div className="w-30 h-16 bg-gray-200 rounded-md mb-2"></div>
            <span>国漫</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="韩漫" className="flex flex-col h-auto p-1">
            <div className="w-30 h-16 bg-gray-200 rounded-md mb-2"></div>
            <span>韩漫</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </CardContent>
    </Card>
  )
}

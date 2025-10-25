import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useI18n } from '@/hooks/use-i18n'

export function MangaStyleCard() {
  const { t } = useI18n('comics')

  return (
    <Card>
      <CardHeader className="p-4">
        <CardTitle className="text-center text-lg">{String(t('style.title'))}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {/* 在超大屏下让选项区域自适应宽度并水平居中 */}
        <ToggleGroup
          type="single"
          defaultValue={String(t('home:category.jp'))}
          className="grid grid-cols-2 xl:grid-cols-4 gap-2 w-fit mx-auto"
        >
          <ToggleGroupItem value={String(t('home:category.jp'))} className="flex flex-col h-auto p-1">
            <div className="w-30 h-16 bg-gray-200 rounded-md mb-2"></div>
            <span>{String(t('home:category.jp'))}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value={String(t('home:category.us'))} className="flex flex-col h-auto p-1">
            <div className="w-30 h-16 bg-gray-200 rounded-md mb-2"></div>
            <span>{String(t('home:category.us'))}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="CN" className="flex flex-col h-auto p-1">
            <div className="w-30 h-16 bg-gray-200 rounded-md mb-2"></div>
            <span>CN</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="KR" className="flex flex-col h-auto p-1">
            <div className="w-30 h-16 bg-gray-200 rounded-md mb-2"></div>
            <span>KR</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </CardContent>
    </Card>
  )
}

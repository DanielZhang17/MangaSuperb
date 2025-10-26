import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useI18n } from '@/hooks/use-i18n'
import { proxiedStatic } from '@/lib/utils'

export function MangaStyleCard() {
  const { t } = useI18n('comics')

  // 预设四种风格示意图，走存储代理
  const base = 'https://storage.mangasuperb.anranz.xyz/static/'
  const styleImages = {
    jp: proxiedStatic(base + encodeURIComponent('日漫风1.png')),
    us: proxiedStatic(base + encodeURIComponent('美式漫风1.png')),
    cn: proxiedStatic(base + encodeURIComponent('国漫风1.png')),
    kr: proxiedStatic(base + encodeURIComponent('韩漫风1.png')),
  }

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
            <div
              className="w-30 h-16 rounded-md mb-2 bg-center bg-cover"
              style={{ backgroundImage: `url(${styleImages.jp})` }}
            />
            <span>{String(t('home:category.jp'))}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value={String(t('home:category.us'))} className="flex flex-col h-auto p-1">
            <div
              className="w-30 h-16 rounded-md mb-2 bg-center bg-cover"
              style={{ backgroundImage: `url(${styleImages.us})` }}
            />
            <span>{String(t('home:category.us'))}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="CN" className="flex flex-col h-auto p-1">
            <div
              className="w-30 h-16 rounded-md mb-2 bg-center bg-cover"
              style={{ backgroundImage: `url(${styleImages.cn})` }}
            />
            <span>CN</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="KR" className="flex flex-col h-auto p-1">
            <div
              className="w-30 h-16 rounded-md mb-2 bg-center bg-cover"
              style={{ backgroundImage: `url(${styleImages.kr})` }}
            />
            <span>KR</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </CardContent>
    </Card>
  )
}

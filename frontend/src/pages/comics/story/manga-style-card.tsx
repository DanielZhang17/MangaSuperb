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
    <Card className="rounded-lg">
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-base">{String(t('style.title'))}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <ToggleGroup
          type="single"
          defaultValue={String(t('home:category.jp'))}
          className="grid w-full grid-cols-2 gap-2"
        >
          <ToggleGroupItem value={String(t('home:category.jp'))} className="flex h-auto min-w-0 flex-col p-1.5">
            <div
              className="mb-2 aspect-[5/3] w-full rounded-md bg-cover bg-center"
              style={{ backgroundImage: `url(${styleImages.jp})` }}
            />
            <span className="text-xs">{String(t('home:category.jp'))}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value={String(t('home:category.us'))} className="flex h-auto min-w-0 flex-col p-1.5">
            <div
              className="mb-2 aspect-[5/3] w-full rounded-md bg-cover bg-center"
              style={{ backgroundImage: `url(${styleImages.us})` }}
            />
            <span className="text-xs">{String(t('home:category.us'))}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="CN" className="flex h-auto min-w-0 flex-col p-1.5">
            <div
              className="mb-2 aspect-[5/3] w-full rounded-md bg-cover bg-center"
              style={{ backgroundImage: `url(${styleImages.cn})` }}
            />
            <span className="text-xs">CN</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="KR" className="flex h-auto min-w-0 flex-col p-1.5">
            <div
              className="mb-2 aspect-[5/3] w-full rounded-md bg-cover bg-center"
              style={{ backgroundImage: `url(${styleImages.kr})` }}
            />
            <span className="text-xs">KR</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </CardContent>
    </Card>
  )
}

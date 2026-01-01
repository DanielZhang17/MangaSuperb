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
import { proxiedStatic } from '@/lib/utils'
import { styleAtom } from '../atoms'

const STYLE_MAP = {
  jp: 'Classic manga black and white linework with Japanese manga aesthetics',
  us: 'American comic book style with bold lines and vibrant colors',
  cn: 'Chinese manhua style with elegant brushwork and detailed backgrounds',
  kr: 'Korean manhwa style with modern digital coloring and clean lines',
}

export function MangaStyleCard() {
  const { t } = useI18n('comics')
  const [style, setStyle] = useAtom(styleAtom)
  const { update: updatePreferences } = usePreferences()

  // 预设四种风格示意图，走存储代理
  const base = 'https://storage.mangasuperb.anranz.xyz/static/'
  const styleImages = {
    jp: proxiedStatic(base + encodeURIComponent('日漫风1.png')),
    us: proxiedStatic(base + encodeURIComponent('美式漫风1.png')),
    cn: proxiedStatic(base + encodeURIComponent('国漫风1.png')),
    kr: proxiedStatic(base + encodeURIComponent('韩漫风1.png')),
  }

  const getCurrentStyleKey = () => {
    if (style.includes('Japanese') || style.includes('manga black and white')) return 'jp'
    if (style.includes('American') || style.includes('comic book')) return 'us'
    if (style.includes('Chinese') || style.includes('manhua')) return 'cn'
    if (style.includes('Korean') || style.includes('manhwa')) return 'kr'
    return 'jp'
  }

  const currentStyleKey = getCurrentStyleKey()

  return (
    <Card>
      <CardHeader className="p-4">
        <CardTitle className="text-center text-lg">{String(t('style.title'))}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {/* 在超大屏下让选项区域自适应宽度并水平居中 */}
        <ToggleGroup
          type="single"
          value={currentStyleKey}
          onValueChange={(value) => {
            if (value && value in STYLE_MAP) {
              const nextStyle = STYLE_MAP[value as keyof typeof STYLE_MAP]
              const previous = style
              setStyle(nextStyle)
              updatePreferences({ selected_style: nextStyle }).catch((err: any) => {
                setStyle(previous)
                const message = err?.response?.data?.error || String(t('style.updateFailed'))
                toast.error(message)
              })
            }
          }}
          className="grid grid-cols-2 xl:grid-cols-4 gap-2 w-fit mx-auto"
        >
          <ToggleGroupItem value="jp" className="flex flex-col h-auto p-1">
            <div
              className="w-30 h-16 rounded-md mb-2 bg-center bg-cover"
              style={{ backgroundImage: `url(${styleImages.jp})` }}
            />
            <span>{String(t('home:category.jp'))}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="us" className="flex flex-col h-auto p-1">
            <div
              className="w-30 h-16 rounded-md mb-2 bg-center bg-cover"
              style={{ backgroundImage: `url(${styleImages.us})` }}
            />
            <span>{String(t('home:category.us'))}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="cn" className="flex flex-col h-auto p-1">
            <div
              className="w-30 h-16 rounded-md mb-2 bg-center bg-cover"
              style={{ backgroundImage: `url(${styleImages.cn})` }}
            />
            <span>CN</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="kr" className="flex flex-col h-auto p-1">
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

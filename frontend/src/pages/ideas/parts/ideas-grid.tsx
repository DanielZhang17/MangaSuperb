import useSWR from 'swr'

import { ComicsApi } from '@/apis/comics'
import { ShareCard } from '@/components/common/share-card'
import { Card } from '@/components/ui/card'
import useAuth from '@/hooks/use-auth'
import { useI18n } from '@/hooks/use-i18n'
import { proxiedStatic } from '@/lib/utils'

export default function IdeasGrid() {
  const { user } = useAuth()
  const { t } = useI18n(['me'])

  const { data, isLoading, error } = useSWR('comics:list:mine', () => ComicsApi.list())
  const comics = data?.comics ?? []

  return (
    <div className="grid gap-4 justify-items-start md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      {isLoading && Array.from({ length: 6 }).map((_, i) => (
        <Card key={`skeleton-${i}`} className="overflow-hidden border-none bg-transparent p-0 shadow-none">
          <div className="aspect-square w-full animate-pulse rounded-2xl bg-muted" />
        </Card>
      ))}

      {error && (
        <div className="col-span-full text-sm text-destructive">加载失败，请稍后重试。</div>
      )}

      {!isLoading && !error && comics.map((c) => {
        const rawImage: string | null = (c as any).cover_image_url || (c as any).image_url || null
        const img = proxiedStatic(rawImage)

        return (
          <ShareCard
            key={c.id}
            share={{
              id: String(c.id),
              message: c.title || '未命名',
              name: user?.username || String(t('me.username.guest')),
            }}
            imageUrl={img || undefined}
            likeCount={typeof c.like_count === 'number' ? c.like_count : 0}
          />
        )
      })}
    </div>
  )
}

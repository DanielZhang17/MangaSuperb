import { useMemo, useState } from 'react'
import useSWR from 'swr'

import { ComicsApi } from '@/apis/comics'
import { ShareCard } from '@/components/common/share-card'
import { Card } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { proxiedStatic } from '@/lib/utils'
import type { IComic } from '@/service/types'

export default function HomePage() {
  // 公共漫画列表 → 用 ShareCard 渲染
  const { data, isLoading, error } = useSWR('comics:public', () => ComicsApi.listPublic())

  // 分类 Toggle（多选）：日漫、美漫、国漫、韩漫
  const categories = [
    { key: 'jp', label: '日漫' },
    { key: 'us', label: '美漫' },
    { key: 'cn', label: '国漫' },
    { key: 'kr', label: '韩漫' },
  ] as const

  const [selectedCategories, setSelectedCategories] = useState<string[]>(categories.map((c) => c.key))

  const shareItems = useMemo(() => {
    const list: IComic[] = data?.comics ?? []

    return list.map((c) => {
      const rawImage: string | null = (c as any).cover_image_url || (c as any).image_url || null
      const img = proxiedStatic(rawImage || undefined)

      const username: string = (c as any)?.user?.username
        || (c as any)?.author?.username
        || (c as any)?.owner?.username
        || '匿名'

      return {
        id: String(c.id),
        message: c.title || `漫画 #${c.id}`,
        name: username,
        imageUrl: img || undefined,
        likeCount: typeof c.like_count === 'number' ? c.like_count : 0,
      }
    })
  }, [data])

  // 精选漫画：只渲染几张固定图片（走存储代理），并标注分类用于过滤
  const featuredImages = useMemo(() => {
    const base = 'https://storage.mangasuperb.anranz.xyz/static/'
    const entries = [
      { name: '首页展示日漫画1.png', category: 'jp' },
      { name: '首页展示日漫画2.png', category: 'us' },
      { name: '首页展示日漫画3.png', category: 'cn' },
      { name: '首页展示日漫画4.png', category: 'kr' },
    ]

    return entries.map((e) => ({
      src: proxiedStatic(base + encodeURIComponent(e.name)),
      category: e.category,
    }))
  }, [])

  return (
    <div className="space-y-10">
      <section className="space-y-6">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">精选漫画</h2>
          <ToggleGroup
            type="multiple"
            value={selectedCategories}
            variant="outline"
            spacing={2}
            onValueChange={setSelectedCategories}
            className="flex w-fit gap-2"
          >
            {categories.map((c) => (
              <ToggleGroupItem
                key={c.key}
                value={c.key}
                className="rounded-full px-5 py-2 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {c.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {featuredImages
            .filter((f) => selectedCategories.includes(f.category))
            .map((f, idx) => (
              <Card
                key={`featured-${idx}`}
                className="overflow-hidden border-none bg-transparent p-0 shadow-none"
              >
                <div
                  className="aspect-4/3 w-full rounded-2xl bg-muted"
                  style={{
                    backgroundImage: `url(${f.src})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                  aria-label={`featured-${idx + 1}`}
                />
              </Card>
            ))}
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-xl font-semibold">创作分享</h2>
        <div className="grid gap-4 justify-items-start md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {isLoading && Array.from({ length: 6 }).map((_, i) => (
            <Card key={`skeleton-${i}`} className="overflow-hidden border-none bg-transparent p-0 shadow-none">
              <div className="aspect-square w-full animate-pulse rounded-2xl bg-muted" />
            </Card>
          ))}

          {error && (
            <div className="col-span-full text-sm text-destructive">加载漫画失败，请稍后重试。</div>
          )}

          {!isLoading && !error && shareItems.map((s) => (
            <ShareCard
              key={s.id}
              share={{ id: s.id, message: s.message, name: s.name }}
              imageUrl={s.imageUrl}
              likeCount={s.likeCount}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

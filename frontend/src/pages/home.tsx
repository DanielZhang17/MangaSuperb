import { useMemo, useState } from 'react'
import useSWR from 'swr'

import { ComicsApi } from '@/apis/comics'
import { ShareCard } from '@/components/common/share-card'
import { Card } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type { IComic } from '@/service/types'

const comicCategories = ['日漫', '美漫风', '宫崎骏']

// Heuristic: map comic.style_description to one of our UI categories
function inferCategory(comic: IComic): string {
  const style = (comic.style_description || '').toLowerCase()
  if (/宫崎骏|miyazaki/.test(style)) return '宫崎骏'
  if (/美漫|noir|ink|comic/.test(style)) return '美漫风'

  return '日漫'
}

const categoryCoverStyles: Record<string, string> = {
  日漫: 'bg-gradient-to-br from-pink-200/60 via-pink-100 to-white',
  美漫风: 'bg-gradient-to-br from-sky-200/60 via-sky-100 to-white',
  宫崎骏: 'bg-gradient-to-br from-amber-200/60 via-amber-100 to-white',
}

const creatorShares = [
  {
    id: 'share-one',
    message: '我们到了, 现在在市场前面，Maxi：是吗？我们也在市场前面。',
    name: 'Kimi',
  },
  {
    id: 'share-two',
    message: '我们到了, 现在在市场前面，Maxi：是吗？我们也在市场前面。',
    name: 'Kimi',
  },
  {
    id: 'share-three',
    message: '我们到了, 现在在市场前面，Maxi：是吗？我们也在市场前面。',
    name: 'Kimi',
  },
  {
    id: 'share-four',
    message: '我们到了, 现在在市场前面，Maxi：是吗？我们也在市场前面。',
    name: 'Kimi',
  },
]

export default function HomePage() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>(comicCategories)

  // SWR: fetch current user's comics
  const { data, isLoading, error } = useSWR('comics:list', () => ComicsApi.list())

  const uiItems = useMemo(() => {
    const list: IComic[] = data?.comics ?? []

    return list.map((c) => ({
      id: String(c.id),
      category: inferCategory(c),
      cover: c.cover_image_url || null,
      title: c.title || `漫画 #${c.id}`,
    }))
  }, [data])

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
            {comicCategories.map((category) => (
              <ToggleGroupItem
                key={category}
                value={category}
                className="rounded-full px-5 py-2 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {category}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {isLoading && Array.from({ length: 6 }).map((_, i) => (
            <Card key={`skeleton-${i}`} className="overflow-hidden border-none bg-transparent p-0 shadow-none">
              <div className="aspect-4/3 w-full animate-pulse rounded-2xl bg-muted" />
            </Card>
          ))}

          {error && (
            <div className="col-span-full text-sm text-destructive">加载漫画失败，请稍后重试。</div>
          )}

          {!isLoading && !error && uiItems
            .filter((item) => selectedCategories.includes(item.category))
            .map((item) => (
              <Card key={item.id} className="overflow-hidden border-none bg-transparent p-0 shadow-none">
                <div
                  className={cn(
                    'aspect-4/3 w-full rounded-2xl bg-muted',
                    categoryCoverStyles[item.category] ?? 'bg-muted',
                  )}
                  style={item.cover ? {
                    backgroundImage: `url(${item.cover})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  } : undefined}
                  aria-label={item.title}
                />
              </Card>
            ))}
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-xl font-semibold">创作分享</h2>
        <div className="grid gap-4 justify-items-start md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {creatorShares.map((share) => (
            <ShareCard
              share={share}
              key={share.id}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

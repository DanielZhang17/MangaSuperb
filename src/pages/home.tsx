import { Star } from 'lucide-react'
import { useState } from 'react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

const comicCategories = ['日漫', '美漫风', '宫崎骏']

const featuredComics = [
  {
    category: '日漫',
    id: 'kimi-market',
  },
  {
    category: '日漫',
    id: 'mika-dream',
  },
  {
    category: '美漫风',
    id: 'rex-cosmos',
  },
  {
    category: '美漫风',
    id: 'lulu-forest',
  },
  {
    category: '宫崎骏',
    id: 'gigi-forest',
  },
  {
    category: '宫崎骏',
    id: 'momo-sky',
  },
]

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
          {featuredComics
            .filter((item) => selectedCategories.includes(item.category))
            .map((item) => (
              <Card key={item.id} className="overflow-hidden border-none bg-transparent p-0 shadow-none">
                <div
                  className={cn(
                    'aspect-4/3 w-full rounded-2xl bg-muted',
                    categoryCoverStyles[item.category] ?? 'bg-muted',
                  )}
                />
              </Card>
            ))}
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-xl font-semibold">创作分享</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {creatorShares.map((share) => (
            <Card key={share.id} className="flex h-full flex-col gap-4 p-4">
              <div className="aspect-square w-full rounded-xl bg-muted" />
              <CardContent className="flex items-start gap-3 p-0">
                <CardDescription className="text-sm leading-relaxed">
                  {share.message}
                </CardDescription>
              </CardContent>
              <CardFooter className="mt-auto flex items-center justify-between gap-2 p-0 text-xs text-muted-foreground">
                <span className='flex items-center justify-center gap-2'>
                  <Avatar>
                    <AvatarFallback>{share.name.slice(0, 1)}</AvatarFallback>
                  </Avatar>
                  {share.name}
                </span>
                <div className="flex items-center gap-3">
                  <Star className="size-4" />
                  <span>0</span>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}

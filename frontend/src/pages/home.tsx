import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import useSWR from 'swr'

import { ComicsApi } from '@/apis/comics'
import { ShareCard } from '@/components/common/share-card'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { proxiedStatic } from '@/lib/utils'
import type { IComic } from '@/service/types'

type LikeState = Record<string, { liked: boolean; count: number }>
type LikePendingState = Record<string, boolean>

export default function HomePage() {
  // 公共漫画列表 → 用 ShareCard 渲染
  const { data, isLoading, error, mutate } = useSWR('comics:public', () => ComicsApi.listPublic())
  const navigate = useNavigate()
  const location = useLocation()

  // 分类 Toggle（多选）：日漫、美漫、国漫、韩漫
  const categories = [
    { key: 'jp', label: '日漫' },
    { key: 'us', label: '美漫' },
    { key: 'cn', label: '国漫' },
    { key: 'kr', label: '韩漫' },
  ] as const

  const [selectedCategories, setSelectedCategories] = useState<string[]>(categories.map((c) => c.key))

  const [likeState, setLikeState] = useState<LikeState>({})
  const [likePending, setLikePending] = useState<LikePendingState>({})

  const [selectedComic, setSelectedComic] = useState<number | null>(null)
  const [comicPages, setComicPages] = useState<any[]>([])
  const [loadingPages, setLoadingPages] = useState(false)

  const redirectToAuth = (message?: string) => {
    toast.error(message || '请先登录后再继续')
    navigate('/auth', { state: { from: location }, replace: false })
  }

  useEffect(() => {
    const list: IComic[] = data?.comics ?? []
    if (!list.length) {
      setLikeState({})
      return
    }

    setLikeState((prev) => {
      const next: LikeState = {}
      for (const comic of list) {
        const id = String(comic.id)
        const serverCount = typeof comic.like_count === 'number' ? comic.like_count : prev[id]?.count ?? 0
        const serverLikedRaw = (comic as any)?.user_liked
        const serverLiked = typeof serverLikedRaw === 'boolean' ? Boolean(serverLikedRaw) : undefined
        const previous = prev[id]
        next[id] = {
          liked: serverLiked ?? previous?.liked ?? false,
          count: serverCount,
        }
      }
      return next
    })
  }, [data])

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

  const handleToggleLike = async (id: string) => {
    const numericId = Number(id)
    if (Number.isNaN(numericId)) return

    const entry = likeState[id] ?? { liked: false, count: shareItems.find((s) => s.id === id)?.likeCount ?? 0 }
    const targetLike = !entry.liked
    setLikePending((prev) => ({ ...prev, [id]: true }))

    try {
      const res = targetLike
        ? await ComicsApi.like(numericId)
        : await ComicsApi.unlike(numericId)
      const nextCount = typeof res?.like_count === 'number'
        ? res.like_count
        : typeof (res?.comic?.like_count) === 'number'
          ? res.comic.like_count
          : Math.max(0, entry.count + (targetLike ? 1 : -1))
      setLikeState((prev) => ({
        ...prev,
        [id]: {
          liked: targetLike,
          count: nextCount,
        },
      }))
      mutate()
    } catch (err: any) {
      if (err?.response?.status === 401) {
        redirectToAuth('请先登录后再操作')
      } else {
        toast.error(err?.message || (targetLike ? '点赞失败，请稍后重试' : '取消点赞失败，请稍后重试'))
      }
    } finally {
      setLikePending((prev) => {
        const { [id]: _unused, ...rest } = prev
        return rest
      })
    }
  }

  const handleCardClick = async (comicId: number) => {
    setSelectedComic(comicId)
    setLoadingPages(true)
    try {
      const imagesRes = await ComicsApi.listImages(comicId)
      const pages = Array.isArray((imagesRes as any)?.pages) ? (imagesRes as any).pages : []
      setComicPages(pages.filter((p: any) => p?.image_url).sort((a: any, b: any) =>
        (a?.page_number ?? 0) - (b?.page_number ?? 0)
      ))
    } catch (err: any) {
      if (err?.response?.status === 401) {
        setSelectedComic(null)
        setComicPages([])
        redirectToAuth('please login to view the manga')
      } else {
        toast.error(err?.message || '加载漫画页面失败')
        setComicPages([])
      }
    } finally {
      setLoadingPages(false)
    }
  }

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
            className="flex flex-wrap gap-2"
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
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
              likeCount={likeState[s.id]?.count ?? s.likeCount}
              liked={likeState[s.id]?.liked ?? false}
              likePending={Boolean(likePending[s.id])}
              onToggleLike={() => handleToggleLike(s.id)}
              onClick={() => handleCardClick(Number(s.id))}
            />
          ))}
        </div>
      </section>

      <Dialog open={selectedComic !== null} onOpenChange={(open) => {
        if (!open) {
          setSelectedComic(null)
          setComicPages([])
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>漫画浏览</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {loadingPages && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                加载中...
              </div>
            )}
            {!loadingPages && comicPages.length === 0 && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                暂无页面
              </div>
            )}
            {!loadingPages && comicPages.map((page: any) => (
              <div key={page.page_id || page.page_number} className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">
                  第 {page.page_number} 页
                </div>
                <img
                  src={proxiedStatic(page.image_url)}
                  alt={`Page ${page.page_number}`}
                  className="w-full rounded-lg"
                />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

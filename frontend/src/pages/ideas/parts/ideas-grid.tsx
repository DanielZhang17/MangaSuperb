import { Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import useSWR from 'swr'

import { ComicsApi } from '@/apis/comics'
import { ShareCard } from '@/components/common/share-card'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import useAuth from '@/hooks/use-auth'
import { useI18n } from '@/hooks/use-i18n'
import { proxiedStatic } from '@/lib/utils'

export default function IdeasGrid() {
  const { user } = useAuth()
  const { t } = useI18n(['me'])

  const { data, isLoading, error } = useSWR('comics:list:mine', () => ComicsApi.list())
  const comics = data?.comics ?? []

  const toAbsoluteStorage = (url?: string | null) => {
    if (!url) return ''
    const storage = 'https://storage.mangasuperb.anranz.xyz'
    // If already absolute to storage, keep
    if (/^https?:\/\//i.test(url)) return url
    // If proxied path like /static/... or /manga/..., prefix storage origin
    if (url.startsWith('/static') || url.startsWith('/manga')) return `${storage}${url}`
    
    return url
  }

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

        const proxied = img || undefined
        const absolute = toAbsoluteStorage(rawImage)

        const handleCopy = async () => {
          try {
            await navigator.clipboard.writeText(absolute)
            toast.success('链接已复制')
          } catch (err: any) {
            toast.error(err?.message || '复制失败')
          }
        }

        const handlePublish = async () => {
          try {
            await ComicsApi.publish(Number(c.id), { make_public: true })
            toast.success('已发布')
          } catch (err: any) {
            toast.error(err?.message || '发布失败')
          }
        }

        return (
          <ShareCard
            key={c.id}
            share={{
              id: String(c.id),
              message: c.title || '未命名',
              name: user?.username || String(t('me.username.guest')),
            }}
            imageUrl={proxied}
            likeCount={typeof c.like_count === 'number' ? c.like_count : 0}
            leftExtra={(
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="icon-sm" variant="secondary" aria-label="分享至">
                    <Upload className="size-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>分享至</DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-3 gap-3 pt-2">
                    <a
                      href={proxied}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-col items-center gap-2 rounded-md border p-3 text-sm hover:bg-accent"
                    >
                      保存本地
                    </a>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="flex flex-col items-center gap-2 rounded-md border p-3 text-sm hover:bg-accent"
                    >
                      复制链接
                    </button>
                    <button
                      type="button"
                      onClick={handlePublish}
                      className="flex flex-col items-center gap-2 rounded-md border p-3 text-sm hover:bg-accent"
                    >
                      发布
                    </button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          />
        )
      })}
    </div>
  )
}

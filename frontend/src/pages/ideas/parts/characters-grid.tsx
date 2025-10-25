import { Image as ImageIcon, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCharactersList } from '@/hooks/use-characters'

function StatusBadge({ status }: { status?: string }) {
  const variant = (() => {
    switch (status) {
      case 'ready':
        return 'default'
      case 'pending':
        return 'secondary'
      case 'failed':
      case 'error':
        return 'destructive'
      default:
        return 'outline'
    }
  })()

  return <Badge variant={variant as any}>{status ?? 'unknown'}</Badge>
}

export default function CharactersGrid() {
  const { characters, loading, error, refresh } = useCharactersList()
  const [tries, setTries] = useState(0)
  const timerRef = useRef<number | null>(null)
  const MAX_TRIES = 40 // ~2 分钟（40 * 3s）

  // 当存在 pending 项目时，轻量轮询列表刷新，直到 ready/failed 或超时
  useEffect(() => {
    const hasPending = characters.some((c) => c.image_status === 'pending' && !c.image_url)

    // 清理已有定时器
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (!loading && hasPending && tries < MAX_TRIES) {
      timerRef.current = window.setInterval(async () => {
        await refresh()
        setTries((t) => t + 1)
      }, 3000)
    }

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characters, loading])

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold text-foreground/80">我的人物</div>
        <Button variant="ghost" size="sm" onClick={() => refresh()} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" /> 刷新
        </Button>
      </div>

      {loading && <div className="text-sm text-muted-foreground">加载中...</div>}
      {error && (
        <div className="text-sm text-destructive">加载失败：{(error as any)?.message ?? 'Unknown error'}</div>
      )}

      {!loading && !error && characters.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          暂无人 物，去创建一个吧！
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {characters.map((c) => (
          <Card key={c.id} className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center justify-between">
                <span className="truncate" title={c.name}>
                  {c.name}
                </span>
                <StatusBadge status={c.image_status} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={
                  `aspect-video w-full overflow-hidden rounded-md bg-muted flex items-center justify-center ${
                    !c.image_url && c.image_status === 'pending' ? 'animate-pulse' : ''
                  }`
                }
              >
                {c.image_url ? (
                  <img src={c.image_url} alt={c.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground text-xs">
                    <ImageIcon className="h-8 w-8 mb-1" />
                    {c.image_status === 'pending' ? '生成中…' : '暂无图片'}
                  </div>
                )}
              </div>
              {c.description && (
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground" title={c.description}>
                  {c.description}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

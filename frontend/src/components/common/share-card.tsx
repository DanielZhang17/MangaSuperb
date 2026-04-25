
import { Heart, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent, CardDescription, CardFooter } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ShareCardProps {
  share: {
    id: string
    message: string
    name: string
  }
  imageUrl?: string | null
  likeCount?: number
  className?: string
  leftExtra?: ReactNode // 在右侧操作区（星号左侧）插入自定义元素
  liked?: boolean
  onToggleLike?: () => void
  likePending?: boolean
  onClick?: () => void
}

export function ShareCard({
  share,
  imageUrl,
  likeCount,
  className,
  leftExtra,
  liked = false,
  onToggleLike,
  likePending = false,
  onClick,
}: ShareCardProps) {
  const count = typeof likeCount === 'number' ? likeCount : 0

  const likeButton = onToggleLike ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onToggleLike()
      }}
      disabled={likePending}
      aria-pressed={liked}
      aria-label={liked ? '取消点赞' : '点赞'}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 sm:px-3 sm:py-1 text-xs transition-colors min-h-[36px] sm:min-h-0',
        liked
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border bg-background text-muted-foreground hover:text-foreground',
        likePending && 'opacity-70',
      )}
    >
      {likePending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Heart
          className={cn('size-4', liked && 'text-primary')}
          fill={liked ? 'currentColor' : 'none'}
        />
      )}
      <span>{count}</span>
    </button>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Heart className="size-4" />
      <span>{count}</span>
    </span>
  )

  return (
    <Card
      key={share.id}
      className={cn(
        'flex h-full w-full flex-col gap-3 sm:gap-4 p-3 sm:p-4',
        onClick && 'cursor-pointer transition-shadow hover:shadow-lg',
        className
      )}
      onClick={onClick}
    >
      <div
        className="aspect-square w-full rounded-xl bg-muted"
        style={imageUrl ? {
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : undefined}
      />
      <CardContent className="flex items-start gap-2 sm:gap-3 p-0">
        <CardDescription className="text-xs sm:text-sm leading-relaxed">
          {share.message}
        </CardDescription>
      </CardContent>
      <CardFooter className="mt-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-2 p-0 text-xs text-muted-foreground">
        <span className="flex items-center justify-center gap-2 min-w-0">
          <Avatar className="h-6 w-6 sm:h-8 sm:w-8">
            <AvatarFallback className="text-xs">{share.name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <span className="truncate">{share.name}</span>
        </span>
        <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2 w-full sm:w-auto">
          {leftExtra}
          {likeButton}
        </div>
      </CardFooter>
    </Card>
  )
}

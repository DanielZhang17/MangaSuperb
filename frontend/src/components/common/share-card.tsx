
import { Star } from 'lucide-react'
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
}

export function ShareCard({ share, imageUrl, likeCount, className, leftExtra }: ShareCardProps) {
  return (
    <Card key={share.id} className={cn('flex h-full w-full flex-col gap-3 rounded-lg p-3', className)}>
      <div
        className="aspect-square w-full rounded-md bg-muted"
        style={imageUrl ? {
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : undefined}
      />
      <CardContent className="flex items-start gap-3 p-0">
        <CardDescription className="line-clamp-2 min-h-10 break-words text-sm leading-relaxed">
          {share.message}
        </CardDescription>
      </CardContent>
      <CardFooter className="mt-auto flex flex-col gap-3 p-0 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span className="flex min-w-0 items-center gap-2">
          <Avatar className="size-8">
            <AvatarFallback>{share.name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <span className="truncate">{share.name}</span>
        </span>
        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
          {leftExtra}
          <span className="inline-flex items-center gap-1">
            <Star className="size-4" />
            <span>{typeof likeCount === 'number' ? likeCount : 0}</span>
          </span>
        </div>
      </CardFooter>
    </Card>
  )
}

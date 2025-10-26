
import { Star } from 'lucide-react'
import type { ReactNode } from 'react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent, CardDescription, CardFooter } from '@/components/ui/card'

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
    <Card key={share.id} className={`flex h-full flex-col gap-4 p-4 ${className}`}>
      <div
        className="aspect-square w-full rounded-xl bg-muted"
        style={imageUrl ? {
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : undefined}
      />
      <CardContent className="flex items-start gap-3 p-0">
        <CardDescription className="text-sm leading-relaxed">
          {share.message}
        </CardDescription>
      </CardContent>
      <CardFooter className="mt-auto flex items-center justify-between gap-2 p-0 text-xs text-muted-foreground">
        <span className="flex items-center justify-center gap-2">
          <Avatar>
            <AvatarFallback>{share.name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          {share.name}
        </span>
        <div className="flex items-center gap-3">
          {leftExtra}
          <Star className="size-4" />
          <span>{typeof likeCount === 'number' ? likeCount : 0}</span>
        </div>
      </CardFooter>
    </Card>
  )
}

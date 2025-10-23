import { Link, useLocation } from 'react-router'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export function InfoCard({ collapsed }: { collapsed: boolean }) {
  const location = useLocation()
  const isActive = location.pathname.startsWith('/me')

  return (
    <div className={cn('mt-4', collapsed ? 'px-2' : 'px-4')}>
      <Link
        to="/me"
        className={cn(
          'flex w-full items-center gap-3 rounded-lg p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          isActive
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'bg-card text-card-foreground hover:bg-accent',
          collapsed && 'justify-center',
        )}
      >
        <Avatar className="size-9">
          <AvatarImage src="https://github.com/shadcn.png" alt="Sayori" />
          <AvatarFallback>SY</AvatarFallback>
        </Avatar>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Sayori</span>
            <span className="text-xs text-muted-foreground">
              sayori@example.com
            </span>
          </div>
        )}
      </Link>
    </div>
  )
}
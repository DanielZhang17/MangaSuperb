import { LogIn, LogOut, User } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth } from '@/hooks/use-auth'
import { cn, getAvatarUrl } from '@/lib/utils'

export function InfoCard({ collapsed }: { collapsed: boolean }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const isActive = location.pathname.startsWith('/me')
  const { user, logout, logoutState } = useAuth()

  const username = user?.username ?? '未登录'
  const fallback = (username || 'U').slice(0, 2).toUpperCase()
  const avatarUrl = getAvatarUrl(user?.avatar_index ?? null)

  const isAuthed = !!user

  return (
    <div className={cn('mt-4', collapsed ? 'px-2' : 'px-4')}>
      {!isAuthed ? (
        <button
          type="button"
          onClick={() => navigate('/auth')}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'bg-card text-card-foreground hover:bg-accent',
            collapsed && 'justify-center',
          )}
        >
          <div className="size-9 shrink-0 rounded-full bg-muted flex items-center justify-center">
            <LogIn className="size-4 text-muted-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold">去登录</span>
            </div>
          )}
        </button>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                isActive
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-card text-card-foreground hover:bg-accent',
                collapsed && 'justify-center',
              )}
            >
              <Avatar className="size-9">
                <AvatarImage src={avatarUrl} alt={username} />
                <AvatarFallback>{fallback}</AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">{username}</span>
                </div>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            className="w-44 p-1"
          >
            <ul className="flex flex-col">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    navigate('/me')
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent',
                    isActive && 'bg-accent',
                  )}
                >
                  <User className="size-4" />
                  <span>个人信息</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={async () => {
                    await logout()
                    setOpen(false)
                    navigate('/auth', { replace: true })
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-destructive transition-colors hover:bg-accent"
                  disabled={logoutState.isMutating}
                >
                  <LogOut className="size-4" />
                  <span>{logoutState.isMutating ? '退出中…' : '退出'}</span>
                </button>
              </li>
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

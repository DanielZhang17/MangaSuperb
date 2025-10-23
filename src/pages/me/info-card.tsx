import { LogOut, User } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export function InfoCard({ collapsed }: { collapsed: boolean }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const isActive = location.pathname.startsWith('/me')

  return (
    <div className={cn('mt-4', collapsed ? 'px-2' : 'px-4')}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              isActive
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-carinfod text-card-foreground hover:bg-accent',
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
                onClick={() => {
                  // 清理登录态并跳转登录页（按需替换存储键）
                  try {
                    localStorage.removeItem('token')
                  } catch {}

                  setOpen(false)
                  navigate('/auth')
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-destructive transition-colors hover:bg-accent"
              >
                <LogOut className="size-4" />
                <span>退出</span>
              </button>
            </li>
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  )
}
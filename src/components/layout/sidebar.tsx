import {
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  PanelsTopLeft,
  Sparkles,
  UserPlus,
} from 'lucide-react'
import { type ComponentType } from 'react'
import { Link, NavLink, useLocation } from 'react-router'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface SidebarItem {
  label: string
  to: string
  icon: ComponentType<{ className?: string }>
  description?: string
}

interface DashboardSidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const primaryNav: SidebarItem[] = [{ label: '我的创意', to: '/ideas', icon: Sparkles }]

const creationNav: SidebarItem[] = [
  { label: '漫画创作', to: '/comics', icon: PanelsTopLeft },
  { label: '新建AI人物', to: '/characters', icon: UserPlus },
]

const messages = [
  {
    id: 1,
    title: 'New feature released!',
    content: 'We have just launched a new feature that you might like.',
  },
  {
    id: 2,
    title: 'System maintenance',
    content: 'Our system will be under maintenance on Sunday.',
  },
  {
    id: 3,
    title: 'Your subscription is ending soon',
    content:
      'Please renew your subscription to continue enjoying our services.',
  },
]

export function DashboardSidebar({ collapsed, onToggle }: DashboardSidebarProps) {
  const location = useLocation()

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-out',
        collapsed ? 'w-20' : 'w-72',
      )}
    >
      <div
        className={cn(
          'flex items-center py-6',
          collapsed ? 'justify-between px-4' : 'gap-3 px-5',
        )}
      >
        <Link to="/" className="flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-semibold">
            MS
          </div>
          {!collapsed && (
            <span className="text-lg font-semibold">MangaSuperb</span>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(
            'flex text-muted-foreground hover:text-foreground',
            !collapsed && 'ml-auto',
          )}
          onClick={onToggle}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
          <span className="sr-only">切换侧边栏</span>
        </Button>
      </div>

      <div className={cn('mt-4', collapsed ? 'px-2' : 'px-4')}>
        <div
          className={cn(
            'flex items-center gap-3 rounded-lg bg-card p-2 text-card-foreground',
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
        </div>
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-6">
        <div className="flex flex-col gap-1">
          {primaryNav.map((item) => (
            <SidebarLink
              key={item.to}
              item={item}
              collapsed={collapsed}
              currentPath={location.pathname}
            />
          ))}
        </div>

        <div>
          <Badge
            variant="secondary"
            className={cn(
              'px-3 py-1 uppercase tracking-wide',
              collapsed && 'w-fit px-2',
            )}
          >
            AI 创作
          </Badge>
        </div>

        <div className="flex flex-col gap-1">
          {creationNav.map((item) => (
            <SidebarLink
              key={item.to}
              item={item}
              collapsed={collapsed}
              currentPath={location.pathname}
            />
          ))}
        </div>

        <div className="mt-auto border-t px-5 py-6">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size={'icon-lg'}
                className={cn('justify-center', collapsed && 'px-0')}
              >
                <Megaphone className="size-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="right" className="w-80">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <h4 className="font-medium leading-none">消息</h4>
                  <p className="text-sm text-muted-foreground">
                    您有 {messages.length} 条未读消息。
                  </p>
                </div>
                <div className="grid gap-2">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className="grid grid-cols-[25px_1fr] items-start pb-4 last:mb-0 last:pb-0"
                    >
                      <span className="flex h-2 w-2 translate-y-1 rounded-full bg-sky-500" />
                      <div className="grid gap-1">
                        <p className="text-sm font-medium leading-none">
                          {message.title}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </nav>
    </aside>
  )
}

function SidebarLink({
  item,
  collapsed,
  currentPath,
}: {
  item: SidebarItem
  collapsed: boolean
  currentPath: string
}) {
  const isActive =
    item.to === '/' ? currentPath === '/' : currentPath.startsWith(item.to)

  return (
    <NavLink
      to={item.to}
      className={cn(
        'mx-4 flex items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-accent',
        collapsed && 'mx-2 justify-center px-2',
        isActive &&
          'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground',
      )}
    >
      <item.icon className="size-5" />
      {!collapsed && <span>{item.label}</span>}
    </NavLink>
  )
}
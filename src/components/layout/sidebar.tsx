import { Home, MessageCircle, PanelsTopLeft, Sparkles, UserPlus } from 'lucide-react'
import { type ComponentType } from 'react'
import { Link, NavLink, useLocation } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

const primaryNav: SidebarItem[] = [
  { label: '主页', to: '/', icon: Home },
  { label: '我的创意', to: '/ideas', icon: Sparkles },
]

const creationNav: SidebarItem[] = [
  { label: '漫画创作', to: '/comics', icon: PanelsTopLeft },
  { label: '新建AI人物', to: '/characters', icon: UserPlus },
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
      <div className={cn('flex items-center gap-3 px-5 py-6', collapsed && 'justify-center px-4')}>
        <Link to="/" className="flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-semibold">
            MS
          </div>
          {!collapsed && <span className="text-lg font-semibold">MangaSuperb</span>}
        </Link>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto hidden text-muted-foreground hover:text-foreground lg:flex"
          onClick={onToggle}
        >
          <Sparkles className="size-4" />
          <span className="sr-only">切换侧边栏</span>
        </Button>
      </div>

      <Button
        variant="ghost"
        size={collapsed ? 'icon-lg' : 'lg'}
        className={cn(
          'mx-4 flex items-center rounded-xl border bg-card text-card-foreground shadow-sm hover:bg-accent hover:text-accent-foreground',
          collapsed ? 'justify-center px-0' : 'justify-start px-4',
        )}
        onClick={onToggle}
      >
        <Sparkles className="size-5" />
        {!collapsed && <span className="ml-2 text-sm font-semibold">折叠侧边栏</span>}
      </Button>

      <nav className="mt-6 flex flex-1 flex-col gap-6">
        <div className="flex flex-col gap-1">
          {primaryNav.map((item) => (
            <SidebarLink key={item.to} item={item} collapsed={collapsed} currentPath={location.pathname} />
          ))}
        </div>

        <div className="px-5">
          <Badge variant="secondary" className={cn('px-3 py-1 uppercase tracking-wide', collapsed && 'mx-auto w-fit px-2')}>
            AI 创作
          </Badge>
        </div>

        <div className="flex flex-col gap-1">
          {creationNav.map((item) => (
            <SidebarLink key={item.to} item={item} collapsed={collapsed} currentPath={location.pathname} />
          ))}
        </div>

        <div className="mt-auto border-t px-5 py-6">
          <Button
            variant="outline"
            size={collapsed ? 'icon-lg' : 'lg'}
            className={cn('w-full justify-start gap-3', collapsed && 'justify-center px-0')}
          >
            <MessageCircle className="size-5" />
            {!collapsed && <span className="text-sm font-medium">消息中心</span>}
          </Button>
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
  const isActive = item.to === '/' ? currentPath === '/' : currentPath.startsWith(item.to)

  return (
    <NavLink
      to={item.to}
      className={cn(
        'mx-4 flex items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
        collapsed && 'mx-2 justify-center px-2',
        isActive && 'bg-primary text-primary-foreground hover:bg-primary/90',
      )}
    >
      <item.icon className="size-5" />
      {!collapsed && <span>{item.label}</span>}
    </NavLink>
  )
}

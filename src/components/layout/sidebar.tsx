import { Grid2X2, SmilePlus, Sparkles } from 'lucide-react'
import { type ComponentType } from 'react'
import { Link, NavLink, useLocation } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { InfoCard } from '@/pages/me/info-card'

import I18nToggle from '../common/operations/i18n'
import { MessageToolTip } from '../common/operations/message-tooltip'

interface SidebarItem {
  label: string
  to: string
  icon: ComponentType<{ className?: string }>
  description?: string
}

interface DashboardSidebarProps {
  collapsed: boolean
}

const primaryNav: SidebarItem[] = [{ label: '我的创意', to: '/ideas', icon: Sparkles }]

const creationNav: SidebarItem[] = [
  { label: '漫画创作', to: '/comics', icon: Grid2X2 },
  { label: '新建AI人物', to: '/characters', icon: SmilePlus },
]

export function DashboardSidebar({ collapsed }: DashboardSidebarProps) {
  const location = useLocation()

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r bg-sidebar text-sidebar-foreground overflow-hidden flex-none',
        collapsed ? 'basis-20' : 'basis-72',
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
        <div className={cn('flex items-center gap-2', !collapsed && 'ml-auto')} />
      </div>

      <InfoCard collapsed={collapsed} />

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
          <div className={cn('flex items-center gap-2', collapsed && 'flex-col')}>
            <MessageToolTip />
            <I18nToggle />
          </div>
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
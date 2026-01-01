import { Grid2X2, SmilePlus, Sparkles } from 'lucide-react'
import { type ComponentType } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { useAtom } from 'jotai'

import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/hooks/use-i18n'
import { cn, proxiedStatic } from '@/lib/utils'
import { InfoCard } from '@/pages/me/info-card'

import I18nToggle from '../common/operations/i18n'
import { MessageToolTip } from '../common/operations/message-tooltip'
import { sidebarOpenAtom } from './atoms'

interface SidebarItem {
    labelKey: string
    to: string
    icon: ComponentType<{ className?: string }>
    description?: string
}

interface DashboardSidebarProps {
    collapsed: boolean
}

const primaryNav: SidebarItem[] = [
  { labelKey: 'common:nav.myIdeas', to: '/ideas', icon: Sparkles },
]

const creationNav: SidebarItem[] = [
  { labelKey: 'common:nav.comicCreation', to: '/comics', icon: Grid2X2 },
  { labelKey: 'common:nav.createCharacter', to: '/create-character', icon: SmilePlus },
]

export function DashboardSidebar({ collapsed }: DashboardSidebarProps) {
  const location = useLocation()
  const { t } = useI18n('common')
  const [, setMobileOpen] = useAtom(sidebarOpenAtom)

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r bg-sidebar text-sidebar-foreground overflow-hidden flex-none',
        collapsed ? 'basis-16 sm:basis-20' : 'basis-64 sm:basis-72',
      )}
    >
      <div
        className={cn(
          'flex items-center py-4 sm:py-6',
          collapsed ? 'justify-between px-2 sm:px-4' : 'gap-3 px-4 sm:px-5',
        )}
      >
        <Link to="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
          {!collapsed &&<img
            src={proxiedStatic('https://storage.mangasuperb.anranz.xyz/static/logo_s.png')}
            alt="MangaSuperb"
            className="h-8 w-32 sm:h-10 sm:w-40 rounded-xl object-cover invert dark:invert-0"
          />
          }
          {collapsed && (
            <img
              src={proxiedStatic('https://storage.mangasuperb.anranz.xyz/static/logo.png')}
              alt="MangaSuperb"
              className="h-8 w-8 sm:h-10 sm:w-10 rounded-full object-cover invert dark:invert-0"
            />
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
              onNavigate={() => setMobileOpen(false)}
            />
          ))}
        </div>

        <div>
          <Badge
            variant="secondary"
            className={cn(
              'px-2 py-0.5 sm:px-3 sm:py-1 text-xs uppercase tracking-wide',
              collapsed && 'w-fit px-1.5 sm:px-2',
            )}
          >
            {String(t('badge.aiCreation'))}
          </Badge>
        </div>

        <div className="flex flex-col gap-1">
          {creationNav.map((item) => (
            <SidebarLink
              key={item.to}
              item={{ ...item, labelKey: item.labelKey }}
              collapsed={collapsed}
              currentPath={location.pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          ))}
        </div>

        <div className="mt-auto border-t px-3 py-4 sm:px-5 sm:py-6">
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
  onNavigate,
}: {
    item: SidebarItem
    collapsed: boolean
    currentPath: string
    onNavigate: () => void
}) {
  const { t } = useI18n('common')
  const isActive =
        item.to === '/' ? currentPath === '/' : currentPath.startsWith(item.to)

  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={cn(
        'mx-2 sm:mx-4 flex items-center gap-2 sm:gap-3 rounded-lg px-3 py-2 sm:px-4 text-sm font-medium transition-colors hover:bg-accent',
        collapsed && 'mx-1 sm:mx-2 justify-center px-2',
        isActive &&
                'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground',
      )}
    >
      <item.icon className="size-4 sm:size-5" />
      {!collapsed && <span className="text-xs sm:text-sm">{String(t(item.labelKey))}</span>}
    </NavLink>
  )
}
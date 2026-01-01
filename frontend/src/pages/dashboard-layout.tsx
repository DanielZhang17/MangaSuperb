import { useAtom } from 'jotai'
import { Suspense, useEffect } from 'react'
import { Outlet } from 'react-router'

import ModeToggle from '@/components/common/operations/mode-toggle'
import SidebarToggle from '@/components/common/operations/sidebar-toggle'
import { sidebarCollapsedAtom, sidebarOpenAtom } from '@/components/layout/atoms'
import { DashboardSidebar } from '@/components/layout/sidebar'
import { useAutoCollapseSidebar } from '@/hooks/use-auto-collapse-sidebar'
import { useI18n } from '@/hooks/use-i18n'

export default function DashboardLayout() {
  useAutoCollapseSidebar(1024)
  const [collapsed] = useAtom(sidebarCollapsedAtom)
  const [mobileOpen, setMobileOpen] = useAtom(sidebarOpenAtom)

  // Close mobile sidebar when clicking outside
  useEffect(() => {
    if (!mobileOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-sidebar]') && !target.closest('[data-sidebar-toggle]')) {
        setMobileOpen(false)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [mobileOpen, setMobileOpen])

  return (
    <div className="flex h-screen bg-background">
      {/* Backdrop for mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar: hidden on mobile unless open, always visible on lg+ */}
      <div
        data-sidebar
        className={`
          fixed lg:relative inset-y-0 left-0 z-50 lg:z-auto
          transform transition-transform duration-300 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <DashboardSidebar collapsed={collapsed} />
      </div>

      <div className="flex flex-1 min-h-0 flex-col">
        <div className="z-10 h-12 sm:h-14 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
          <div className="flex h-full items-center justify-between px-3 sm:px-4 md:px-6">
            <SidebarToggle />
            <ModeToggle />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 sm:py-5 md:px-6 md:py-6">
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

function PageFallback() {
  const { t } = useI18n('common')

  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {String(t('loading'))}
    </div>
  )
}

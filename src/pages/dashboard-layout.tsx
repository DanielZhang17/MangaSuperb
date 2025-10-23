import { useAtom } from 'jotai'
import { Suspense } from 'react'
import { Outlet } from 'react-router'

import ModeToggle from '@/components/common/operations/mode-toggle'
import SidebarToggle from '@/components/common/operations/sidebar-toggle'
import { sidebarCollapsedAtom } from '@/components/layout/atoms'
import { DashboardSidebar } from '@/components/layout/sidebar'

export default function DashboardLayout() {
  const [collapsed] = useAtom(sidebarCollapsedAtom)

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar collapsed={collapsed} />

      <div className="flex flex-1">
        <main className="flex-1 overflow-y-auto">
          <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
            <div className="flex h-12 items-center justify-between px-6">
              <SidebarToggle />
              <ModeToggle />
            </div>
          </div>
          <div className="px-6 py-6">
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      正在加载内容…
    </div>
  )
}

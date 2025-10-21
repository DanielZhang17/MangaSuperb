import { Suspense, useState } from 'react'
import { Outlet } from 'react-router'

import { DashboardSidebar } from '@/components/layout/sidebar'

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false)

  const toggleSidebar = () => setCollapsed((value) => !value)

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar collapsed={collapsed} onToggle={toggleSidebar} />

      <div className="flex flex-1 flex-col">
        <main className="flex-1 overflow-y-auto px-6 py-6">
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
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

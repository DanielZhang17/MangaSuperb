import { Bell, Menu } from 'lucide-react'
import { Suspense, useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router'

import { DashboardSidebar } from '@/components/layout/sidebar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default function DashboardLayout() {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  const meta = useMemo(() => {
    const pathname = location.pathname

    if (pathname.startsWith('/ideas')) {
      return {
        badge: '灵感库',
        description: '管理你的创意收藏和人物设定',
        title: '我的创意',
      }
    }

    if (pathname.startsWith('/comics')) {
      return {
        badge: '创作工作台',
        description: '故事、角色与画格的全流程创作',
        title: '漫画创作',
      }
    }

    if (pathname.startsWith('/characters')) {
      return {
        badge: '角色工坊',
        description: '快速生成并管理你的 AI 人物',
        title: '新建 AI 人物',
      }
    }

    return {
      badge: '精选推荐',
      description: '发掘热门漫画和最新创作分享',
      title: '精选漫画',
    }
  }, [location.pathname])

  const toggleSidebar = () => setCollapsed((value) => !value)

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar collapsed={collapsed} onToggle={toggleSidebar} />

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
          <div className="flex flex-col gap-2">
            <Badge variant="secondary" className="w-fit px-3 py-1 text-xs uppercase tracking-wide">
              {meta.badge}
            </Badge>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{meta.title}</h1>
              <p className="text-sm text-muted-foreground">{meta.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={toggleSidebar}>
              <Menu className="size-5" />
              <span className="sr-only">展开侧边栏</span>
            </Button>
            <Button variant="outline" size="icon">
              <Bell className="size-5" />
              <span className="sr-only">查看通知</span>
            </Button>
          </div>
        </header>

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

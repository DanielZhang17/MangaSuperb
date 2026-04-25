import { useAtom } from 'jotai'
import { ChevronLeft, ChevronRight, Menu, X } from 'lucide-react'

import { sidebarCollapsedAtom, sidebarOpenAtom } from '@/components/layout/atoms'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/hooks/use-media-query'

export default function SidebarToggle() {
  const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom)
  const [mobileOpen, setMobileOpen] = useAtom(sidebarOpenAtom)
  const isMobile = useMediaQuery('(max-width: 1023px)') // lg breakpoint is 1024px

  const handleClick = () => {
    if (isMobile) {
      setMobileOpen((v) => !v)
    } else {
      setCollapsed((v) => !v)
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="flex text-muted-foreground hover:text-foreground"
      onClick={handleClick}
      data-sidebar-toggle
    >
      {isMobile ? (
        mobileOpen ? (
          <X className="size-4" />
        ) : (
          <Menu className="size-4" />
        )
      ) : collapsed ? (
        <ChevronRight className="size-4" />
      ) : (
        <ChevronLeft className="size-4" />
      )}
      <span className="sr-only">切换侧边栏</span>
    </Button>
  )
}

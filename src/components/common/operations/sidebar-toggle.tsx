import { useAtom } from 'jotai'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'

import { sidebarCollapsedAtom } from '@/components/layout/atoms'
import { Button } from '@/components/ui/button'

export default function SidebarToggle() {
  const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom)

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="flex text-muted-foreground hover:text-foreground"
      onClick={() => setCollapsed((v) => !v)}
    >
      {collapsed ? (
        <PanelLeftOpen className="size-4" />
      ) : (
        <PanelLeftClose className="size-4" />
      )}
      <span className="sr-only">切换侧边栏</span>
    </Button>
  )
}

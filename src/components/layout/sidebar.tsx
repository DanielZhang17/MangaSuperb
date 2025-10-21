import { useAtom } from 'jotai'
import { Menu, PenSquare, Sparkles, UserPlus } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'

import { sidebarNavAtom } from '@/atoms/navigation'
import { cn } from '@/lib/utils'

type IconType = ComponentType<SVGProps<SVGSVGElement>>

interface SidebarItem {
  id: 'ideas' | 'comics' | 'characters'
  label: string
  description: string
  icon: IconType
}

const sidebarItems: SidebarItem[] = [
  {
    id: 'ideas',
    label: '我的创意',
    description: '收藏灵感与草稿',
    icon: Sparkles,
  },
  {
    id: 'comics',
    label: '漫画创作',
    description: 'AI辅助的画面与故事',
    icon: PenSquare,
  },
  {
    id: 'characters',
    label: '新建AI人物',
    description: '生成独特角色设定',
    icon: UserPlus,
  },
]

export function Sidebar() {
  const [activeNav, setActiveNav] = useAtom(sidebarNavAtom)

  return (
    <aside className="flex h-full w-[250px] flex-col gap-6 bg-neutral-200 px-6 py-5">
      <div className="rounded-2xl bg-neutral-100 px-6 py-5 text-lg font-semibold tracking-widest text-neutral-900">
        LOGO
      </div>

      <div className="flex items-center gap-4 rounded-2xl bg-white/80 p-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-neutral-300 text-lg font-semibold text-neutral-700">
          HT
        </div>
        <div>
          <p className="text-base font-semibold text-neutral-900">Hu Tao</p>
          <p className="text-sm text-neutral-500">创作者</p>
        </div>
      </div>

      <button
        type="button"
        className="flex w-full items-center justify-start gap-3 rounded-r-3xl rounded-l-md bg-neutral-100 px-5 py-3 text-base font-semibold text-neutral-900 transition hover:bg-neutral-200"
      >
        <Sparkles className="h-4 w-4 text-neutral-600" />
        AI创作
      </button>

      <nav className="flex flex-col gap-3">
        {sidebarItems.map((item) => {
          const isActive = activeNav === item.id
          const Icon = item.icon

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveNav(item.id)}
              className={cn(
                'group flex items-center justify-between rounded-3xl border border-transparent bg-white p-4 text-left transition-all',
                'hover:-translate-y-0.5 hover:shadow-md',
                isActive && 'border-neutral-900 bg-neutral-900 text-white shadow-lg',
              )}
            >
              <div>
                <p className={cn('text-base font-semibold text-neutral-900', isActive && 'text-white')}>{item.label}</p>
                <p className={cn('mt-1 text-sm text-neutral-500', isActive && 'text-neutral-100')}>{item.description}</p>
              </div>
              <div
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-200 text-neutral-600 transition-colors',
                  isActive && 'bg-white/20 text-white',
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
            </button>
          )
        })}
      </nav>

      <div className="mt-auto flex justify-center">
        <button
          type="button"
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 text-neutral-700 transition hover:bg-white"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
    </aside>
  )
}

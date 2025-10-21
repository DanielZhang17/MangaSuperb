import { useAtom } from 'jotai'
import { Sparkles } from 'lucide-react'

import { primaryNavAtom } from '@/atoms/navigation'
import { cn } from '@/lib/utils'

const primaryNavItems = [
  { id: 'featured', label: '精选漫画' },
  { id: 'sharing', label: '创作分享' },
] as const

type PrimaryNavItem = (typeof primaryNavItems)[number]['id']

export function TopNav() {
  const [activeNav, setActiveNav] = useAtom(primaryNavAtom)

  return (
    <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
      <nav className="flex flex-wrap items-center gap-3">
        {primaryNavItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveNav(item.id as PrimaryNavItem)}
            className={cn(
              'rounded-2xl px-5 py-3 text-base font-medium text-neutral-500 transition-all hover:bg-neutral-100 hover:text-neutral-900',
              activeNav === item.id && 'bg-neutral-900 text-white hover:bg-neutral-900 hover:text-white',
            )}
          >
            {item.label}
          </button>
        ))}

        <button
          type="button"
          className="flex items-center gap-2 rounded-2xl bg-neutral-900 px-5 py-3 text-base font-semibold text-white transition hover:bg-neutral-800"
        >
          <Sparkles className="h-4 w-4" />
          AI创作
        </button>
      </nav>

      <div className="flex items-center gap-3 rounded-2xl bg-neutral-100 px-5 py-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-300 text-base font-semibold text-neutral-700">
          HT
        </div>
        <div>
          <p className="text-sm font-semibold text-neutral-900">Hu Tao</p>
          <p className="text-xs text-neutral-500">创作者</p>
        </div>
      </div>
    </header>
  )
}

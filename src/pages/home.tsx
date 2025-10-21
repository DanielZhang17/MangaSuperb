import { useAtom } from 'jotai'
import { Lightbulb, PenSquare, Sparkles, Star, UserPlus } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'

import { sidebarNavAtom, type SidebarNavKey } from '@/atoms/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { TopNav } from '@/components/layout/top-nav'
import { cn } from '@/lib/utils'

type IconType = ComponentType<SVGProps<SVGSVGElement>>

interface QuickAction {
  id: SidebarNavKey
  title: string
  subtitle: string
  stat: string
  chip: string
  background: string
  accent?: string
  icon: IconType
}

const quickActions: QuickAction[] = [
  {
    id: 'ideas',
    title: '我的创意',
    subtitle: '灵感随时收集与分类',
    stat: '12 个草稿',
    chip: '高优先级',
    background: 'bg-linear-to-br from-neutral-950 via-neutral-900 to-neutral-800 text-white',
    icon: Lightbulb,
  },
  {
    id: 'comics',
    title: '漫画创作',
    subtitle: '分镜、面板与剧情一次完成',
    stat: '3 个系列进行中',
    chip: 'AI助力',
    background: 'bg-linear-to-br from-[#FFECE3] via-[#FFDCCF] to-[#FFC8BA] text-neutral-900',
    icon: PenSquare,
  },
  {
    id: 'characters',
    title: '新建AI人物',
    subtitle: '生成角色、设定与头像',
    stat: '5 位角色待完善',
    chip: '快速上手',
    background: 'bg-linear-to-br from-[#E4F1FF] via-[#D6EBFF] to-[#F0F6FF] text-neutral-900',
    icon: UserPlus,
  },
]

interface ShareStory {
  id: string
  author: string
  snippet: string
  likes: number
}

const shareStories: ShareStory[] = [
  {
    id: 'share-1',
    author: 'Kimi',
    snippet: '我们到了,現在在市场前面，Maxi：是吗？我们也在市场前面。',
    likes: 24,
  },
  {
    id: 'share-2',
    author: 'Kimi',
    snippet: '马红梅眸中杀机闪烁，正要追下去，斩草除根。',
    likes: 18,
  },
  {
    id: 'share-3',
    author: 'Kimi',
    snippet: '宫殿内走出一个中年男人，他身穿紫衣，龙行虎步。',
    likes: 40,
  },
  {
    id: 'share-4',
    author: 'Kimi',
    snippet: '秦飞扬就宛如一个皮球般，伴随着痛苦的惨叫声滚落石梯。',
    likes: 33,
  },
]

const creativeTags = [
  { id: 'tag-1', label: '日漫', active: true },
  { id: 'tag-2', label: '美漫风', active: false },
  { id: 'tag-3', label: '宫崎骏', active: false },
]

interface CreativeBoard {
  id: string
  title: string
  subtitle: string
  palette: string
  accent?: string
}

const creativeBoards: CreativeBoard[] = [
  {
    id: 'board-1',
    title: '网格 1',
    subtitle: '四宫格面板布局',
    palette: 'bg-linear-to-br from-[#222831] via-[#31363F] to-[#222831] text-white',
    accent: 'bg-white/15 text-white',
  },
  {
    id: 'board-2',
    title: '网格 2',
    subtitle: '三列瀑布流',
    palette: 'bg-linear-to-br from-[#FFF8E1] via-[#FFE0B2] to-[#FFCC80] text-neutral-900',
    accent: 'bg-white/60 text-neutral-900',
  },
  {
    id: 'board-3',
    title: '网格 3',
    subtitle: '剧情向跨页',
    palette: 'bg-linear-to-br from-[#E3F2FD] via-[#BBDEFB] to-[#90CAF9] text-neutral-900',
    accent: 'bg-white/70 text-neutral-900',
  },
  {
    id: 'board-4',
    title: '网格 4',
    subtitle: '实验性排版',
    palette: 'bg-linear-to-br from-[#FCE4EC] via-[#F8BBD0] to-[#F48FB1] text-neutral-900',
    accent: 'bg-white/70 text-neutral-900',
  },
]

export default function Home() {
  return (
    <div className="flex min-h-screen bg-[#F5F5F5] text-neutral-900">
      <Sidebar />

      <main className="flex flex-1 flex-col gap-8 overflow-y-auto px-10 py-8">
        <TopNav />
        <QuickActions />
        <FeaturedShowcase />
        <CreativeSpotlight />
      </main>
    </div>
  )
}

function QuickActions() {
  const [activeNav, setActiveNav] = useAtom(sidebarNavAtom)

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {quickActions.map((action) => {
        const Icon = action.icon
        const isActive = activeNav === action.id

        return (
          <button
            key={action.id}
            type="button"
            onClick={() => setActiveNav(action.id)}
            className={cn(
              'group flex h-full flex-col justify-between rounded-3xl border border-transparent p-6 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900',
              action.background,
              isActive && 'ring-2 ring-offset-2 ring-neutral-900',
            )}
          >
            <div className="flex items-center justify-between">
              <span className={cn('rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide', action.accent ?? 'bg-white/20 text-current')}>
                {action.chip}
              </span>
              <Icon className="h-6 w-6" />
            </div>

            <div className="mt-6 space-y-3">
              <p className="text-xl font-semibold tracking-tight">{action.title}</p>
              <p className="text-sm opacity-80">{action.subtitle}</p>
            </div>

            <p className="mt-8 text-sm font-medium opacity-90">{action.stat}</p>
          </button>
        )
      })}
    </section>
  )
}

function FeaturedShowcase() {
  return (
    <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <div className="relative overflow-hidden rounded-3xl bg-neutral-900 text-white shadow-lg">
        <div className="absolute inset-0 bg-linear-to-br from-neutral-950 via-neutral-900 to-neutral-800 opacity-95" />
        <div className="relative flex h-full flex-col gap-6 p-8">
          <span className="w-fit rounded-full bg-white/10 px-4 py-2 text-sm font-medium">精选漫画</span>
          <div className="space-y-4">
            <h2 className="text-3xl font-semibold">不灭战神</h2>
            <p className="max-w-2xl text-sm leading-relaxed text-neutral-200">
              秦飞扬就宛如一个皮球般，伴随着痛苦的惨叫声顺着石梯朝下方滚去。好不容易登上顶峰，却被人残忍地推向深渊。
            </p>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              阅读故事
            </button>
            <button
              type="button"
              className="rounded-2xl border border-white/40 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              分享灵感
            </button>
          </div>
        </div>
      </div>

      <ShareCardList />
    </section>
  )
}

function ShareCardList() {
  return (
    <div className="flex flex-col gap-4">
      {shareStories.map((story) => (
        <article
          key={story.id}
          className="flex gap-4 rounded-3xl bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E6E6E6] text-sm font-semibold text-neutral-700">
            漫画
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                <Sparkles className="h-4 w-4 text-[#FACC15]" />
                {story.author}
              </div>
              <div className="flex items-center gap-1 text-sm text-neutral-500">
                <Star className="h-4 w-4 fill-[#FACC15] text-[#FACC15]" />
                {story.likes}
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-neutral-600">{story.snippet}</p>
          </div>
        </article>
      ))}
    </div>
  )
}

function CreativeSpotlight() {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">我的创意</h3>
          <p className="text-sm text-neutral-500">从灵感到成片的所有路径</p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-neutral-200 px-4 py-2 text-sm text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
        >
          查看全部
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {creativeTags.map((tag) => (
          <span
            key={tag.id}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition',
              tag.active
                ? 'bg-neutral-900 text-white shadow-md'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900',
            )}
          >
            {tag.label}
          </span>
        ))}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {creativeBoards.map((board) => (
          <article
            key={board.id}
            className={cn(
              'flex h-full flex-col justify-between rounded-3xl p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md',
              board.palette,
            )}
          >
            <span className={cn('w-fit rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide', board.accent)}>
              推荐
            </span>
            <div className="mt-6 space-y-3">
              <h4 className="text-lg font-semibold tracking-tight">{board.title}</h4>
              <p className="text-sm opacity-80">{board.subtitle}</p>
            </div>
            <div className="mt-8 flex h-16 items-center justify-between rounded-2xl bg-black/10 px-4 text-xs font-semibold uppercase tracking-widest opacity-80">
              <span>Layout</span>
              <span>Preview</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

import { ArrowUpRight, Flame, Heart, MessageCircle, Sparkles, Star } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const featuredComics = [
  {
    author: 'Kimi',
    id: 'kimi-market',
    likes: 186,
    saves: 64,
    summary: '在赛博市场邂逅神秘旅人，交织现实与梦想的都市奇谈。',
    title: '霓虹下的追光者',
  },
  {
    author: 'Mika',
    id: 'mika-dream',
    likes: 152,
    saves: 41,
    summary: '少女与 AI 猫咪的奇妙冒险，带你游历梦境与现实的缝隙。',
    title: '梦中来信',
  },
  {
    author: 'Rex',
    id: 'rex-cosmos',
    likes: 201,
    saves: 79,
    summary: '宇宙飞船上唯一的人类与机械生命，共同守护消逝的星河。',
    title: '星舰守望者',
  },
]

const creatorShares = [
  {
    id: 'framework',
    message: '四宫格布局 + 漫画语言模板，快速完成完整章节。',
    name: 'Hu Tao',
    reactions: 38,
    title: '高效漫画制作流程分享',
  },
  {
    id: 'character',
    message: '使用人物偏好组合，10 分钟生成 6 位稳定角色。',
    name: 'Shiro',
    reactions: 42,
    title: 'AI 人物设定技巧',
  },
]

export default function HomePage() {
  return (
    <div className="space-y-10">
      <HeroSection />

      <section className="space-y-6">
        <SectionHeading
          icon={Star}
          subtitle="热门作品回顾"
          title="精选漫画"
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {featuredComics.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <div className="bg-linear-to-br from-primary/20 via-primary/10 to-transparent p-6">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{item.author}</span>
                  <Badge variant="outline" className="border-primary/40 text-primary">
                    人气上升中
                  </Badge>
                </div>
                <h3 className="mt-4 text-xl font-semibold tracking-tight">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {item.summary}
                </p>
              </div>
              <CardFooter className="justify-between border-t bg-card/60 py-4">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Heart className="size-4" />
                    {item.likes}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="size-4" />
                    {item.saves}
                  </span>
                </div>
                <Button variant="ghost" size="sm" className="gap-1 text-sm">
                  查看详情
                  <ArrowUpRight className="size-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <SectionHeading
          icon={Flame}
          subtitle="社区热议"
          title="创作分享"
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {creatorShares.map((share) => (
            <Card key={share.id} className="flex flex-col justify-between">
              <CardHeader className="gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-lg font-semibold">
                    {share.name.slice(0, 1)}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{share.title}</CardTitle>
                    <CardDescription>{share.name}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed text-muted-foreground">{share.message}</p>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    社区精选
                  </span>
                  <span className="flex items-center gap-1">
                    <Heart className="size-4" />
                    {share.reactions}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}

function HeroSection() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr,1fr]">
      <Card className="relative overflow-hidden bg-primary text-primary-foreground">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.35),transparent_55%)]" />
        <CardHeader className="relative flex-col gap-6">
          <Badge variant="outline" className="border-primary-foreground/40 bg-primary/30 text-primary-foreground">
            今日灵感推荐
          </Badge>
          <CardTitle className="text-3xl font-semibold leading-tight">
            探索 AI 助力的漫画创作新玩法
          </CardTitle>
          <CardDescription className="text-primary-foreground/80 text-sm leading-relaxed">
            自动生成角色、布局和文案，让你的故事从灵感到成稿快人一步。
          </CardDescription>
        </CardHeader>
        <CardFooter className="relative flex flex-col gap-4 border-t border-primary-foreground/20 bg-primary/30 py-6 md:flex-row md:items-center md:justify-between md:gap-6">
          <div className="flex items-center gap-4 text-sm">
            <Badge variant="secondary" className="bg-primary-foreground text-primary">
              +12% 周增长
            </Badge>
            <span>本周已有 48 位创作者启动新项目</span>
          </div>
          <Button variant="secondary" size="lg" className="gap-2">
            <Sparkles className="size-5" />
            立即创作
          </Button>
        </CardFooter>
      </Card>

      <Card className="border-dashed border-primary/30 bg-muted/40">
        <CardHeader>
          <CardTitle>实时创作概览</CardTitle>
          <CardDescription>快速了解当前项目的进度与反馈</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <SummaryRow label="本周新增创意" value="18" helper="较上周 +4" />
          <SummaryRow label="AI 生成分镜" value="126" helper="平均用时 2.4 min" />
          <SummaryRow label="角色成稿率" value="82%" helper="提升 6%" />
        </CardContent>
      </Card>
    </div>
  )
}

function SectionHeading({
  title,
  subtitle,
  icon: Icon,
}: {
  icon: typeof Star
  subtitle: string
  title: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4 text-primary" />
        {subtitle}
      </div>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
    </div>
  )
}

function SummaryRow({ label, value, helper }: { helper: string; label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl bg-background/60 p-4 shadow-sm">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{helper}</p>
      </div>
      <span className="text-lg font-semibold text-primary">{value}</span>
    </div>
  )
}

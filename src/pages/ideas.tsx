import { Clock, Palette, Share2, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'

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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const ideasData = [
  {
    id: 'idea-night-market',
    lastUpdate: '2 小时前',
    progress: 68,
    summary: '围绕夜市的交错视角，探索多角色叙事与错格布局的结合。',
    tags: ['都市', '群像', '四宫格'],
    title: '夜市迷途',
  },
  {
    id: 'idea-mythic',
    lastUpdate: '昨天',
    progress: 45,
    summary: '将东方神话与蒸汽朋克融合，尝试 AI 角色与布景的协同生成。',
    tags: ['神话', '蒸汽朋克'],
    title: '尘世神庭',
  },
  {
    id: 'idea-sci-fi',
    lastUpdate: '3 天前',
    progress: 90,
    summary: '以失忆机械师为主角，通过章节式推进完成长篇连载。',
    tags: ['科幻', '长篇', 'AI 人物'],
    title: '记忆补丁',
  },
]

const characterData = [
  {
    archetype: '战术指挥',
    id: 'char-cass',
    mood: '沉稳冷静',
    name: '卡珊德拉',
    tags: ['未来军武', '女性', '短发'],
  },
  {
    archetype: '旅行博主',
    id: 'char-yuki',
    mood: '活力开朗',
    name: '雪姬',
    tags: ['都市', '青年', '暖色调'],
  },
  {
    archetype: '学者侦探',
    id: 'char-lu',
    mood: '理性克制',
    name: '陆斯年',
    tags: ['悬疑', '男性', '眼镜'],
  },
]

export default function IdeasPage() {
  const [activeTab, setActiveTab] = useState<'ideas' | 'characters'>('ideas')

  const stats = useMemo(
    () => [
      {
        helper: '过去 7 天新增',
        icon: Sparkles,
        label: '创意草稿',
        value: '12',
      },
      {
        helper: '同步至漫画创作',
        icon: Share2,
        label: '发布作品',
        value: '5',
      },
      {
        helper: '多风格人格库',
        icon: Palette,
        label: '人物模版',
        value: '18',
      },
    ],
    [],
  )

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <ToggleGroup
          type="single"
          value={activeTab}
          onValueChange={(value) => value && setActiveTab(value as 'ideas' | 'characters')}
          variant="outline"
          spacing={0}
        >
          <ToggleGroupItem value="ideas" className="min-w-[120px]">
            我的创意
          </ToggleGroupItem>
          <ToggleGroupItem value="characters" className="min-w-[120px]">
            我的人物
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline">导入草稿</Button>
          <Button>新建草稿</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((item) => (
          <StatsCard key={item.label} helper={item.helper} value={item.value} label={item.label} icon={item.icon} />
        ))}
      </div>

      {activeTab === 'ideas' ? <IdeasGrid /> : <CharactersGrid />}
    </div>
  )
}

function StatsCard({
  helper,
  icon: Icon,
  label,
  value,
}: {
  helper: string
  icon: typeof Sparkles
  label: string
  value: string
}) {
  return (
    <Card className="border-dashed">
      <CardHeader className="flex-row items-center justify-between">
        <div className="space-y-1">
          <CardDescription className="text-xs uppercase tracking-wide text-muted-foreground">
            {helper}
          </CardDescription>
          <CardTitle className="text-lg">{label}</CardTitle>
        </div>
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
      </CardHeader>
      <CardContent>
        <span className="text-2xl font-semibold">{value}</span>
      </CardContent>
    </Card>
  )
}

function IdeasGrid() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {ideasData.map((idea) => (
        <Card key={idea.id} className="flex h-full flex-col">
          <CardHeader className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-lg">{idea.title}</CardTitle>
                <CardDescription>更新于 {idea.lastUpdate}</CardDescription>
              </div>
              <Badge variant="secondary" className="rounded-md bg-emerald-500/10 text-emerald-600">
                进度 {idea.progress}%
              </Badge>
            </div>
            <CardDescription className="leading-relaxed text-muted-foreground">
              {idea.summary}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Clock className="size-4" />
              自动保存已开启
            </div>
            <div className="flex flex-wrap gap-2">
              {idea.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="rounded-md border-primary/30 text-primary">
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
          <CardFooter className="mt-auto flex items-center justify-between border-t pt-4">
            <Button variant="ghost" size="sm" className="gap-1">
              继续创作
              <Sparkles className="size-4" />
            </Button>
            <Button variant="outline" size="sm">
              查看文稿
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}

function CharactersGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {characterData.map((character) => (
        <Card key={character.id} className="flex h-full flex-col gap-4 p-6">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
              {character.name.slice(0, 1)}
            </div>
            <div>
              <CardTitle className="text-lg">{character.name}</CardTitle>
              <CardDescription>{character.archetype}</CardDescription>
            </div>
          </div>

          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              设定基调：{character.mood}
            </div>
            <div className="flex flex-wrap gap-2">
              {character.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="rounded-md">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          <div className="mt-auto flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm">
              编辑
            </Button>
            <Button size="sm">加入创作</Button>
          </div>
        </Card>
      ))}
    </div>
  )
}

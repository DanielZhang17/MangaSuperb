
import { ShareCard } from '@/components/common/share-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const creatorShares = [
  {
    id: 'share-one',
    message: '我们到了, 现在在市场前面，Maxi：是吗？我们也在市场前面。',
    name: 'Kimi',
  },
  {
    id: 'share-two',
    message: '我们到了, 现在在市场前面，Maxi：是吗？我们也在市场前面。',
    name: 'Kimi',
  },
  {
    id: 'share-three',
    message: '我们到了, 现在在市场前面，Maxi：是吗？我们也在市场前面。',
    name: 'Kimi',
  },
  {
    id: 'share-four',
    message: '我们到了, 现在在市场前面，Maxi：是吗？我们也在市场前面。',
    name: 'Kimi',
  },
]

export default function IdeasPage() {
  return (
    <Tabs defaultValue="ideas">
      <TabsList>
        <TabsTrigger value="ideas">我的创意</TabsTrigger>
        <TabsTrigger value="characters">我的人物</TabsTrigger>
      </TabsList>
      <TabsContent value="ideas">
        <IdeasGrid />
      </TabsContent>
      <TabsContent value="characters">
        <CharactersGrid />
      </TabsContent>
    </Tabs>
  )
}

function IdeasGrid() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {creatorShares.map((share) => (
        <ShareCard key={share.id} share={share} />
      ))}
    </div>
  )
}

function CharactersGrid() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="aspect-square w-full rounded-xl bg-muted" />
    </div>
  )
}
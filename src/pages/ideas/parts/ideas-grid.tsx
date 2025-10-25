import { ShareCard } from '@/components/common/share-card'

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
  {
    id: 'share-5',
    message: '我们到了, 现在在市场前面，Maxi：是吗？我们也在市场前面。',
    name: 'Kimi',
  },
]

export default function IdeasGrid() {
  return (
    <div className="grid gap-4 justify-items-start md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      {creatorShares.map((share) => (
        <ShareCard key={share.id} share={share} />
      ))}
    </div>
  )
}

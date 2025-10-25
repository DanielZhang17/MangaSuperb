import { Image as ImageIcon, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'

import CharactersApi from '@/apis/characters'
import InlineInput from '@/components/common/inline-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useCharactersList } from '@/hooks/use-characters'

function normalizeStorageUrl(url?: string | null) {
  if (!url) return undefined
  if ((import.meta as any).env?.DEV) {
    try {
      if (/^https?:\/\//i.test(url)) {
        const u = new URL(url)
        if (u.hostname === 'storage.mangasuperb.anranz.xyz') {
          const p = u.pathname.replace(/^\/+/, '/')

          return `/static${p}`
        }
      } else if (url.startsWith('/manga')) {
        return `/static${url}`
      }
    } catch {
      return url
    }
  }

  return url
}

export default function CharactersGrid() {
  const { characters, loading, error, refresh } = useCharactersList()
  const [tries, setTries] = useState(0)
  const timerRef = useRef<number | null>(null)
  const MAX_TRIES = 40 // ~2 分钟（40 * 3s）

  // 当存在 pending 项目时，轻量轮询列表刷新，直到 ready/failed 或超时
  useEffect(() => {
    const hasPending = characters.some((c) => c.image_status === 'pending' && !c.image_url)

    // 清理已有定时器
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (!loading && hasPending && tries < MAX_TRIES) {
      timerRef.current = window.setInterval(async () => {
        await refresh()
        setTries((t) => t + 1)
      }, 3000)
    }

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characters, loading])

  return (
    <div className="flex w-full flex-col gap-4">
      {loading && <div className="text-sm text-muted-foreground">加载中...</div>}
      {error && (
        <div className="text-sm text-destructive">加载失败：{(error as any)?.message ?? 'Unknown error'}</div>
      )}

      {!loading && !error && characters.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          暂无人 物，去创建一个吧！
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {characters.map((c) => (
          <CharacterCard key={c.id} character={c} onChanged={refresh} onDeleted={refresh} />
        ))}
      </div>
    </div>
  )
}

function CharacterCard({ character, onChanged, onDeleted }: { character: ReturnType<typeof useCharactersList>['characters'][number]; onChanged: () => void; onDeleted: () => void; }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const imgSrc = useMemo(() => normalizeStorageUrl(character.image_url), [character.image_url])
  const sexPrefix = (character as any)?.sex ? `${(character as any).sex}，` : ''

  const handleRename = async (name: string) => {
    try {
      await CharactersApi.updateName(character.id, { name })
      toast.success('名称已更新')
      onChanged()
    } catch (err: any) {
      toast.error(err?.message || '更新失败')
    }
  }

  const handleDelete = async () => {
    try {
      await CharactersApi.delete(character.id)
      toast.success('已删除')
      setConfirmOpen(false)
      onDeleted()
    } catch (err: any) {
      toast.error(err?.message || '删除失败')
    }
  }

  return (
    <Card className="overflow-hidden relative">
      <button
        type="button"
        aria-label="删除"
        className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/70 hover:bg-background text-muted-foreground hover:text-foreground shadow"
        onClick={() => setConfirmOpen(true)}
      >
        <X className="h-4 w-4" />
      </button>

      <CardContent className="pt-4">
        <div className="aspect-3/4 w-full overflow-hidden rounded-md bg-muted flex items-center justify-center">
          {imgSrc ? (
            <img src={imgSrc} alt={character.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground text-xs">
              <ImageIcon className="h-8 w-8 mb-1" />
              暂无图片
            </div>
          )}
        </div>

        <div className="mt-3">
          <InlineInput
            initialValue={character.name}
            onSubmit={handleRename}
            placeholder="输入新名称"
            renderDisplay={(val) => (
              <span className="text-sm text-foreground">
                <span className="text-muted-foreground">{sexPrefix}</span>
                {val || '—'}
              </span>
            )}
          />
        </div>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-xs">
          <div className="py-4">
            <div className="text-base font-semibold mb-4">确定删除？</div>
            <Button variant="destructive" className="w-full" onClick={handleDelete}>
              确定
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

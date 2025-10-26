import { useAtom } from 'jotai'
import { Check, Image as ImageIcon, Star } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCharactersList } from '@/hooks/use-characters'
import { useI18n } from '@/hooks/use-i18n'

import { activeTabAtom, charactersCompletedAtom, selectedCharacterIdsAtom, selectedCharacterRolesAtom } from '../atoms'

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

function SelectionView() {
  const { t } = useI18n('comics')
  const [, setActiveTab] = useAtom(activeTabAtom)
  const [, setCharactersCompleted] = useAtom(charactersCompletedAtom)

  // 拉取我的人物
  const { characters, loading, error, refresh } = useCharactersList()

  // 多选：存入全局 atom（只存 id）
  const [selectedIds, setSelectedIds] = useAtom(selectedCharacterIdsAtom)
  const [rolesMap, setRolesMap] = useAtom(selectedCharacterRolesAtom)

  const totalRecognized = useMemo(() => characters.length, [characters])

  const handleQuickPick = () => {
    // 一键选择：全部选择
    setSelectedIds(characters.map((c) => c.id))
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const canProceed = selectedIds.length > 0

  // 当存在 pending 项目时，轻量轮询列表刷新，直到 ready/failed 或超时
  const [tries, setTries] = useState(0)
  const timerRef = useRef<number | null>(null)
  const MAX_TRIES = 40 // ~2 分钟（40 * 3s）

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

  // 同步选择集与当前列表：当列表变化时，移除已不存在的 id
  useEffect(() => {
    const idSet = new Set(characters.map((c) => c.id))
    setSelectedIds((prev) => prev.filter((id) => idSet.has(id)))
    // 同步清理无效的角色配置
    setRolesMap((prev) => {
      const next: Record<number, string> = {}
      for (const id of selectedIds) {
        if (idSet.has(id) && prev[id]) next[id] = prev[id]
      }

      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characters])

  const updateRole = (id: number, role: string) => {
    setRolesMap((prev) => ({ ...prev, [id]: role }))
  }

  const moveUp = (index: number) => {
    if (index <= 0) return
    setSelectedIds((prev) => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]

      return next
    })
  }

  const moveDown = (index: number) => {
    if (index >= selectedIds.length - 1) return
    setSelectedIds((prev) => {
      const next = [...prev]
      ;[next[index + 1], next[index]] = [next[index], next[index + 1]]

      return next
    })
  }

  return (
    <div className="space-y-6 mt-4">
      {loading && <div className="text-sm text-muted-foreground">加载中...</div>}
      {error && (
        <div className="text-sm text-destructive">加载失败：{(error as any)?.message ?? 'Unknown error'}</div>
      )}

      {!loading && !error && characters.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          暂无人 物，去创建一个吧！
        </div>
      )}

      {/* 角色网格 */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-6">
        {characters.map((char) => {
          const selected = selectedIds.includes(char.id)
          const imgSrc = normalizeStorageUrl(char.image_url)
          const sexPrefix = (char as any)?.sex ? `${(char as any).sex}，` : ''

          return (
            <Card
              key={char.id}
              className="relative cursor-pointer transition-all hover:shadow-md"
              onClick={() => toggleSelect(char.id)}
              aria-pressed={selected}
              data-selected={selected}
            >
              {selected && (
                <div className="absolute left-2 top-2 z-10 rounded-full bg-primary text-primary-foreground p-1 shadow">
                  <Check className="h-4 w-4" />
                </div>
              )}
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="w-full aspect-3/4 rounded-md bg-muted overflow-hidden flex items-center justify-center">
                  {imgSrc ? (
                    <img src={imgSrc} alt={char.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground text-xs">
                      <ImageIcon className="h-8 w-8 mb-1" />
                      暂无图片
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-sm">
                    <span className="text-muted-foreground">{sexPrefix}</span>
                    {char.name || '—'}
                  </p>
                  {char.description && (
                    <p
                      className="text-sm text-muted-foreground leading-snug overflow-hidden"
                      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                    >
                      {char.description}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}

        <Card className="flex items-center justify-center bg-muted/70">
          <CardContent className="p-6 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <div className="rounded-xl bg-background/70 p-3">
              <Star className="h-6 w-6" />
            </div>
            <p>{String(t('characters.more'))}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-6 py-4">
        <div>
          <p className="mb-2 text-foreground text-xl">{String(t('characters.selectPrompt'))}
          </p>
          <p className='text-muted-foreground'>
            {String(t('characters.recognized', { count: totalRecognized }))}
          </p>
        </div>
        <Button variant="default" onClick={handleQuickPick}>{String(t('characters.quickPick'))}</Button>
      </div>

      {/* 角色职责与顺序设置（使用普通列表布局，不使用 Card） */}
      {selectedIds.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-medium">出镜人物职责与顺序</p>
            <p className="text-sm text-muted-foreground">上移/下移改变顺序（顺序即 order_index），职责即 role</p>
          </div>
          <div className="space-y-3">
            {selectedIds.map((id, index) => {
              const char = characters.find((c) => c.id === id)
              const currentRole = rolesMap[id] || (index === 0 ? 'protagonist' : 'supporting')

              return (
                <div key={id} className="flex items-center gap-4 rounded-md border p-3">
                  <div className="w-6 text-sm text-muted-foreground">{index + 1}</div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{char?.name || `#${id}`}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">职责</Label>
                    <Select value={currentRole} onValueChange={(v) => updateRole(id, v)}>
                      <SelectTrigger className="w-36 h-8">
                        <SelectValue placeholder="选择职责" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="protagonist">主角</SelectItem>
                        <SelectItem value="supporting">配角</SelectItem>
                        <SelectItem value="antagonist">反派</SelectItem>
                        <SelectItem value="cameo">客串</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => moveUp(index)}>上移</Button>
                    <Button size="sm" variant="outline" onClick={() => moveDown(index)}>下移</Button>
                  </div>
                </div>
              )},
            )}
          </div>
        </div>
      )}

      {/* 下一步 */}
      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={() => {
            setActiveTab('panels')
            setCharactersCompleted(true)
          }}
          disabled={!canProceed}
        >
          {String(t('common.next'))}
        </Button>
      </div>
    </div>
  )
}

export function CharactersTab() {
  return <SelectionView />
}

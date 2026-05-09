import { useAtom } from 'jotai'
import { Check, Image as ImageIcon, Pencil, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAiProviders } from '@/hooks/use-ai-providers'
import { useAuth } from '@/hooks/use-auth'
import { useCharactersList } from '@/hooks/use-characters'
import { useI18n } from '@/hooks/use-i18n'
import { proxiedStatic } from '@/lib/utils'
import type { ICharacter } from '@/service/types'

import { activeTabAtom, charactersCompletedAtom, selectedCharacterIdsAtom, selectedCharacterRolesAtom } from '../atoms'
import { ComicsWorkflowShell, WorkflowActionBar } from '../components/workflow-layout'
import { getCharacterDisplayName, getCharacterImageState } from './character-display'
import { CharacterUpsertDialog } from './character-upsert-dialog'

function SelectionView() {
  const { t } = useI18n('comics')
  const { user } = useAuth()
  const [, setActiveTab] = useAtom(activeTabAtom)
  const [, setCharactersCompleted] = useAtom(charactersCompletedAtom)

  // 拉取我的人物
  const { characters, loading, error, refresh } = useCharactersList()
  const { providers } = useAiProviders()
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingCharacter, setEditingCharacter] = useState<ICharacter | undefined>()
  const [dialogOpen, setDialogOpen] = useState(false)

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
    setSelectedIds((prev) => {
      const next = prev.filter((id) => idSet.has(id))

      return next.length === prev.length ? prev : next
    })
    // 同步清理无效的角色配置
    setRolesMap((prev) => {
      const next: Record<number, string> = {}
      for (const id of selectedIds) {
        if (idSet.has(id) && prev[id]) next[id] = prev[id]
      }

      const prevKeys = Object.keys(prev)
      const nextKeys = Object.keys(next)

      if (prevKeys.length === nextKeys.length && nextKeys.every((key) => prev[Number(key)] === next[Number(key)])) {
        return prev
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

  const openCreateDialog = () => {
    setDialogMode('create')
    setEditingCharacter(undefined)
    setDialogOpen(true)
  }

  const openEditDialog = (character: ICharacter) => {
    setDialogMode('edit')
    setEditingCharacter(character)
    setDialogOpen(true)
  }

  const handleCharacterSaved = async (character: ICharacter) => {
    await refresh()
    if (dialogMode === 'create') {
      setSelectedIds((prev) => (prev.includes(character.id) ? prev : [...prev, character.id]))
    }
  }

  return (
    <ComicsWorkflowShell>
      {loading && <div className="text-sm text-muted-foreground">加载中...</div>}
      {error && (
        <div className="text-sm text-destructive">加载失败：{(error as any)?.message ?? 'Unknown error'}</div>
      )}

      {!loading && !error && characters.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          暂无人物，去创建一个吧！
        </div>
      )}

      {/* 角色网格 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {characters.map((char) => {
          const selected = selectedIds.includes(char.id)
          const imgSrc = proxiedStatic(char.image_url || undefined)
          const sexPrefix = (char as any)?.sex ? `${(char as any).sex}，` : ''
          const displayName = getCharacterDisplayName(char)
          const imageState = getCharacterImageState(char)
          const canEdit = user?.id === char.user_id
          const isSharedPublic = !canEdit && char.is_public

          return (
            <Card
              key={char.id}
              className="relative cursor-pointer rounded-lg transition-all hover:shadow-md"
              onClick={() => toggleSelect(char.id)}
              aria-pressed={selected}
              data-selected={selected}
            >
              {selected && (
                <div className="absolute left-2 top-2 z-10 rounded-full bg-primary text-primary-foreground p-1 shadow">
                  <Check className="h-4 w-4" />
                </div>
              )}
              {canEdit ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  aria-label={`编辑 ${displayName}`}
                  className="absolute right-2 top-2 z-10 shadow"
                  onClick={(event) => {
                    event.stopPropagation()
                    openEditDialog(char)
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
              ) : isSharedPublic ? (
                <Badge
                  variant="secondary"
                  className="absolute right-2 top-2 z-10 shadow"
                  title="公开人物只能选择，不能编辑"
                >
                  公开
                </Badge>
              ) : null}
              <CardContent className="p-4 flex flex-col gap-3">
                <div
                  className="w-full aspect-3/4 rounded-md bg-muted overflow-hidden flex items-center justify-center"
                  title={imageState.title}
                >
                  {imgSrc ? (
                    <img src={imgSrc} alt={displayName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center px-4 text-center text-xs text-muted-foreground">
                      <ImageIcon className="h-8 w-8 mb-1" />
                      <span className={imageState.kind === 'failed' ? 'font-medium text-destructive' : 'font-medium text-foreground/80'}>
                        {imageState.label}
                      </span>
                      {imageState.detail && (
                        <span className="mt-1 line-clamp-2 max-w-full break-words leading-snug">
                          {imageState.detail}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-sm">
                    <span className="text-muted-foreground">{sexPrefix}</span>
                    {displayName}
                  </p>
                  {char.description && (
                    <p
                      className="text-sm text-muted-foreground leading-snug overflow-hidden"
                      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                    >
                      {char.description}
                    </p>
                  )}
                  {isSharedPublic && (
                    <p className="text-xs text-muted-foreground">来自公开角色库，只可选择</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}

        <Card
          role="button"
          tabIndex={0}
          className="flex cursor-pointer items-center justify-center rounded-lg bg-muted/70 transition-colors hover:bg-muted"
          onClick={openCreateDialog}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              openCreateDialog()
            }
          }}
        >
          <CardContent className="p-6 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <div className="rounded-xl bg-background/70 p-3">
              <Plus className="h-6 w-6" />
            </div>
            <p>新建人物</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-muted/50 px-6 py-4">
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
                <div key={id} className="flex flex-wrap items-center gap-4 rounded-md border p-3">
                  <div className="w-6 text-sm text-muted-foreground">{index + 1}</div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{char ? getCharacterDisplayName(char) : `#${id}`}</div>
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
      <WorkflowActionBar>
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
      </WorkflowActionBar>
      <CharacterUpsertDialog
        mode={dialogMode}
        open={dialogOpen}
        character={editingCharacter}
        providers={providers}
        onOpenChange={setDialogOpen}
        onSaved={handleCharacterSaved}
      />
    </ComicsWorkflowShell>
  )
}

export function CharactersTab() {
  return <SelectionView />
}

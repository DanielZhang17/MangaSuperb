import { Loader2, Upload, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import useSWR from 'swr'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useSetAtom } from 'jotai'

import { ComicsApi } from '@/apis/comics'
import { ScriptsApi } from '@/apis/scripts'
import { ShareCard } from '@/components/common/share-card'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import useAuth from '@/hooks/use-auth'
import { useI18n } from '@/hooks/use-i18n'
import { useDeleteComic } from '@/hooks/use-comics'
import { cn, proxiedStatic } from '@/lib/utils'
import {
  activeTabAtom,
  aspectRatioAtom,
  characterStepAtom,
  charactersCompletedAtom,
  currentComicDetailAtom,
  currentComicIdAtom,
  fullStoryAtom,
  mangaTitleAtom,
  pageLayoutSelectionAtom,
  selectedCharacterIdsAtom,
  selectedCharacterRolesAtom,
  storyCompletedAtom,
  storyStepAtom,
  styleAtom,
  colorModeAtom,
} from '@/pages/comics/atoms'
import type { ColorMode, IComic } from '@/service/types'

export default function IdeasGrid() {
  const { user } = useAuth()
  const { t } = useI18n(['me', 'comics'])
  const navigate = useNavigate()

  const { data, isLoading, error, mutate } = useSWR('comics:list:mine', () => ComicsApi.list())
  const comics = data?.comics ?? []
  const { deleteComic, state: deleteState } = useDeleteComic()

  const setActiveTab = useSetAtom(activeTabAtom)
  const setCurrentComicId = useSetAtom(currentComicIdAtom)
  const setCurrentComicDetail = useSetAtom(currentComicDetailAtom)
  const setMangaTitle = useSetAtom(mangaTitleAtom)
  const setFullStory = useSetAtom(fullStoryAtom)
  const setStyle = useSetAtom(styleAtom)
  const setColorMode = useSetAtom(colorModeAtom)
  const setAspectRatio = useSetAtom(aspectRatioAtom)
  const setSelectedCharacterIds = useSetAtom(selectedCharacterIdsAtom)
  const setSelectedCharacterRoles = useSetAtom(selectedCharacterRolesAtom)
  const setStoryCompleted = useSetAtom(storyCompletedAtom)
  const setCharactersCompleted = useSetAtom(charactersCompletedAtom)
  const setStoryStep = useSetAtom(storyStepAtom)
  const setCharacterStep = useSetAtom(characterStepAtom)
  const setPageLayoutSelection = useSetAtom(pageLayoutSelectionAtom)
  const [loadingComicId, setLoadingComicId] = useState<number | null>(null)
  const [likeState, setLikeState] = useState<Record<number, { liked: boolean; count: number }>>({})
  const [likePending, setLikePending] = useState<Record<number, boolean>>({})
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [comicToDelete, setComicToDelete] = useState<number | null>(null)

  const toAbsoluteStorage = (url?: string | null) => {
    if (!url) return ''
    const storage = 'https://storage.mangasuperb.anranz.xyz'
    // If already absolute to storage, keep
    if (/^https?:\/\//i.test(url)) return url
    // If proxied path like /static/... or /manga/..., prefix storage origin
    if (url.startsWith('/static') || url.startsWith('/manga')) return `${storage}${url}`
    
    return url
  }

  const handleToggleLike = async (comicId: number) => {
    if (Number.isNaN(comicId)) return

    const entry = likeState[comicId] ?? {
      liked: false,
      count: (() => {
        const comic = comics.find((c) => Number(c.id) === comicId)
        return typeof comic?.like_count === 'number' ? comic.like_count : 0
      })(),
    }
    const targetLike = !entry.liked
    setLikePending((prev) => ({ ...prev, [comicId]: true }))

    try {
      const res = targetLike
        ? await ComicsApi.like(comicId)
        : await ComicsApi.unlike(comicId)
      const nextCount = typeof res?.like_count === 'number'
        ? res.like_count
        : typeof (res?.comic?.like_count) === 'number'
          ? res.comic.like_count
          : Math.max(0, entry.count + (targetLike ? 1 : -1))
      setLikeState((prev) => ({
        ...prev,
        [comicId]: {
          liked: targetLike,
          count: nextCount,
        },
      }))
      mutate()
    } catch (err: any) {
      toast.error(err?.message || (targetLike ? '点赞失败，请稍后重试' : '取消点赞失败，请稍后重试'))
    } finally {
      setLikePending((prev) => {
        const { [comicId]: _unused, ...rest } = prev
        return rest
      })
    }
  }

  useEffect(() => {
    const list: IComic[] = data?.comics ?? []
    if (!list.length) {
      setLikeState({})
      return
    }

    setLikeState((prev) => {
      const next: Record<number, { liked: boolean; count: number }> = {}
      for (const comic of list) {
        const id = Number(comic.id)
        if (Number.isNaN(id)) continue
        const serverCount = typeof comic.like_count === 'number' ? comic.like_count : prev[id]?.count ?? 0
        const serverLikedRaw = (comic as any)?.user_liked
        const serverLiked = typeof serverLikedRaw === 'boolean' ? Boolean(serverLikedRaw) : undefined
        const previous = prev[id]
        next[id] = {
          liked: serverLiked ?? previous?.liked ?? false,
          count: serverCount,
        }
      }
      return next
    })
  }, [data])

  const handleResume = async (comicId: number) => {
    setLoadingComicId(comicId)
    try {
      const detail = await ComicsApi.get(comicId) as (IComic & {
        script_id?: number
        characters?: any[]
        pages?: any[]
        panel_shots?: any[]
        page_layouts?: any[]
        outline_sections?: any[]
      })

      if (!detail || typeof detail !== 'object') {
        throw new Error('未能加载漫画详情')
      }

      let story = ''
      let style = detail.style_description || ''
      let aspect = detail.aspect_ratio || '16:9'
      let colorMode: ColorMode = 'black-white'
      let scriptTitle: string | undefined

      let scriptCharacterIds: number[] = []
      let scriptRolesMap: Record<number, string> = {}

      if (detail.script_id) {
        try {
          const script = await ScriptsApi.get(Number(detail.script_id))
          scriptTitle = script?.title
          const rawContent = script?.content
          if (typeof rawContent === 'string' && rawContent.trim()) {
            try {
              const parsed = JSON.parse(rawContent)
              if (parsed && typeof parsed === 'object') {
                if (typeof parsed.story === 'string') story = parsed.story
                if (typeof parsed.style_description === 'string') style = parsed.style_description
                if (typeof parsed.aspect_ratio === 'string') aspect = parsed.aspect_ratio
                if (typeof parsed.color_mode === 'string') {
                  const candidate = parsed.color_mode.trim() as ColorMode
                  if (candidate === 'color' || candidate === 'black-white') {
                    colorMode = candidate
                  }
                }
                const parsedCharacters = Array.isArray(parsed.characters) ? parsed.characters : []
                if (parsedCharacters.length > 0) {
                  const ids: number[] = []
                  const roles: Record<number, string> = {}
                  parsedCharacters.forEach((entry: any) => {
                    const cid = typeof entry?.id === 'number' ? entry.id : undefined
                    if (cid) {
                      ids.push(cid)
                      if (typeof entry?.role === 'string' && entry.role.trim()) {
                        roles[cid] = entry.role.trim()
                      }
                    }
                  })
                  scriptCharacterIds = ids
                  scriptRolesMap = roles
                }
              }
            } catch (err) {
              console.warn('Failed to parse script content', err)
            }
          }
        } catch (err) {
          console.warn('Failed to load script for comic', err)
        }
      }

      if (!story && Array.isArray(detail.outline_sections) && detail.outline_sections.length > 0) {
        story = detail.outline_sections
          .map((section: any) => (typeof section?.summary === 'string' ? section.summary.trim() : ''))
          .filter(Boolean)
          .join('\n\n')
      }

      const charactersRaw = Array.isArray(detail.characters) ? detail.characters : []
      const characterIds: number[] = []
      const rolesMap: Record<number, string> = {}
      charactersRaw.forEach((entry: any) => {
        const cid = typeof entry?.character_id === 'number'
          ? entry.character_id
          : (typeof entry?.id === 'number' ? entry.id : null)
        if (cid) {
          characterIds.push(cid)
          if (typeof entry?.role === 'string' && entry.role.trim()) {
            rolesMap[cid] = entry.role.trim()
          }
        }
      })

      const baseIds = characterIds.length > 0 ? characterIds : scriptCharacterIds
      const finalCharacterIds = baseIds.filter((id, idx, arr) => arr.indexOf(id) === idx)
      const finalRoles: Record<number, string> = {}
      finalCharacterIds.forEach((cid) => {
        if (scriptRolesMap[cid]) finalRoles[cid] = scriptRolesMap[cid]
      })
      characterIds.forEach((cid) => {
        if (rolesMap[cid]) finalRoles[cid] = rolesMap[cid]
      })

      const layoutMap = Array.isArray(detail.page_layouts)
        ? detail.page_layouts.reduce<Record<number, string>>((acc, layout: any) => {
            const pageNumber = Number(layout?.page_number)
            const layoutKey = typeof layout?.layout_key === 'string' ? layout.layout_key : null
            if (!Number.isNaN(pageNumber) && layoutKey) acc[pageNumber] = layoutKey
            return acc
          }, {})
        : {}

      const hasPages = Array.isArray(detail.pages) && detail.pages.length > 0
      const hasPanels = Array.isArray(detail.panel_shots) && detail.panel_shots.length > 0

      const nextTab: 'story' | 'characters' | 'panels' | 'image-generation' = hasPages
        ? 'image-generation'
        : hasPanels
          ? 'panels'
          : finalCharacterIds.length > 0
            ? 'characters'
            : 'story'

      setActiveTab(nextTab)
      setStoryStep('input')
      setCharacterStep('selection')
      setPageLayoutSelection(layoutMap)

      setCurrentComicId(detail.id)
      setCurrentComicDetail(detail)
      setMangaTitle(detail.title || scriptTitle || '未命名漫画')
      setFullStory(story || '')
      setStyle(style || 'Classic manga black and white linework.')
      setAspectRatio(aspect || '16:9')
      if (typeof (detail as any)?.color_mode === 'string') {
        const candidate = String((detail as any).color_mode).trim() as ColorMode
        if (candidate === 'color' || candidate === 'black-white') {
          colorMode = candidate
        }
      }
      setColorMode(colorMode)
      setSelectedCharacterIds(finalCharacterIds)
      setSelectedCharacterRoles(finalRoles)
      setStoryCompleted(Boolean((story || '').trim().length))
      setCharactersCompleted(finalCharacterIds.length > 0)

      toast.success('已载入漫画，继续创作吧！')
      navigate('/comics')
    } catch (err: any) {
      console.error('Failed to resume comic', err)
      toast.error(err?.message || '加载漫画失败，请稍后重试')
    } finally {
      setLoadingComicId(null)
    }
  }

  const handleDeleteClick = (comicId: number) => {
    setComicToDelete(comicId)
    setDeleteConfirmOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!comicToDelete) return

    try {
      await deleteComic(comicToDelete)
      toast.success('漫画已删除')
      setDeleteConfirmOpen(false)
      setComicToDelete(null)
      mutate()
    } catch (err: any) {
      toast.error(err?.message || '删除漫画失败，请稍后重试')
    }
  }

  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false)
    setComicToDelete(null)
  }

  return (
    <div className="grid gap-3 sm:gap-4 justify-items-start grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {isLoading && Array.from({ length: 6 }).map((_, i) => (
        <Card key={`skeleton-${i}`} className="overflow-hidden border-none bg-transparent p-0 shadow-none">
          <div className="aspect-square w-full animate-pulse rounded-2xl bg-muted" />
        </Card>
      ))}

      {error && (
        <div className="col-span-full text-sm text-destructive">加载失败，请稍后重试。</div>
      )}

      {!isLoading && !error && comics.map((c) => {
        const numericId = Number(c.id)
        const rawImage: string | null = (c as any).cover_image_url || (c as any).image_url || null
        const rawPdf: string | null = (c as any).pdf_url || null
        const publishedAt = (c as any).published_at
        const isPublished = Boolean(publishedAt) && Boolean(rawPdf)

        const img = proxiedStatic(rawImage)
        const proxied = img || undefined

        const absolutePdf = toAbsoluteStorage(rawPdf)
        const proxiedPdf = rawPdf ? proxiedStatic(rawPdf) : null
        const sharePdfLink = absolutePdf || rawPdf || proxiedPdf || proxied || ''

        const handleCopy = async () => {
          try {
            if (sharePdfLink) {
              await navigator.clipboard.writeText(sharePdfLink)
              toast.success(String(t('comics:publish.pdfCopied')))
            } else {
              throw new Error('暂无可用链接')
            }
          } catch (err: any) {
            toast.error(err?.message || '复制失败')
          }
        }

        const handlePublish = async () => {
          if (isPublished && sharePdfLink) {
            try {
              await navigator.clipboard.writeText(sharePdfLink)
              toast.success(String(t('comics:publish.pdfCopied')))
            } catch (err: any) {
              toast.error(err?.message || String(t('comics:publish.failed')))
            }
            return
          }

          try {
            const resp = await ComicsApi.publish(Number(c.id), { make_public: true })
            const stageJobs = (resp as any)?.stage_jobs ?? null
            if (stageJobs) {
              toast.success(String(t('comics:publish.queueStarted')))
            } else {
              const pdfUrl = (resp as any)?.pdf_url || (resp as any)?.comic?.pdf_url
              if (pdfUrl) {
                toast(String(t('comics:publish.noChanges')))
                const shareLink = toAbsoluteStorage(pdfUrl) || pdfUrl
                try {
                  await navigator.clipboard.writeText(shareLink)
                  toast.success(String(t('comics:publish.pdfCopied')))
                } catch {
                  // ignore copy failure after toast
                }
              } else {
                toast(String(t('comics:publish.noChanges')))
              }
            }
          } catch (err: any) {
            toast.error(err?.message || String(t('comics:publish.failed')))
          }
        }

        const isResuming = loadingComicId === c.id

        return (
          <ShareCard
            key={c.id}
            share={{
              id: String(c.id),
              message: c.title || '未命名',
              name: user?.username || String(t('me.username.guest')),
            }}
            imageUrl={proxied}
            likeCount={likeState[numericId]?.count ?? (typeof c.like_count === 'number' ? c.like_count : 0)}
            liked={likeState[numericId]?.liked ?? false}
            likePending={Boolean(likePending[numericId])}
            onToggleLike={() => handleToggleLike(numericId)}
            leftExtra={(
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleResume(Number(c.id))}
                  disabled={isResuming}
                >
                  {isResuming ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    '继续创作'
                  )}
                </Button>
                <Button
                  size="icon-sm"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteClick(Number(c.id))
                  }}
                  disabled={deleteState.isMutating}
                  aria-label="删除漫画"
                >
                  <Trash2 className="size-4" />
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="icon-sm" variant="secondary" aria-label="分享至">
                      <Upload className="size-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader>
                      <DialogTitle>分享至</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-3 gap-3 pt-2">
                      <a
                        href={sharePdfLink || '#'}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-md border p-3 text-sm hover:bg-accent',
                          !sharePdfLink && 'pointer-events-none opacity-60'
                        )}
                      >
                        保存本地
                      </a>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="flex flex-col items-center gap-2 rounded-md border p-3 text-sm hover:bg-accent"
                      >
                        复制链接
                      </button>
                      <button
                        type="button"
                        onClick={handlePublish}
                        className="flex flex-col items-center gap-2 rounded-md border p-3 text-sm hover:bg-accent"
                      >
                        发布
                      </button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          />
        )
      })}

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              您确定要删除这个漫画吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={handleDeleteCancel}
              disabled={deleteState.isMutating}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteState.isMutating}
            >
              {deleteState.isMutating ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  删除中...
                </>
              ) : (
                '删除'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { useAtom } from 'jotai'
import { Image as ImageIcon, Pencil } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

import { ComicsApi } from '@/apis/comics'
import { JobsApi } from '@/apis/jobs'
import PanelsApi from '@/apis/panels'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/hooks/use-i18n'

import {
  activeTabAtom,
  aspectRatioAtom,
  currentComicDetailAtom,
  currentComicIdAtom,
  defaultLayoutAtom,
  colorModeAtom,
  fullStoryAtom,
  mangaTitleAtom,
  pageLayoutSelectionAtom,
  selectedCharacterIdsAtom,
  selectedCharacterRolesAtom,
  selectedPageAtom,
  styleAtom,
} from '../atoms'
import { PageSidebar } from '../components/page-sidebar'

const LAYOUT_OPTIONS = [
  { value: 'auto-grid', label: '自动布局 (auto-grid)' },
  { value: 'grid-2x2', label: '四宫格 (grid-2x2)' },
  { value: 'vertical', label: '竖版长条 (vertical)' },
  { value: 'cinematic', label: '宽银幕 (cinematic)' },
]

const DEFAULT_LAYOUT = LAYOUT_OPTIONS[0]!.value

function PanelCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="rounded-3xl border border-border/60 bg-muted/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-foreground/80">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  )
}

function LabelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function collectExistingPages(detail: any | null): Set<number> {
  const pages = new Set<number>()
  if (!detail) return pages

  const layouts = Array.isArray(detail?.page_layouts) ? detail.page_layouts : []
  const shots = Array.isArray(detail?.panel_shots) ? detail.panel_shots : []

  for (const entry of layouts) {
    const page = Number(entry?.page_number)
    if (Number.isFinite(page) && page > 0) pages.add(page)
  }

  for (const entry of shots) {
    const page = Number(entry?.page_number)
    if (Number.isFinite(page) && page > 0) pages.add(page)
  }

  return pages
}

export function PanelsTab() {
  const { t } = useI18n('comics')
  const [comicId, setComicId] = useAtom(currentComicIdAtom)
  const [comicDetail, setComicDetail] = useAtom(currentComicDetailAtom)
  const [, setActiveTab] = useAtom(activeTabAtom)
  const [title] = useAtom(mangaTitleAtom)
  const [story] = useAtom(fullStoryAtom)
  const [style] = useAtom(styleAtom)
  const [colorMode] = useAtom(colorModeAtom)
  const [aspect] = useAtom(aspectRatioAtom)
  const [selectedIds] = useAtom(selectedCharacterIdsAtom)
  const [rolesMap] = useAtom(selectedCharacterRolesAtom)
  const [selectedPage] = useAtom(selectedPageAtom)
  const [layoutSelections, setLayoutSelections] = useAtom(pageLayoutSelectionAtom)
  const [defaultLayout] = useAtom(defaultLayoutAtom)
  const [submitting, setSubmitting] = useState(false)
  const [polling, setPolling] = useState(false)
  const [pollPct, setPollPct] = useState(0)
  const pollRef = (typeof window !== 'undefined' ? (window as any) : {}) as { __panelsPoll?: number | null }
  const [editingPanelId, setEditingPanelId] = useState<number | null>(null)
  const [editingDialogue, setEditingDialogue] = useState<string>('')
  const [savingId, setSavingId] = useState<number | null>(null)

  const shots = useMemo<any[]>(() => (comicDetail?.panel_shots ?? []), [comicDetail])
  const sortedShots = useMemo<any[]>(() => {
    const arr = [...shots]
    arr.sort((a: any, b: any) => {
      const sa = typeof a?.sequence_index === 'number'
        ? a.sequence_index
        : (a?.page_number ?? 0) * 100 + (a?.panel_number ?? 0)
      const sb = typeof b?.sequence_index === 'number'
        ? b.sequence_index
        : (b?.page_number ?? 0) * 100 + (b?.panel_number ?? 0)

      return sa - sb
    })

    return arr
  }, [shots])
  const shotsForSelectedPage = useMemo<any[]>(() => {
    if (!selectedPage) return []
    return sortedShots.filter((s: any) => Number(s?.page_number) === Number(selectedPage))
  }, [sortedShots, selectedPage])

  const existingPages = useMemo(() => collectExistingPages(comicDetail), [comicDetail])
  const isPlaceholderPage = selectedPage ? !existingPages.has(selectedPage) : false

  const layoutFromDetail = useMemo(() => {
    if (!comicDetail || !selectedPage) return undefined
    const layouts = Array.isArray(comicDetail.page_layouts) ? comicDetail.page_layouts : []
    const match = layouts.find((entry: any) => Number(entry?.page_number) === Number(selectedPage))
    return typeof match?.layout_key === 'string' ? match.layout_key : undefined
  }, [comicDetail, selectedPage])

  useEffect(() => {
    if (!selectedPage) return
    if (layoutFromDetail && layoutSelections[selectedPage] !== layoutFromDetail) {
      setLayoutSelections((prev) => {
        if (prev[selectedPage] === layoutFromDetail) return prev
        return { ...prev, [selectedPage]: layoutFromDetail }
      })
    } else if (!layoutFromDetail && !layoutSelections[selectedPage]) {
      setLayoutSelections((prev) => {
        if (prev[selectedPage]) return prev
        return { ...prev, [selectedPage]: defaultLayout || DEFAULT_LAYOUT }
      })
    }
  }, [layoutFromDetail, layoutSelections, selectedPage, setLayoutSelections, defaultLayout])

  const selectedLayout =
    (selectedPage ? layoutSelections[selectedPage] : undefined) ??
    layoutFromDetail ??
    defaultLayout ??
    DEFAULT_LAYOUT

  const handleGeneratePanels = async () => {
    if (!selectedPage || selectedPage <= 0) {
      toast.error('请选择页面后再生成分镜')
      return
    }

    try {
      setSubmitting(true)
      let cid = comicId

      if (!cid) {
        const characters = selectedIds.map((id, idx) => ({
          id,
          order_index: idx + 1,
          role: rolesMap[id] || (idx === 0 ? 'protagonist' : 'supporting'),
        }))

        const createRes = await ComicsApi.create({
          title: title || '未命名',
          story,
          style: style || '',
          color_mode: colorMode,
          aspect_ratio: aspect || '16:9',
          characters,
        })

        const created = (createRes as any)?.comic
        if (!created?.id) throw new Error('创建漫画失败')
        cid = created.id
        setComicId(cid)
        setComicDetail(created)
        toast.success('漫画已创建')
      }

      const latestDetail = cid ? await ComicsApi.get(cid) : null
      if (latestDetail) {
        setComicDetail(latestDetail as any)
      }

      const hasShotsNow = (latestDetail?.panel_shots ?? shots ?? []).some(
        (s: any) => Number(s?.page_number) === Number(selectedPage),
      )

      if (!hasShotsNow) {
        let shotJobId: string | undefined
        try {
          const jobResp = await JobsApi.createComic({ job_type: 'story_optimization', comic_id: cid as number })
          shotJobId = jobResp?.shot_job_id || jobResp?.stage_jobs?.shot_job_id || undefined
          toast.success('已提交分镜生成任务')
        } catch (err: any) {
          toast.error(err?.message || '提交分镜任务失败')
          return
        }

        await pollComicUntilShots(cid as number, selectedPage, shotJobId)
      }

      const res = await PanelsApi.setLayout(cid as number, {
        page_number: selectedPage,
        layout_key: selectedLayout,
      })
      const layoutComic = (res as any)?.comic
      if (layoutComic) {
        setComicDetail(layoutComic)
      }
    } catch (e: any) {
      if (pollRef.__panelsPoll) {
        window.clearInterval(pollRef.__panelsPoll)
        pollRef.__panelsPoll = null
      }
      setPolling(false)
      toast.error(e?.message || '分镜生成失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function pollComicUntilShots(cid: number, targetPage: number, shotJobId?: string) {
    if (pollRef.__panelsPoll) {
      window.clearInterval(pollRef.__panelsPoll)
      pollRef.__panelsPoll = null
    }

    setPolling(true)
    setPollPct(0)
    const started = Date.now()
    const MAX_MS = 180000

    return new Promise<void>((resolve, reject) => {
      const tick = async () => {
        const elapsed = Date.now() - started
        const pct = Math.min(100, Math.round((elapsed / MAX_MS) * 100))
        setPollPct(pct)
        try {
          const latest = await ComicsApi.get(cid)
          const comic = latest as any
          setComicDetail(comic)
          const shotsArr: any[] = comic?.panel_shots ?? []
          const hasShotsForPage = shotsArr.some((s) => Number(s?.page_number) === Number(targetPage))
          if (hasShotsForPage) {
            toast.success('分镜生成成功')
            if (pollRef.__panelsPoll) {
              window.clearInterval(pollRef.__panelsPoll)
              pollRef.__panelsPoll = null
            }

            setPolling(false)
            setPollPct(100)
            resolve()
            return
          }

          if (shotJobId) {
            try {
              const job = await JobsApi.get(shotJobId)
              const status = job?.rq_status
              if (status === 'failed') {
                throw new Error(job?.error || '分镜生成任务失败')
              }
              if (status === 'finished' && !hasShotsForPage) {
                throw new Error('该页面没有生成新的分镜，请在故事中添加更多内容后重试。')
              }
            } catch (jobErr: any) {
              if (pollRef.__panelsPoll) {
                window.clearInterval(pollRef.__panelsPoll)
                pollRef.__panelsPoll = null
              }
              setPolling(false)
              reject(jobErr instanceof Error ? jobErr : new Error(jobErr?.message || '分镜任务失败'))
              return
            }
          }
        } catch (err) {
          console.warn('轮询分镜失败', err)
        }

        if (elapsed >= MAX_MS) {
          if (pollRef.__panelsPoll) {
            window.clearInterval(pollRef.__panelsPoll)
            pollRef.__panelsPoll = null
          }

          setPolling(false)
          reject(new Error('分镜数据生成超时，请检查故事是否足够生成新页面。'))
        }
      }

      // Wait 2 seconds before starting to poll
      window.setTimeout(() => {
        tick()
        pollRef.__panelsPoll = window.setInterval(tick, 2000)
      }, 2000)
    })
  }

  const emptyStateMessage = isPlaceholderPage
    ? '新页面暂无分镜，请点击下侧“生成分镜”。'
    : '该页面暂无分镜数据，请点击下侧“生成分镜”。'

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <PageSidebar className="w-full lg:w-44" />

      <div className="flex-1 space-y-6">
        <Card className="border-0 bg-transparent shadow-none">
          <CardContent className="space-y-4 p-0">
            {shotsForSelectedPage.length === 0 ? (
              <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/40 text-muted-foreground">
                <div className="flex flex-col items-center gap-2 px-6 text-center text-sm leading-relaxed">
                  <ImageIcon className="h-8 w-8" />
                  <span>{emptyStateMessage}</span>
                </div>
              </div>
            ) : (
              shotsForSelectedPage.map((s: any, idx: number) => {
                const isEditing = editingPanelId === s.id
                const displayText = (s.dialogue && s.dialogue.trim()) ? s.dialogue : (s.description ?? '')
                const panelIndex = typeof s?.panel_number === 'number' ? s.panel_number : idx + 1

                return (
                  <div
                    key={`${s.page_number}-${s.panel_number}-${s.id ?? idx}`}
                    className="flex items-start gap-4 rounded-2xl border border-border/40 bg-background/60 p-4"
                  >
                    <div className="w-10 text-lg font-bold">{String(panelIndex).padStart(2, '0')}</div>
                    <div className="flex-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {isEditing ? (
                        <Textarea
                          value={editingDialogue}
                          onChange={(e) => setEditingDialogue(e.target.value)}
                          placeholder="填写对白（必填）"
                          className="min-h-[72px] text-sm"
                        />
                      ) : (
                        <>{displayText}</>
                      )}
                    </div>
                    <div className="ml-4 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="hidden sm:inline">第{s.page_number}页 · #{panelIndex}</span>
                      {!isEditing ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="编辑对白"
                          onClick={() => {
                            setEditingPanelId(s.id)
                            setEditingDialogue(s.dialogue || s.description || '')
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={async () => {
                              if (!editingDialogue.trim()) {
                                toast.error('对白不能为空')
                                return
                              }

                              try {
                                setSavingId(s.id)
                                await PanelsApi.updatePanel(s.id, { dialogue: editingDialogue.trim() })
                                if (comicId) {
                                  const latest = await ComicsApi.get(comicId)
                                  setComicDetail(latest as any)
                                }

                                setEditingPanelId(null)
                                setEditingDialogue('')
                                toast.success('已保存')
                              } catch (err: any) {
                                toast.error(err?.message || '保存失败')
                              } finally {
                                setSavingId(null)
                              }
                            }}
                            disabled={savingId === s.id}
                          >
                            {savingId === s.id ? '保存中…' : '保存'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingPanelId(null)
                              setEditingDialogue('')
                            }}
                            disabled={savingId === s.id}
                          >
                            取消
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <PanelCard title="布局">
            <LabelRow label="页面布局">
              <Select
                value={selectedLayout}
                onValueChange={(value) => {
                  if (!selectedPage) return
                  setLayoutSelections((prev) => ({ ...prev, [selectedPage]: value }))
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="选择布局" />
                </SelectTrigger>
                <SelectContent>
                  {LAYOUT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelRow>
          </PanelCard>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              variant="outline"
              onClick={handleGeneratePanels}
              disabled={submitting || polling}
            >
              {submitting ? '提交中…' : polling ? `生成分镜中… ${pollPct}%` : '生成分镜'}
            </Button>
            <Button
              size="lg"
              onClick={() => setActiveTab('image-generation')}
              disabled={shotsForSelectedPage.length === 0}
            >
              {String(t('common.next'))}
            </Button>
          </div>
          {polling && (
            <div className="w-64">
              <Progress value={pollPct} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

import { useAtom } from 'jotai'
import { Image as ImageIcon, Pencil } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

import { ComicsApi } from '@/apis/comics'
import { JobsApi } from '@/apis/jobs'
import PanelsApi from '@/apis/panels'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DEFAULT_ASPECT_RATIOS, DEFAULT_SELECTED_STYLE } from '@/config/preferences'
import { useAiProviders } from '@/hooks/use-ai-providers'
import { useI18n } from '@/hooks/use-i18n'
import { usePreferences } from '@/hooks/use-preferences'
import { resolveAvailablePreferenceValue, resolvePreferenceValue } from '@/lib/auto-preferences'
import type { AutoPreference } from '@/service/types'

import {
  activeTabAtom,
  aspectRatioAtom,
  currentComicDetailAtom,
  currentComicIdAtom,
  currentComicOverridesAtom,
  fullStoryAtom,
  mangaTitleAtom,
  selectedCharacterIdsAtom,
  selectedCharacterRolesAtom,
  styleAtom,
} from '../atoms'
import { AutoSelectControl } from '../components/auto-select-control'
import { ComicsWorkflowShell, WorkflowActionBar, WorkflowContent } from '../components/workflow-layout'

const LAYOUT_OPTIONS = ['auto-grid', 'grid-2x2', 'vertical', 'cinematic'] as const

const DEFAULT_ASPECT_RATIO = DEFAULT_ASPECT_RATIOS[0] ?? '16:9'

interface Scene { id: number; label: string }

function shotFailureMessage(comic: any): string | null {
  const stages = Array.isArray(comic?.workflow_stages) ? comic.workflow_stages : []
  const shotsStage = stages.find((stage: any) => stage?.stage === 'shots')

  if (shotsStage?.status === 'failed') {
    return shotsStage.error_message || comic?.error_message || 'panels.failure'
  }

  if (comic?.workflow_stage === 'shots' && comic?.workflow_status === 'failed') {
    return comic?.error_message || 'panels.failure'
  }

  return null
}

function PanelCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border/60 bg-card p-4 shadow-sm">
      <h3 className="mb-4 text-base font-semibold text-foreground/80">{title}</h3>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
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

export function PanelsTab() {
  const { t } = useI18n('comics')
  const [comicId, setComicId] = useAtom(currentComicIdAtom)
  const { layoutOptions, preferences } = usePreferences()
  const { providers, textProviders } = useAiProviders()
  const [overrides, setOverrides] = useAtom(currentComicOverridesAtom)
  const layoutSelectOptions = useMemo(() => (
    layoutOptions.map((value) => ({
      value,
      label: {
        'auto-grid': String(t('grid.autoGrid')),
        'grid-2x2': String(t('grid.4panel')),
        vertical: String(t('grid.leftMainRightMinor')),
        cinematic: String(t('grid.rightLongBar')),
      }[value] ?? value,
    }))
  ), [layoutOptions, t])
  const preferenceLayout = preferences?.fields?.page_layout
  const fallbackLayout = resolvePreferenceValue(preferenceLayout, layoutSelectOptions[0]?.value ?? LAYOUT_OPTIONS[0])
  const pageLayoutPreference = (overrides.page_layout ?? preferenceLayout ?? { mode: 'auto' }) as AutoPreference<string>
  const resolvedLayout = resolvePreferenceValue(pageLayoutPreference, fallbackLayout)
  const [selectedLayout, setSelectedLayout] = useState<string>(resolvedLayout)
  // 直接使用当前详情
  const [comicDetail, setComicDetail] = useAtom(currentComicDetailAtom)
  const [, setActiveTab] = useAtom(activeTabAtom)
  const [title] = useAtom(mangaTitleAtom)
  const [story] = useAtom(fullStoryAtom)
  const [style] = useAtom(styleAtom)
  const [aspect] = useAtom(aspectRatioAtom)
  const [selectedIds] = useAtom(selectedCharacterIdsAtom)
  const [rolesMap] = useAtom(selectedCharacterRolesAtom)
  const [submitting, setSubmitting] = useState(false)
  const [polling, setPolling] = useState(false)
  const [pollPct, setPollPct] = useState(0)
  const [panelError, setPanelError] = useState<string | null>(null)
  const pollRef = (typeof window !== 'undefined' ? (window as any) : {}) as { __panelsPoll?: number | null }
  const [editingPanelId, setEditingPanelId] = useState<number | null>(null)
  const [editingDialogue, setEditingDialogue] = useState<string>('')
  const [savingId, setSavingId] = useState<number | null>(null)
  const stylePreference = overrides.style ?? preferences?.fields?.style
  const resolvedStyleForCreate = resolvePreferenceValue(
    stylePreference,
    style || DEFAULT_SELECTED_STYLE,
  )
  const aspectRatioPreference = overrides.aspect_ratio ?? preferences?.fields?.aspect_ratio
  const resolvedAspectRatioForCreate = resolvePreferenceValue(
    aspectRatioPreference,
    aspect || DEFAULT_ASPECT_RATIO,
  )
  const textProviderPreference = overrides.text_provider ?? preferences?.fields?.text_provider
  const textProviderFallback = textProviders.includes(providers.defaults.text)
    ? providers.defaults.text
    : (textProviders[0] ?? providers.defaults.text)
  const resolvedTextProviderForPanels = resolveAvailablePreferenceValue(
    textProviderPreference,
    textProviders,
    textProviderFallback,
  )

  useEffect(() => {
    if (selectedLayout !== resolvedLayout) {
      setSelectedLayout(resolvedLayout)
    }
  }, [resolvedLayout, selectedLayout])

  const handleLayoutPreferenceChange = (nextPreference: AutoPreference<string>) => {
    setOverrides((prev: any) => ({
      ...prev,
      page_layout: nextPreference,
    }))
    setSelectedLayout(resolvePreferenceValue(nextPreference, fallbackLayout))
  }

  const shots = useMemo<any[]>(() => (comicDetail)?.panel_shots ?? [], [comicDetail])
  const pageNumbers = useMemo<number[]>(() => {
    const set = new Set<number>()
    for (const s of shots) {
      if (s && typeof s.page_number === 'number') set.add(s.page_number as number)
    }

    return Array.from(set).sort((a, b) => a - b)
  }, [shots])
  const scenes: Scene[] = pageNumbers.length ? pageNumbers.map((n: number) => ({ id: n, label: String(n).padStart(2, '0') })) : [{ id: 1, label: '01' }]
  const [selectedScene, setSelectedScene] = useState<number>(scenes[0].id)

  useEffect(() => {
    // 当 shots 更新时，修正选中页
    if (!scenes.some((s) => s.id === selectedScene)) {
      setSelectedScene(scenes[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shots.length])

  const sortedShots = useMemo<any[]>(() => {
    const arr = [...shots]
    arr.sort((a: any, b: any) => {
      const sa = typeof a?.sequence_index === 'number' ? a.sequence_index : (a?.page_number ?? 0) * 100 + (a?.panel_number ?? 0)
      const sb = typeof b?.sequence_index === 'number' ? b.sequence_index : (b?.page_number ?? 0) * 100 + (b?.panel_number ?? 0)
      
      return sa - sb
    })

    return arr
  }, [shots])
  const visibleShots = useMemo(
    () => sortedShots.filter((shot: any) => shot?.page_number === selectedScene),
    [selectedScene, sortedShots],
  )

  const handleGeneratePanels = async () => {
    try {
      setSubmitting(true)
      setPanelError(null)
      let cid = comicId

      // 1) 如果还没有漫画，先在此创建
      if (!cid) {
        const characters = selectedIds.map((id, idx) => ({
          id,
          order_index: idx + 1,
          role: rolesMap[id] || (idx === 0 ? 'protagonist' : 'supporting'),
        }))

        const createRes = await ComicsApi.create({
          title: title || String(t('editor.untitled')),
          story,
          style: resolvedStyleForCreate || '',
          aspect_ratio: resolvedAspectRatioForCreate || DEFAULT_ASPECT_RATIO,
          characters,
        })
        const created = (createRes as any)?.comic
        if (!created?.id) throw new Error(String(t('panels.createFailed')))
        cid = created.id
        setComicId(cid)
        setComicDetail(created)
        toast.success(String(t('panels.created')))
      }

      // 2) 不再区分 old/new story，若当前页暂无分镜，则触发通用优化任务
      const hasShotsNow = (comicDetail?.panel_shots ?? []).some((s: any) => s?.page_number === selectedScene)
      if (!hasShotsNow) {
        try {
          await JobsApi.createComic({
            job_type: 'story_optimization',
            comic_id: cid as number,
            text_provider: resolvedTextProviderForPanels,
          })
          toast.success(String(t('panels.submitted')))
        } catch {}

        await pollComicUntilShots(cid as number)
      }
      // 3) 设置当前页布局（会返回包含 page_layouts 的 comic）

      const res = await PanelsApi.setLayout(cid as number, {
        page_number: selectedScene,
        layout_key: selectedLayout,
      })
      const layoutComic = (res as any)?.comic
      if (layoutComic) {
        setComicDetail(layoutComic)
      }
    } catch (e: any) {
      const message = e?.message || String(t('panels.failure'))
      setPanelError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function pollComicUntilShots(cid: number) {
    // 清理旧的轮询
    if (pollRef.__panelsPoll) {
      window.clearInterval(pollRef.__panelsPoll)
      pollRef.__panelsPoll = null
    }

    setPolling(true)
    setPollPct(0)
    const started = Date.now()
    const MAX_MS = 120000 // 120s：分镜生成可能较慢，适当延长等待时间
    
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
          const hasShotsForPage = shotsArr.some((s) => s?.page_number === selectedScene)
          const failureMessage = shotFailureMessage(comic)
          if (failureMessage) {
            if (pollRef.__panelsPoll) {
              window.clearInterval(pollRef.__panelsPoll)
              pollRef.__panelsPoll = null
            }

            setPolling(false)
            reject(new Error(String(t('panels.failedPrefix', {
              message: failureMessage === 'panels.failure' ? String(t('panels.failure')) : failureMessage,
            }))))

            return
          }

          if (hasShotsForPage) {
            toast.success(String(t('panels.success')))
            if (pollRef.__panelsPoll) {
              window.clearInterval(pollRef.__panelsPoll)
              pollRef.__panelsPoll = null
            }
            
            setPolling(false)
            setPollPct(100)
            resolve()
            
            return
          }
        } catch {
          // 忽略错误，继续轮询直到超时
        }

        if (elapsed >= MAX_MS) {
          if (pollRef.__panelsPoll) {
            window.clearInterval(pollRef.__panelsPoll)
            pollRef.__panelsPoll = null
          }
          
          setPolling(false)
          reject(new Error(String(t('panels.timeout'))))
        }
      }

      // 立即执行一次，再每 2s 轮询
      tick()
      pollRef.__panelsPoll = window.setInterval(tick, 2000)
    })
  }

  return (
    <ComicsWorkflowShell>
      <WorkflowContent>
        <section className="min-w-0 rounded-lg border border-border/60 bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{String(t('title.panelsPage'))}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {visibleShots.length > 0
                  ? String(t('panels.status', { count: visibleShots.length, page: selectedScene }))
                  : String(t('panels.emptyStatus'))}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {visibleShots.length === 0 ? (
              <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <ImageIcon className="h-8 w-8" />
                  <span className="text-sm">{String(t('panels.emptyHint'))}</span>
                </div>
              </div>
            ) : (
              visibleShots.map((s: any, idx: number) => {
                const isEditing = editingPanelId === s.id
                const displayText = s.description
                  
                return (
                  <div key={`${s.page_number}-${s.panel_number}-${s.id ?? idx}`} className="grid gap-3 rounded-md border p-4 md:grid-cols-[52px_minmax(0,1fr)_auto] md:items-start">
                    <div className="text-lg font-bold md:w-10">{String(idx + 1).padStart(2, '0')}</div>
                    <div className="min-w-0 whitespace-pre-wrap text-muted-foreground">
                      {isEditing ? (
                        <Textarea
                          value={editingDialogue}
                          onChange={(e) => setEditingDialogue(e.target.value)}
                          placeholder={String(t('panels.dialoguePlaceholder'))}
                          className="min-h-[72px] text-sm"
                        />
                      ) : (
                        <>{displayText}</>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground md:justify-end">
                      <span className="whitespace-nowrap">
                        {String(t('panels.pageMarker', { page: s.page_number, panel: s.panel_number }))}
                      </span>
                      {!isEditing ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={String(t('panels.editDialogue'))}
                          onClick={() => {
                            setEditingPanelId(s.id)
                            setEditingDialogue(s.dialogue || s.description || '')
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={async () => {
                              if (!editingDialogue.trim()) {
                                toast.error(String(t('panels.dialogueRequired')))
                                  
                                return
                              }
                                
                              try {
                                setSavingId(s.id)
                                await PanelsApi.updatePanel(s.id, { dialogue: editingDialogue.trim() })
                                if (comicId) {
                                  const latest = await ComicsApi.get(comicId)
                                  setComicDetail(latest as any)
                                  // 不再维护上次快照
                                }
                                  
                                setEditingPanelId(null)
                                setEditingDialogue('')
                                toast.success(String(t('panels.saved')))
                              } catch (err: any) {
                                toast.error(err?.message || String(t('panels.saveFailed')))
                              } finally {
                                setSavingId(null)
                              }
                            }}
                            disabled={savingId === s.id}
                          >
                            {savingId === s.id ? String(t('panels.saving')) : String(t('panels.save'))}
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
                            {String(t('panels.cancel'))}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-4">
          <PanelCard title={String(t('panels.layout'))}>
            <LabelRow label={String(t('panels.pageSelection'))}>
              <Select value={String(selectedScene)} onValueChange={(v) => setSelectedScene(Number(v))}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={String(t('panels.selectPage'))} />
                </SelectTrigger>
                <SelectContent>
                  {scenes.map((sc) => (
                    <SelectItem key={sc.id} value={String(sc.id)}>
                      {String(t('panels.pageOption', { page: sc.label }))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelRow>
            <AutoSelectControl
              label={String(t('panels.pageLayout'))}
              value={pageLayoutPreference}
              options={layoutSelectOptions}
              onChange={handleLayoutPreferenceChange}
            />
          </PanelCard>
        </aside>
      </WorkflowContent>
      {(() => {
        const hasShotsForPage = sortedShots.some((s: any) => s?.page_number === selectedScene)

        return (
          <WorkflowActionBar className="flex-col">
            {polling && (
              <div role="status" className="w-full max-w-xl rounded-lg border border-primary/30 bg-primary/10 p-4">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-primary">{String(t('panels.generatingTitle'))}</span>
                  <span className="text-muted-foreground">{pollPct}%</span>
                </div>
                <Progress value={pollPct} />
                <p className="mt-2 text-xs text-muted-foreground">
                  {String(t('panels.generatingHelp'))}
                </p>
              </div>
            )}
            {panelError && (
              <div role="alert" className="w-full max-w-xl rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {panelError}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="outline"
                onClick={handleGeneratePanels}
                disabled={submitting || polling}
              >
                {submitting
                  ? String(t('panels.submitting'))
                  : polling
                    ? String(t('panels.generatingButton', { pct: pollPct }))
                    : String(t('panels.submit'))}
              </Button>
              <Button
                size="lg"
                onClick={() => setActiveTab('image-generation')}
                disabled={!hasShotsForPage}
              >
                {String(t('common.next'))}
              </Button>
            </div>
          </WorkflowActionBar>
        )
      })()}
    </ComicsWorkflowShell>
  )
}

// 旧的网格预览已删除，分镜页改回纵向列表样式（数据来自接口）

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
import { useI18n } from '@/hooks/use-i18n'

import {
  activeTabAtom,
  aspectRatioAtom,
  currentComicDetailAtom,
  currentComicIdAtom,
  fullStoryAtom,
  mangaTitleAtom,
  selectedCharacterIdsAtom,
  selectedCharacterRolesAtom,
  styleAtom,
  textProviderAtom,
} from '../atoms'
import { ComicsWorkflowShell, WorkflowActionBar, WorkflowContent } from '../components/workflow-layout'

const LAYOUT_OPTIONS = [
  { value: 'auto-grid', label: '自动布局 (auto-grid)' },
  { value: 'grid-2x2', label: '四宫格 (grid-2x2)' },
  { value: 'vertical', label: '竖版长条 (vertical)' },
  { value: 'cinematic', label: '宽银幕 (cinematic)' },
]

interface Scene { id: number; label: string }

function shotFailureMessage(comic: any): string | null {
  const stages = Array.isArray(comic?.workflow_stages) ? comic.workflow_stages : []
  const shotsStage = stages.find((stage: any) => stage?.stage === 'shots')

  if (shotsStage?.status === 'failed') {
    return shotsStage.error_message || comic?.error_message || '分镜任务失败'
  }

  if (comic?.workflow_stage === 'shots' && comic?.workflow_status === 'failed') {
    return comic?.error_message || '分镜任务失败'
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
  const [selectedLayout, setSelectedLayout] = useState<string>(LAYOUT_OPTIONS[0].value)
  // 直接使用当前详情
  const [comicDetail, setComicDetail] = useAtom(currentComicDetailAtom)
  const [, setActiveTab] = useAtom(activeTabAtom)
  const [title] = useAtom(mangaTitleAtom)
  const [story] = useAtom(fullStoryAtom)
  const [style] = useAtom(styleAtom)
  const [textProvider] = useAtom(textProviderAtom)
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
          title: title || '未命名',
          story,
          style: style || '',
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

      // 2) 不再区分 old/new story，若当前页暂无分镜，则触发通用优化任务
      const hasShotsNow = (comicDetail?.panel_shots ?? []).some((s: any) => s?.page_number === selectedScene)
      if (!hasShotsNow) {
        try {
          await JobsApi.createComic({
            job_type: 'story_optimization',
            comic_id: cid as number,
            text_provider: textProvider,
          })
          toast.success('已提交分镜生成任务')
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
      const message = e?.message || '分镜生成失败'
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
            reject(new Error(`分镜生成失败：${failureMessage}`))

            return
          }

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
        } catch {
          // 忽略错误，继续轮询直到超时
        }

        if (elapsed >= MAX_MS) {
          if (pollRef.__panelsPoll) {
            window.clearInterval(pollRef.__panelsPoll)
            pollRef.__panelsPoll = null
          }
          
          setPolling(false)
          reject(new Error('分镜数据生成超时，请检查文本模型或任务队列状态'))
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
              <h3 className="text-lg font-semibold">分镜</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {sortedShots.length > 0 ? `${sortedShots.length} 个镜头 · 当前第 ${selectedScene} 页` : '还没有可用镜头'}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {sortedShots.length === 0 ? (
              <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <ImageIcon className="h-8 w-8" />
                  <span className="text-sm">暂无分镜数据，请点击下侧“生成分镜”。</span>
                </div>
              </div>
            ) : (
              sortedShots.map((s: any, idx: number) => {
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
                          placeholder="填写对白（必填）"
                          className="min-h-[72px] text-sm"
                        />
                      ) : (
                        <>{displayText}</>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground md:justify-end">
                      <span className="whitespace-nowrap">第{s.page_number}页 · #{s.panel_number}</span>
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
                          <Pencil className="size-4" />
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
                                  // 不再维护上次快照
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
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-4">
          <PanelCard title="布局">
            <LabelRow label="页面选择">
              <Select value={String(selectedScene)} onValueChange={(v) => setSelectedScene(Number(v))}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="选择页面" />
                </SelectTrigger>
                <SelectContent>
                  {scenes.map((sc) => (
                    <SelectItem key={sc.id} value={String(sc.id)}>
                      第{sc.label}页
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelRow>
            <LabelRow label="页面布局">
              <Select value={selectedLayout} onValueChange={setSelectedLayout}>
                <SelectTrigger className="w-40">
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
        </aside>
      </WorkflowContent>
      {(() => {
        const hasShotsForPage = sortedShots.some((s: any) => s?.page_number === selectedScene)

        return (
          <WorkflowActionBar className="flex-col">
            {polling && (
              <div role="status" className="w-full max-w-xl rounded-lg border border-primary/30 bg-primary/10 p-4">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-primary">正在生成分镜</span>
                  <span className="text-muted-foreground">{pollPct}%</span>
                </div>
                <Progress value={pollPct} />
                <p className="mt-2 text-xs text-muted-foreground">
                  正在拆分镜头和整理页面布局，完成后会自动刷新列表。
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
                {submitting ? '提交中…' : polling ? `生成分镜中… ${pollPct}%` : '生成分镜'}
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

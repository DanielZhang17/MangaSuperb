import { AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

import type { RenderProgressState, RenderProgressStatus } from '../workflow-types'

const STAGES: { key: RenderProgressStatus; label: string }[] = [
  { key: 'optimizing', label: 'Prompt 优化' },
  { key: 'rendering', label: '图像渲染' },
  { key: 'uploading', label: 'R2 上传与整理' },
]

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}分${String(seconds).padStart(2, '0')}秒`
}

function statusIndex(status: RenderProgressStatus) {
  if (status === 'idle') return -1
  if (status === 'completed') return STAGES.length
  if (status === 'failed' || status === 'timeout') return -1
  const index = STAGES.findIndex((stage) => stage.key === status)

  return index === -1 ? 0 : index
}

export function GenerationStatusPanel({
  progress,
  helperText = '图像生成可能需要几分钟，请保持页面打开。',
}: {
  progress: RenderProgressState
  helperText?: string
}) {
  const idle = progress.status === 'idle'
  const failed = progress.status === 'failed' || progress.status === 'timeout'
  const completed = progress.status === 'completed'
  const activeIndex = statusIndex(progress.status)
  const pct = completed
    ? 100
    : progress.maxPollTries > 0
      ? Math.min(95, Math.round((progress.pollTries / progress.maxPollTries) * 100))
      : 0

  return (
    <section
      className={cn(
        'rounded-lg border border-border/60 bg-card p-4 shadow-sm',
        failed && 'border-destructive/40 bg-destructive/10',
      )}
      role={failed ? 'alert' : idle ? undefined : 'status'}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">{progress.message}</p>
          <p className="mt-1 text-sm text-muted-foreground">{helperText}</p>
        </div>
        {!idle && (
          <div className="inline-flex items-center gap-2 rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            已用时 {formatElapsed(progress.elapsedMs)}
          </div>
        )}
      </div>

      {!idle && <Progress value={pct} className="mt-4" />}

      <div className={cn('grid gap-2 sm:grid-cols-3', idle ? 'mt-3' : 'mt-4')}>
        {STAGES.map((stage, index) => {
          const done = completed || activeIndex > index
          const active = !failed && activeIndex === index && !completed

          return (
            <div
              key={stage.key}
              className={cn(
                'flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground',
                done && 'text-emerald-500',
                active && 'border-primary/40 bg-primary/10 text-primary',
                failed && activeIndex === -1 && 'text-muted-foreground',
              )}
            >
              {done ? (
                <CheckCircle2 className="size-4" />
              ) : active ? (
                <Loader2 className="size-4 animate-spin" />
              ) : failed ? (
                <AlertCircle className="size-4" />
              ) : (
                <span className="size-4 rounded-full border border-current" />
              )}
              <span>{stage.label}</span>
            </div>
          )
        })}
      </div>

      {progress.error && (
        <p className="mt-3 text-sm text-destructive">{progress.error}</p>
      )}
    </section>
  )
}

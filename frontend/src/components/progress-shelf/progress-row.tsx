import { AlertCircle, ArrowUpRight, CheckCircle2, LoaderCircle, WifiOff, X } from 'lucide-react'

import type { ActiveJobEntry, ActiveJobStage } from '@/atoms'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/hooks/use-i18n'

import { StageBar } from './stage-bar'

const GENERATION_FLOW = ['outline', 'shots', 'render']
const PUBLISH_FLOW = ['cover', 'export', 'publish']
const CHARACTER_STAGES = new Set(['character_image', 'character_optimization'])
const NO_ACTIVE_RQ_WORKERS_MESSAGE = 'No active RQ workers detected; job will remain queued.'

function buildFallbackStages(job: ActiveJobEntry): ActiveJobStage[] {
  if (CHARACTER_STAGES.has(job.stage)) {
    return [{ stage: job.stage, status: job.status }]
  }

  const flow = PUBLISH_FLOW.includes(job.stage) ? PUBLISH_FLOW : GENERATION_FLOW

  return flow.map((stage) => {
    if (stage === job.stage) {
      return { stage, status: job.status }
    }

    return { stage, status: 'pending' }
  })
}

function hasJobStatus(job: ActiveJobEntry, statuses: string[]): boolean {
  return [job.render_run?.status, job.rq_status, job.status].some((status) => (
    typeof status === 'string' && statuses.includes(status)
  ))
}

function statusLabel(job: ActiveJobEntry, t: (key: string, options?: any) => unknown): string {
  if (job.reconnecting) return String(t('status.reconnecting'))
  if (hasJobStatus(job, ['aborted'])) return String(t('status.aborted'))
  if (hasJobStatus(job, ['failed'])) return String(t('status.failed'))
  if (hasJobStatus(job, ['finished', 'completed'])) return String(t('status.completed'))
  if (hasJobStatus(job, ['queued', 'deferred', 'pending'])) return String(t('status.queued'))

  return String(t('status.running'))
}

function stageLabel(stage: string, t: (key: string, options?: any) => unknown): string {
  const label = String(t(`stage.${stage}`))

  return label === `stage.${stage}` ? stage : label
}

function jobTypeLabel(job: ActiveJobEntry, t: (key: string, options?: any) => unknown): string {
  if (job.render_run_id || job.render_run) return String(t('job.renderRun'))
  if (job.kind === 'character_image' || job.stage === 'character_image') return String(t('job.characterImage'))
  if (job.kind === 'character_optimization' || job.stage === 'character_optimization') return String(t('job.characterOptimization'))

  return String(t('job.stage', { stage: stageLabel(job.stage, t) }))
}

function messageLabel(message: string, t: (key: string, options?: any) => unknown): string {
  if (message.trim() === NO_ACTIVE_RQ_WORKERS_MESSAGE) {
    return String(t('message.noActiveRqWorkers'))
  }

  return message
}

function StatusIcon({ job }: { job: ActiveJobEntry }) {
  if (job.reconnecting) return <WifiOff className="h-4 w-4 text-amber-300" />
  if (hasJobStatus(job, ['aborted', 'failed'])) return <AlertCircle className="h-4 w-4 text-rose-300" />
  if (hasJobStatus(job, ['finished', 'completed'])) return <CheckCircle2 className="h-4 w-4 text-emerald-300" />

  return <LoaderCircle className="h-4 w-4 animate-spin text-sky-300" />
}

function isAbortableRenderRun(job: ActiveJobEntry): boolean {
  if (!job.render_run_id && !job.render_run) return false
  if (job.render_run?.abort_requested) return false
  if (hasJobStatus(job, ['aborted', 'failed', 'finished', 'completed'])) return false

  return hasJobStatus(job, ['queued', 'started', 'running'])
}

interface ProgressRowProps {
  job: ActiveJobEntry
  onOpen: (job: ActiveJobEntry) => void
  onAbort?: (job: ActiveJobEntry) => void
  isAborting?: boolean
}

export function ProgressRow({ job, onOpen, onAbort, isAborting = false }: ProgressRowProps) {
  const { t } = useI18n('progressShelf')
  const stages = job.workflow_stages?.length ? job.workflow_stages : buildFallbackStages(job)
  const renderProgress = job.render_progress
  const isRenderRun = Boolean(job.render_run_id || job.render_run)
  const currentPageNumber = job.render_run?.current_page_number
  const failedPages = Array.isArray(job.render_run?.failed_pages) ? job.render_run.failed_pages : []
  const abortRequested = job.render_run?.abort_requested && !hasJobStatus(job, ['aborted'])
  const canAbort = Boolean(onAbort) && isAbortableRenderRun(job)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpen(job)}
        className={`w-full rounded-3xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-sky-400/40 hover:bg-white/10 ${canAbort ? 'pb-14' : ''}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusIcon job={job} />
              <p className="truncate text-sm font-semibold text-white">
                {job.title || String(t('job.untitled'))}
              </p>
            </div>
            <p className="mt-1 text-xs font-medium text-sky-100">{jobTypeLabel(job, t)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="border-white/10 bg-white/10 text-white">
              {statusLabel(job, t)}
            </Badge>
            <ArrowUpRight className="h-4 w-4 text-slate-300" />
          </div>
        </div>

        <div className="mt-4">
          <StageBar currentStage={job.stage} stages={stages} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-300">
          {renderProgress && renderProgress.total > 0 ? (
            <span>
              {String(t('meta.pages', { completed: renderProgress.completed, total: renderProgress.total }))}
            </span>
          ) : null}
          {isRenderRun && typeof currentPageNumber === 'number' ? (
            <span>{String(t('meta.currentPage', { page: currentPageNumber }))}</span>
          ) : null}
          {failedPages.length > 0 ? (
            <span>
              {String(t('meta.failedCount', { count: failedPages.length }))}
            </span>
          ) : null}
          {abortRequested ? <span>{String(t('meta.abortRequested'))}</span> : null}
          {job.render_run?.error_message ? <span>{messageLabel(job.render_run.error_message, t)}</span> : null}
          {job.reconnecting ? <span>{String(t('meta.connectionUnstable'))}</span> : null}
          {job.warning ? <span>{messageLabel(job.warning, t)}</span> : null}
        </div>
      </button>
      {canAbort ? (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          aria-label={String(t('action.abortRenderRun'))}
          className="absolute bottom-4 right-4 border border-white/10"
          onClick={() => onAbort?.(job)}
          disabled={isAborting}
        >
          <X className="h-4 w-4" />
          {String(t('action.abort'))}
        </Button>
      ) : null}
    </div>
  )
}

export default ProgressRow

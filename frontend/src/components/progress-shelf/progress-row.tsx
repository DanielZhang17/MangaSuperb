import { AlertCircle, ArrowUpRight, CheckCircle2, LoaderCircle, WifiOff } from 'lucide-react'

import type { ActiveJobEntry, ActiveJobStage } from '@/atoms'
import { Badge } from '@/components/ui/badge'

import { StageBar } from './stage-bar'

const GENERATION_FLOW = ['outline', 'shots', 'render']
const PUBLISH_FLOW = ['cover', 'export', 'publish']

function buildFallbackStages(job: ActiveJobEntry): ActiveJobStage[] {
  const flow = PUBLISH_FLOW.includes(job.stage) ? PUBLISH_FLOW : GENERATION_FLOW
  return flow.map((stage) => {
    if (stage === job.stage) {
      return { stage, status: job.status }
    }
    return { stage, status: 'pending' }
  })
}

function statusLabel(job: ActiveJobEntry): string {
  if (job.reconnecting) return 'Reconnecting'
  if (job.rq_status === 'failed' || job.status === 'failed') return 'Failed'
  if (job.rq_status === 'finished' || job.status === 'completed') return 'Completed'
  if (job.rq_status === 'queued' || job.rq_status === 'deferred' || job.status === 'pending') return 'Queued'
  return 'Running'
}

function StatusIcon({ job }: { job: ActiveJobEntry }) {
  if (job.reconnecting) return <WifiOff className="h-4 w-4 text-amber-300" />
  if (job.rq_status === 'failed' || job.status === 'failed') return <AlertCircle className="h-4 w-4 text-rose-300" />
  if (job.rq_status === 'finished' || job.status === 'completed') return <CheckCircle2 className="h-4 w-4 text-emerald-300" />
  return <LoaderCircle className="h-4 w-4 animate-spin text-sky-300" />
}

interface ProgressRowProps {
  job: ActiveJobEntry
  onOpen: (job: ActiveJobEntry) => void
}

export function ProgressRow({ job, onOpen }: ProgressRowProps) {
  const stages = job.workflow_stages?.length ? job.workflow_stages : buildFallbackStages(job)
  const renderProgress = job.render_progress

  return (
    <button
      type="button"
      onClick={() => onOpen(job)}
      className="w-full rounded-3xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-sky-400/40 hover:bg-white/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusIcon job={job} />
            <p className="truncate text-sm font-semibold text-white">
              {job.title || 'Untitled comic'}
            </p>
          </div>
          <p className="mt-1 text-xs text-slate-300">
            Stage: <span className="font-medium text-white">{job.stage}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="border-white/10 bg-white/10 text-white">
            {statusLabel(job)}
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
            Pages {renderProgress.completed}/{renderProgress.total}
          </span>
        ) : null}
        {job.reconnecting ? <span>Connection unstable</span> : null}
        {job.warning ? <span>{job.warning}</span> : null}
      </div>
    </button>
  )
}

export default ProgressRow

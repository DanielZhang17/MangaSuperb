import type { ActiveJobStage } from '@/atoms'
import { useI18n } from '@/hooks/use-i18n'
import { cn } from '@/lib/utils'

interface StageBarProps {
  currentStage: string
  stages: ActiveJobStage[]
}

function segmentTone(status: string, isCurrent: boolean): string {
  if (status === 'completed') return 'bg-emerald-500/90'
  if (status === 'failed') return 'bg-rose-500/90'
  if (status === 'aborted') return 'bg-amber-500/90'
  if (status === 'running' || status === 'in_progress' || isCurrent) return 'bg-sky-500/90'

  return 'bg-border'
}

export function StageBar({ currentStage, stages }: StageBarProps) {
  const { t } = useI18n('progressShelf')

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        {stages.map((stage) => {
          const isCurrent = stage.stage === currentStage

          return (
            <div
              key={stage.stage}
              className={cn(
                'h-2 flex-1 rounded-full transition-colors',
                segmentTone(stage.status, isCurrent),
              )}
              title={`${stage.stage}: ${stage.status}`}
            />
          )
        })}
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {stages.map((stage) => (
          <span
            key={stage.stage}
            className={cn(
              'rounded-full px-2 py-0.5',
              stage.stage === currentStage && 'bg-sky-500/10 text-sky-200',
            )}
          >
            {String(t(`stage.${stage.stage}`, { defaultValue: stage.stage }))}
          </span>
        ))}
      </div>
    </div>
  )
}

export default StageBar

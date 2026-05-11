import { CheckCircle2, Circle, LoaderCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/hooks/use-i18n'
import type { AutoRunStage } from '@/service/types'

const STAGES: AutoRunStage[] = ['story', 'characters', 'panels', 'render', 'preview']

function copy(value: unknown, fallback: string) {
  const text = String(value)

  return text.includes('.') ? fallback : text
}

function stageLabel(stage: AutoRunStage, t: (key: string, options?: any) => unknown) {
  const fallbacks: Record<AutoRunStage, string> = {
    story: 'Story',
    characters: 'Characters',
    panels: 'Panels',
    render: 'Render',
    preview: 'Preview',
  }

  return copy(t(`autoProgress.stage.${stage}`), fallbacks[stage])
}

export function AutoRunStageList({ currentStage }: { currentStage: AutoRunStage }) {
  const { t } = useI18n('comics')
  const currentIndex = STAGES.indexOf(currentStage)

  return (
    <ol className="grid gap-3 md:grid-cols-5">
      {STAGES.map((stage, index) => {
        const isDone = currentIndex > index
        const isCurrent = currentIndex === index

        return (
          <li
            key={stage}
            className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border/60 bg-card p-3"
          >
            <div className="flex min-w-0 items-center gap-2">
              {isDone ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              ) : isCurrent ? (
                <LoaderCircle className="size-4 shrink-0 animate-spin text-primary" />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate text-sm font-medium">{stageLabel(stage, t)}</span>
            </div>
            {isCurrent && <Badge variant="secondary">{copy(t('autoProgress.now'), 'Now')}</Badge>}
          </li>
        )
      })}
    </ol>
  )
}

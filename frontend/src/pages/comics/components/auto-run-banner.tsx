import { ArrowLeftCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useI18n } from '@/hooks/use-i18n'
import type { AutoRun } from '@/service/types'

function copy(value: unknown, fallback: string) {
  const text = String(value)

  return text.includes('.') ? fallback : text
}

function progressPercent(autoRun: AutoRun) {
  const renderProgress = autoRun.render_progress

  if (!renderProgress?.total) return 0

  return Math.round(((renderProgress.completed + renderProgress.failed) / renderProgress.total) * 100)
}

export function AutoRunBanner({
  autoRun,
  onReturn,
}: {
  autoRun: AutoRun
  onReturn: () => void
}) {
  const { t } = useI18n('comics')
  const pct = progressPercent(autoRun)

  return (
    <section
      role="status"
      className="mx-auto mt-6 flex w-full max-w-[1536px] flex-col gap-4 rounded-md border border-primary/30 bg-primary/5 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-primary">
          {copy(t('autoRunBanner.title'), 'Auto generation is running')}
        </p>
        <p className="mt-1 truncate text-sm font-medium text-foreground">
          {autoRun.title_snapshot || 'Untitled manga'}
        </p>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {autoRun.story_snapshot}
        </p>
        <Progress value={pct} className="mt-3 max-w-xl" />
      </div>
      <Button type="button" variant="outline" onClick={onReturn} className="shrink-0">
        <ArrowLeftCircle className="size-4" />
        {copy(t('autoRunBanner.return'), 'Return to Auto progress')}
      </Button>
    </section>
  )
}

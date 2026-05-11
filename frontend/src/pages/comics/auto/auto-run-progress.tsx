import { PauseCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useI18n } from '@/hooks/use-i18n'
import type { AutoRun } from '@/service/types'

import { ComicsWorkflowShell, WorkflowPanel } from '../components/workflow-layout'
import type { AutoRunController } from './auto-mode-tab'
import { AutoRunStageList } from './auto-run-stage-list'

function copy(value: unknown, fallback: string) {
  const text = String(value)

  return text.includes('.') ? fallback : text
}

function progressPercent(autoRun: AutoRun) {
  const renderProgress = autoRun.render_progress

  if (renderProgress?.total) {
    return Math.round(((renderProgress.completed + renderProgress.failed) / renderProgress.total) * 100)
  }

  const stages = ['story', 'characters', 'panels', 'render', 'preview']
  const currentIndex = stages.indexOf(autoRun.current_stage)

  return Math.max(0, Math.round((currentIndex / (stages.length - 1)) * 100))
}

export function AutoRunProgress({
  autoRun,
  autoRunState,
}: {
  autoRun: AutoRun
  autoRunState: AutoRunController
}) {
  const { t } = useI18n('comics')
  const progress = autoRun.render_progress
  const renderedCount = progress ? progress.completed + progress.failed : 0
  const pageProgress = copy(
    t('autoProgress.progress', { completed: renderedCount, total: progress?.total ?? 0 }),
    `${renderedCount} of ${progress?.total ?? 0} pages rendered`,
  )

  return (
    <ComicsWorkflowShell>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-normal md:text-3xl">
            {copy(t('autoProgress.title'), 'Auto run in progress')}
          </h2>
          <p className="mt-1 text-sm font-medium text-foreground/80">
            {autoRun.title_snapshot || 'Untitled manga'}
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {autoRun.story_snapshot}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void autoRunState.abortRun()}
          disabled={autoRunState.isLoading || autoRun.abort_requested}
          className="shrink-0"
        >
          <PauseCircle className="size-4" />
          {copy(t('autoProgress.abort'), 'Abort run')}
        </Button>
      </div>
      <WorkflowPanel>
        <div className="space-y-4">
          <AutoRunStageList currentStage={autoRun.current_stage} />
          <div>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{pageProgress}</span>
              <span className="text-muted-foreground">{progressPercent(autoRun)}%</span>
            </div>
            <Progress value={progressPercent(autoRun)} />
          </div>
          {autoRun.error_message && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {autoRun.error_message}
            </p>
          )}
          {autoRunState.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {autoRunState.error}
            </p>
          )}
        </div>
      </WorkflowPanel>
    </ComicsWorkflowShell>
  )
}

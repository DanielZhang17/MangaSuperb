import type { useAutoRun } from '@/hooks/use-auto-run'

import { AutoDraft } from './auto-draft'
import { AutoPreview } from './auto-preview'
import { AutoRunProgress } from './auto-run-progress'
import { AutoRunReview } from './auto-run-review'

export type AutoRunController = ReturnType<typeof useAutoRun>

export function AutoModeTab({
  autoRunState,
  onOpenPro,
}: {
  autoRunState: AutoRunController
  onOpenPro: (tab?: string) => void
}) {
  const { autoRun } = autoRunState

  if (autoRun?.status === 'queued' || autoRun?.status === 'running') {
    return <AutoRunProgress autoRun={autoRun} autoRunState={autoRunState} />
  }

  if (autoRun?.status === 'needs_review' || autoRunState.needsReview) {
    return <AutoRunReview autoRun={autoRun} onOpenPro={() => onOpenPro('characters')} />
  }

  if (autoRun?.status === 'completed' || autoRunState.isComplete) {
    return <AutoPreview autoRun={autoRun} onRegenerateCurrentPage={() => onOpenPro('image-generation')} />
  }

  return <AutoDraft autoRunState={autoRunState} />
}

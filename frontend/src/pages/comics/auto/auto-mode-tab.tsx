import { useAtomValue } from 'jotai'

import type { useAutoRun } from '@/hooks/use-auto-run'

import { currentComicDetailAtom } from '../atoms'
import { AutoDraft } from './auto-draft'
import { AutoPreview } from './auto-preview'
import { AutoRunProgress } from './auto-run-progress'
import { AutoRunReview } from './auto-run-review'

export type AutoRunController = ReturnType<typeof useAutoRun>

function hasRenderedPages(pages: unknown): boolean {
  return Array.isArray(pages) && pages.some((page) => {
    if (!page || typeof page !== 'object') return false

    return Boolean((page as { image_url?: unknown }).image_url)
  })
}

export function AutoModeTab({
  autoRunState,
  onOpenPro,
}: {
  autoRunState: AutoRunController
  onOpenPro: (tab?: string) => void
}) {
  const { autoRun } = autoRunState
  const comicDetail = useAtomValue(currentComicDetailAtom)

  if (autoRun?.status === 'queued' || autoRun?.status === 'running') {
    return <AutoRunProgress autoRun={autoRun} autoRunState={autoRunState} />
  }

  if (autoRun?.status === 'needs_review' || autoRunState.needsReview) {
    return <AutoRunReview autoRun={autoRun} onOpenPro={() => onOpenPro('characters')} />
  }

  if (autoRun?.status === 'completed' || autoRunState.isComplete || hasRenderedPages(comicDetail?.pages)) {
    return <AutoPreview autoRun={autoRun} onRegenerateCurrentPage={() => onOpenPro('image-generation')} />
  }

  return <AutoDraft autoRunState={autoRunState} />
}

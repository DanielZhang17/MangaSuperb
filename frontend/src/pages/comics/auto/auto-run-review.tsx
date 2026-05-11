import { useAtom } from 'jotai'
import { SlidersHorizontal } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/hooks/use-i18n'
import type { AutoRun } from '@/service/types'

import { autoCharacterReviewAtom, autoCharacterReviewStoryAtom } from '../atoms'
import { ComicsWorkflowShell, WorkflowPanel } from '../components/workflow-layout'
import { CharacterReview } from './character-review'

function copy(value: unknown, fallback: string) {
  const text = String(value)

  return text.includes('.') ? fallback : text
}

export function AutoRunReview({
  autoRun,
  onOpenPro,
}: {
  autoRun: AutoRun | null
  onOpenPro: () => void
}) {
  const { t } = useI18n('comics')
  const [, setReview] = useAtom(autoCharacterReviewAtom)
  const [, setReviewStory] = useAtom(autoCharacterReviewStoryAtom)

  useEffect(() => {
    if (!autoRun?.character_review) return

    setReview(autoRun.character_review)
    setReviewStory(autoRun.story_snapshot)
  }, [autoRun, setReview, setReviewStory])

  return (
    <ComicsWorkflowShell>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-normal md:text-3xl">
            {copy(t('autoReviewPrompt.title'), 'Character review needed')}
          </h2>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {autoRun?.title_snapshot || 'Untitled manga'}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onOpenPro} className="shrink-0">
          <SlidersHorizontal className="size-4" />
          {copy(t('autoReviewPrompt.openPro'), 'Open Pro editor')}
        </Button>
      </div>
      {autoRun?.character_review ? (
        <CharacterReview />
      ) : (
        <WorkflowPanel>
          <p className="text-sm text-muted-foreground">
            {copy(
              t('autoReviewPrompt.description'),
              'Review the first generated iteration in Pro mode before Auto continues.',
            )}
          </p>
        </WorkflowPanel>
      )}
    </ComicsWorkflowShell>
  )
}

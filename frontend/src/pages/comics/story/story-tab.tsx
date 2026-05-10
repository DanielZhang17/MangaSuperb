import { useAtom } from 'jotai'
import { useState } from 'react'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/hooks/use-i18n'

import { LoadingView } from '../../../components/common/loading-view'
import { activeTabAtom, mangaTitleAtom, storyCompletedAtom, storyStepAtom } from '../atoms'
import { ComicsWorkflowShell, WorkflowActionBar, WorkflowContent, WorkflowPanel } from '../components/workflow-layout'
import { AIModelCard } from './ai-model-card'
import { MangaFormatCard } from './manga-format-card'
import { MangaGridLayoutCard } from './manga-grid-layout-card'
import { MangaStyleCard } from './manga-style-card'
import { StoryEditor } from './story-editor'

function InputView() {
  const { t } = useI18n('comics')
  const [, setActiveTab] = useAtom(activeTabAtom)
  const [, setStoryCompleted] = useAtom(storyCompletedAtom)
  const [title, setTitle] = useAtom(mangaTitleAtom)
  const [titleDialogOpen, setTitleDialogOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState(title)

  const openTitleDialog = () => {
    setTitleDraft(title)
    setTitleDialogOpen(true)
  }

  const confirmTitleAndContinue = () => {
    const cleanTitle = titleDraft.trim()
    if (!cleanTitle) {
      toast.error(String(t('story.titleRequired')))

      return
    }

    setTitle(cleanTitle)
    setStoryCompleted(true)
    setActiveTab('characters')
    setTitleDialogOpen(false)
  }

  return (
    <ComicsWorkflowShell>
      <WorkflowContent>
        <WorkflowPanel className="min-w-0 p-4 sm:p-5">
          <StoryEditor />
        </WorkflowPanel>

        <aside className="flex min-w-0 flex-col gap-4">
          <AIModelCard />
          <MangaStyleCard />
          <MangaFormatCard />
          <MangaGridLayoutCard />
        </aside>
      </WorkflowContent>
      <WorkflowActionBar>
        <Button
          size="lg"
          onClick={openTitleDialog}
        >
          {String(t('common.next'))}
        </Button>
      </WorkflowActionBar>
      <Dialog open={titleDialogOpen} onOpenChange={setTitleDialogOpen}>
        <DialogContent
          className="sm:max-w-md"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{String(t('story.confirmTitle'))}</DialogTitle>
            <DialogDescription>
              {String(t('story.confirmDescription'))}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="manga-title-confirm">{String(t('story.titleLabel'))}</Label>
            <Input
              id="manga-title-confirm"
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  confirmTitleAndContinue()
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" onClick={confirmTitleAndContinue}>
              {String(t('story.continueCharacters'))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ComicsWorkflowShell>
  )
}

export function StoryTab() {
  const { t } = useI18n('comics')
  const [storyStep, setStoryStep] = useAtom(storyStepAtom)
  const [, setActiveTab] = useAtom(activeTabAtom)
  const [, setStoryCompleted] = useAtom(storyCompletedAtom)

  const handleStoryLoadingComplete = () => {
    setActiveTab('characters')
    setStoryStep('input')
    setStoryCompleted(true)
  }

  // 独立的“分镜”步骤已迁移到单独的 Tab，此处不再渲染 PanelsView
  
  if (storyStep === 'generate') {
    return <LoadingView 
      initialText={String(t('loading.parseStory'))}
      onCompletion={handleStoryLoadingComplete}
      textChanges={[{ progress: 40, text: String(t('loading.generating')) }]}
    />
  }

  return <InputView />
}

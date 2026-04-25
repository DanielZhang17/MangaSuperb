import { useAtom } from 'jotai'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/hooks/use-i18n'

import { LoadingView } from '../../../components/common/loading-view'
import { PageSidebar } from '../components/page-sidebar'
import { activeTabAtom, storyCompletedAtom, storyStepAtom } from '../atoms'
import { MangaGridLayoutCard } from './manga-grid-layout-card'
import { MangaStyleCard } from './manga-style-card'
import { StoryEditor } from './story-editor'

function InputView() {
  const { t } = useI18n('comics')
  const [, setActiveTab] = useAtom(activeTabAtom)
  const [, setStoryCompleted] = useAtom(storyCompletedAtom)

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
      <PageSidebar />
      <div className="flex flex-1 flex-col gap-6 p-2 sm:p-4">
        <div className="grid grid-cols-1 gap-4 lg:gap-6 lg:grid-cols-[2fr_1fr]">
          <div>
            <StoryEditor />
          </div>
          <div className="space-y-4 lg:space-y-5">
            {/* <AIModelCard /> */}
            <MangaStyleCard />
            <MangaGridLayoutCard />
          </div>
        </div>
        <Button
          size="lg"
          onClick={() => {
            setStoryCompleted(true)
            setActiveTab('characters')
          }}
          className="self-center"
        >
          {String(t('common.next'))}
        </Button>
      </div>
    </div>
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

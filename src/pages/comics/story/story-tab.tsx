import { useAtom } from 'jotai'

import { Button } from '@/components/ui/button'

import { LoadingView } from '../../../components/common/loading-view'
import { activeTabAtom, storyCompletedAtom, storyStepAtom } from '../atoms'
import { AIModelCard } from './ai-model-card'
import { MangaGridLayoutCard } from './manga-grid-layout-card'
import { MangaStyleCard } from './manga-style-card'
import { PanelsView, StoryEditor } from './story-editor'

function InputView() {
  const [, setStoryStep] = useAtom(storyStepAtom)

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-2 gap-8 mb-10">
        <div>
          <StoryEditor />
        </div>

        <div className="space-y-4 h-full overflow-auto flex flex-col justify-between">
          <div className='h-4'></div>
          <AIModelCard />
          <MangaStyleCard />
          <MangaGridLayoutCard />
        </div>
      </div>
      <Button size="lg" onClick={() => setStoryStep('panels')} className="self-center">下一步</Button>
    </div>
  )
}

export function StoryTab() {
  const [storyStep, setStoryStep] = useAtom(storyStepAtom)
  const [, setActiveTab] = useAtom(activeTabAtom)
  const [, setStoryCompleted] = useAtom(storyCompletedAtom)

  const handleStoryLoadingComplete = () => {
    setActiveTab('characters')
    setStoryStep('input')
    setStoryCompleted(true)
  }

  if (storyStep === 'panels') {
    return <PanelsView />
  }
  
  if (storyStep === 'generate') {
    return <LoadingView 
      initialText="剧情解析中..." 
      onCompletion={handleStoryLoadingComplete}
      textChanges={[{ progress: 40, text: '漫画生成中...' }]}
    />
  }

  return <InputView />
}

import { useAtom } from 'jotai'
import { Check } from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { activeTabAtom, charactersCompletedAtom, storyCompletedAtom, storyStepAtom } from './atoms'
import { CharactersTab } from './character/characters-tab'
import { ImageGenerationTab } from './image-generation/image-generation-tab'
import { StoryTab } from './story/story-tab'

export default function ComicsPage() {
  const [storyStep] = useAtom(storyStepAtom)
  const [activeTab, setActiveTab] = useAtom(activeTabAtom)
  const [storyCompleted] = useAtom(storyCompletedAtom)
  const [charactersCompleted] = useAtom(charactersCompletedAtom)

  const pageTitle = activeTab === 'story'
    ? (storyStep === 'panels' ? '生成9个分镜头' : '漫画创作')
    : ''

  return (
    <div className="flex-1 p-8 pt-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-center relative">
          <div className="absolute left-0 flex items-center gap-4">
            <h2 className="text-3xl font-bold tracking-tight">{pageTitle}</h2>
          </div>
          <TabsList className="grid w-[400px] grid-cols-3">
            <TabsTrigger value="story">
              <span className="inline-flex items-center gap-2">
                {storyCompleted && <Check className="h-4 w-4 text-emerald-500" />}
                <span>故事</span>
              </span>
            </TabsTrigger>
            <TabsTrigger value="characters">
              <span className="inline-flex items-center gap-2">
                {charactersCompleted && <Check className="h-4 w-4 text-emerald-500" />}
                <span>人物</span>
              </span>
            </TabsTrigger>
            <TabsTrigger value="image-generation">生图</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="story">
          <StoryTab />
        </TabsContent>
        <TabsContent value="characters">
          <CharactersTab />
        </TabsContent>
        <TabsContent value="image-generation">
          <ImageGenerationTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
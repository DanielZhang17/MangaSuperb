import { useAtom } from 'jotai'
import { Check } from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/hooks/use-i18n'

import { activeTabAtom, charactersCompletedAtom, currentComicDetailAtom, storyCompletedAtom } from './atoms'
import { previousComicDetailAtom } from './atoms'
import { CharactersTab } from './character/characters-tab'
import { ImageGenerationTab } from './image-generation/image-generation-tab'
import { PanelsTab } from './panels/panels-tab'
import { StoryTab } from './story/story-tab'

export default function ComicsPage() {
  const { t } = useI18n('comics')
  const [activeTab, setActiveTab] = useAtom(activeTabAtom)
  const [storyCompleted] = useAtom(storyCompletedAtom)
  const [charactersCompleted] = useAtom(charactersCompletedAtom)
  const [comicDetail] = useAtom(currentComicDetailAtom)
  const [prevComic] = useAtom(previousComicDetailAtom)

  const shotsCount = ((comicDetail || prevComic)?.panel_shots?.length as number | undefined) || 0
  const panelsCompleted = shotsCount > 0

  const pageTitle = activeTab === 'story'
    ? String(t('title.create'))
    : activeTab === 'panels'
      ? String(t('title.panels', { count: shotsCount }))
      : ''

  return (
    <div className="flex-1 p-8 pt-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-center relative">
          <div className="absolute left-0 flex items-center gap-4">
            <h2 className="text-3xl font-bold tracking-tight">{pageTitle}</h2>
          </div>
          <TabsList className="grid w-[520px] grid-cols-4">
            <TabsTrigger value="story">
              <span className="inline-flex items-center gap-2">
                {storyCompleted && <Check className="h-4 w-4 text-emerald-500" />}
                <span>{String(t('tabs.story'))}</span>
              </span>
            </TabsTrigger>
            <TabsTrigger value="characters">
              <span className="inline-flex items-center gap-2">
                {charactersCompleted && <Check className="h-4 w-4 text-emerald-500" />}
                <span>{String(t('tabs.characters'))}</span>
              </span>
            </TabsTrigger>
            <TabsTrigger value="panels">
              <span className="inline-flex items-center gap-2">
                {panelsCompleted && <Check className="h-4 w-4 text-emerald-500" />}
                <span>{String(t('tabs.panels'))}</span>
              </span>
            </TabsTrigger>
            <TabsTrigger value="image-generation">{String(t('tabs.imageGeneration'))}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="story">
          <StoryTab />
        </TabsContent>
        <TabsContent value="characters">
          <CharactersTab />
        </TabsContent>
        <TabsContent value="panels">
          <PanelsTab />
        </TabsContent>
        <TabsContent value="image-generation">
          <ImageGenerationTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
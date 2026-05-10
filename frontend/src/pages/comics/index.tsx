import { useAtom } from 'jotai'
import { Check } from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/hooks/use-i18n'

import { activeTabAtom, charactersCompletedAtom, currentComicDetailAtom, storyCompletedAtom, workflowModeAtom } from './atoms'
import { AutoModeTab } from './auto/auto-mode-tab'
import { CharactersTab } from './character/characters-tab'
import { ComicsWorkflowShell } from './components/workflow-layout'
import { ImageGenerationTab } from './image-generation/image-generation-tab'
import { PanelsTab } from './panels/panels-tab'
import { StoryTab } from './story/story-tab'

export default function ComicsPage() {
  const { t } = useI18n('comics')
  const [activeTab, setActiveTab] = useAtom(activeTabAtom)
  const [workflowMode, setWorkflowMode] = useAtom(workflowModeAtom)
  const [storyCompleted] = useAtom(storyCompletedAtom)
  const [charactersCompleted] = useAtom(charactersCompletedAtom)
  const [comicDetail] = useAtom(currentComicDetailAtom)
  const shotsCount = (comicDetail?.panel_shots?.length as number | undefined) || 0
  const panelsCompleted = shotsCount > 0

  const pageTitle = activeTab === 'story'
    ? String(t('title.create'))
    : activeTab === 'panels'
      ? String(t('title.panelsPage'))
      : activeTab === 'characters'
        ? String(t('tabs.characters'))
        : String(t('tabs.imageGeneration'))

  return (
    <div className="flex-1">
      <Tabs value={workflowMode} onValueChange={(value) => setWorkflowMode(value as 'auto' | 'pro')}>
        <ComicsWorkflowShell className="pb-0">
          <TabsList className="grid w-full grid-cols-2 sm:w-[320px]">
            <TabsTrigger value="auto" onClick={() => setWorkflowMode('auto')}>{String(t('workflow.auto'))}</TabsTrigger>
            <TabsTrigger value="pro" onClick={() => setWorkflowMode('pro')}>{String(t('workflow.pro'))}</TabsTrigger>
          </TabsList>
        </ComicsWorkflowShell>
        <TabsContent value="auto" className="mt-0">
          <AutoModeTab onOpenPro={() => setWorkflowMode('pro')} />
        </TabsContent>
        <TabsContent value="pro" className="mt-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <ComicsWorkflowShell className="pb-0">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold tracking-normal md:text-3xl">{pageTitle}</h2>
                  {activeTab === 'panels' && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {String(t('panels.generatedShots', { count: shotsCount }))}
                    </p>
                  )}
                </div>
                <TabsList className="grid w-full grid-cols-4 sm:w-[520px]">
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
            </ComicsWorkflowShell>
            <TabsContent value="story" className="mt-0">
              <StoryTab />
            </TabsContent>
            <TabsContent value="characters" className="mt-0">
              <CharactersTab />
            </TabsContent>
            <TabsContent value="panels" className="mt-0">
              <PanelsTab />
            </TabsContent>
            <TabsContent value="image-generation" className="mt-0">
              <ImageGenerationTab />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  )
}

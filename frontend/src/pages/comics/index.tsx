import { useAtom } from 'jotai'
import { Check } from 'lucide-react'
import { useEffect } from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/hooks/use-i18n'
import { usePreferences } from '@/hooks/use-preferences'

import {
  activeTabAtom,
  charactersCompletedAtom,
  currentComicDetailAtom,
  customPagesAtom,
  defaultLayoutAtom,
  selectedPageAtom,
  storyCompletedAtom,
  styleAtom,
  colorModeAtom,
} from './atoms'
import { CharactersTab } from './character/characters-tab'
import { ImageGenerationTab } from './image-generation/image-generation-tab'
import { PanelsTab } from './panels/panels-tab'
import { StoryTab } from './story/story-tab'

export default function ComicsPage() {
  const { t } = useI18n('comics')
  const { preferences } = usePreferences()
  const [activeTab, setActiveTab] = useAtom(activeTabAtom)
  const [storyCompleted] = useAtom(storyCompletedAtom)
  const [charactersCompleted] = useAtom(charactersCompletedAtom)
  const [comicDetail] = useAtom(currentComicDetailAtom)
  const [customPages, setCustomPages] = useAtom(customPagesAtom)
  const [selectedPage, setSelectedPage] = useAtom(selectedPageAtom)
  const [styleValue, setStyle] = useAtom(styleAtom)
  const [defaultLayoutValue, setDefaultLayout] = useAtom(defaultLayoutAtom)
  const [colorModeValue, setColorMode] = useAtom(colorModeAtom)
  const shotsCount = (comicDetail?.panel_shots?.length as number | undefined) || 0
  const panelsCompleted = shotsCount > 0

  const pageTitle = activeTab === 'story'
    ? String(t('title.create'))
    : activeTab === 'panels'
      ? String(t('title.panels', { count: shotsCount }))
      : ''

  useEffect(() => {
    if (!comicDetail) return
    const pages = new Set<number>()
    const layouts = Array.isArray(comicDetail.page_layouts) ? comicDetail.page_layouts : []
    const shots = Array.isArray(comicDetail.panel_shots) ? comicDetail.panel_shots : []

    layouts.forEach((layout: any) => {
      const page = Number(layout?.page_number)
      if (Number.isFinite(page) && page > 0) pages.add(page)
    })
    shots.forEach((shot: any) => {
      const page = Number(shot?.page_number)
      if (Number.isFinite(page) && page > 0) pages.add(page)
    })

    if (pages.size > 0) {
      setCustomPages((prev) => prev.filter((page) => !pages.has(page)))
    }
  }, [comicDetail, setCustomPages])

  useEffect(() => {
    const existingPages = new Set<number>()
    const layouts = Array.isArray(comicDetail?.page_layouts) ? comicDetail?.page_layouts : []
    const shots = Array.isArray(comicDetail?.panel_shots) ? comicDetail?.panel_shots : []

    layouts.forEach((layout: any) => {
      const page = Number(layout?.page_number)
      if (Number.isFinite(page) && page > 0) existingPages.add(page)
    })
    shots.forEach((shot: any) => {
      const page = Number(shot?.page_number)
      if (Number.isFinite(page) && page > 0) existingPages.add(page)
    })

    const placeholderPages = customPages.filter((page) => !existingPages.has(page))
    const allPages = [...existingPages, ...placeholderPages]

    if (allPages.length === 0) {
      if (selectedPage !== 1) setSelectedPage(1)
    } else if (!allPages.includes(selectedPage)) {
      setSelectedPage(Math.min(...allPages))
    }
  }, [comicDetail, customPages, selectedPage, setSelectedPage])

  useEffect(() => {
    if (!preferences?.selected_style) return
    if (comicDetail) return
    if (styleValue === preferences.selected_style) return
    setStyle(preferences.selected_style)
  }, [preferences?.selected_style, setStyle, comicDetail, styleValue])

  useEffect(() => {
    if (!preferences?.default_layout) return
    if (comicDetail) return
    if (defaultLayoutValue === preferences.default_layout) return
    setDefaultLayout(preferences.default_layout)
  }, [preferences?.default_layout, setDefaultLayout, comicDetail, defaultLayoutValue])

  useEffect(() => {
    if (!preferences?.color_mode) return
    if (comicDetail) return
    if (colorModeValue === preferences.color_mode) return
    setColorMode(preferences.color_mode)
  }, [preferences?.color_mode, setColorMode, comicDetail, colorModeValue])

  return (
    <div className="flex-1 p-3 pt-4 sm:p-6 md:p-8 md:pt-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row items-center justify-center relative gap-3 sm:gap-0">
          <div className="sm:absolute sm:left-0 flex items-center gap-4 w-full sm:w-auto">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{pageTitle}</h2>
          </div>
          <TabsList className="grid w-full max-w-full sm:w-[520px] grid-cols-4 text-xs sm:text-sm">
            <TabsTrigger value="story" className="px-2 sm:px-4">
              <span className="inline-flex items-center gap-1 sm:gap-2">
                {storyCompleted && <Check className="h-3 w-3 sm:h-4 sm:w-4 text-emerald-500" />}
                <span>{String(t('tabs.story'))}</span>
              </span>
            </TabsTrigger>
            <TabsTrigger value="characters" className="px-2 sm:px-4">
              <span className="inline-flex items-center gap-1 sm:gap-2">
                {charactersCompleted && <Check className="h-3 w-3 sm:h-4 sm:w-4 text-emerald-500" />}
                <span className="hidden sm:inline">{String(t('tabs.characters'))}</span>
                <span className="sm:hidden">角色</span>
              </span>
            </TabsTrigger>
            <TabsTrigger value="panels" className="px-2 sm:px-4">
              <span className="inline-flex items-center gap-1 sm:gap-2">
                {panelsCompleted && <Check className="h-3 w-3 sm:h-4 sm:w-4 text-emerald-500" />}
                <span className="hidden sm:inline">{String(t('tabs.panels'))}</span>
                <span className="sm:hidden">分镜</span>
              </span>
            </TabsTrigger>
            <TabsTrigger value="image-generation" className="px-2 sm:px-4">
              <span className="hidden sm:inline">{String(t('tabs.imageGeneration'))}</span>
              <span className="sm:hidden">生成</span>
            </TabsTrigger>
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

import { useAtom } from 'jotai'
import { FilePenLine } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { activeTabAtom, mangaTitleAtom, storyStepAtom } from './atoms'
import { CharactersTab } from './characters-tab'
import { ImageGenerationTab } from './image-generation-tab'
import { StoryTab } from './story-tab'

export default function ComicsPage() {
  const [storyStep] = useAtom(storyStepAtom)
  const [title, setTitle] = useAtom(mangaTitleAtom)
  const [activeTab, setActiveTab] = useAtom(activeTabAtom)
  const [isEditing, setIsEditing] = useState(false)

  const pageTitle = storyStep === 'panels' ? '生成9个分镜头' : title

  return (
    <div className="flex-1 p-8 pt-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-center relative">
          <div className="absolute left-0 flex items-center gap-4">
            {isEditing && storyStep === 'input' ? (
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setIsEditing(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setIsEditing(false)
                  }
                }}
                autoFocus
                className="text-3xl font-bold tracking-tight w-auto"
              />
            ) : (
              <h2 className="text-3xl font-bold tracking-tight">{pageTitle}</h2>
            )}
            {storyStep === 'input' && (
              <Button variant="ghost" size="icon" onClick={() => setIsEditing(!isEditing)}>
                <FilePenLine className="h-5 w-5" />
              </Button>
            )}
          </div>
          <TabsList className="grid w-[400px] grid-cols-3">
            <TabsTrigger value="story">故事</TabsTrigger>
            <TabsTrigger value="characters">人物</TabsTrigger>
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
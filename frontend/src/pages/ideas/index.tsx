import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/hooks/use-i18n'

import CharactersGrid from './parts/characters-grid.tsx'
import IdeasGrid from './parts/ideas-grid.tsx'

export default function IdeasPage() {
  const { t } = useI18n('ideas')
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') === 'characters' ? 'characters' : 'ideas'
  const [tab, setTab] = useState<'ideas' | 'characters'>(initialTab as 'ideas' | 'characters')

  useEffect(() => {
    const sp = searchParams.get('tab')
    const next = sp === 'characters' ? 'characters' : 'ideas'
    if (next !== tab) setTab(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const onTabChange = (val: string) => {
    const next = (val === 'characters' ? 'characters' : 'ideas') as 'ideas' | 'characters'
    setTab(next)
    setSearchParams(next === 'ideas' ? {} : { tab: 'characters' })
  }

  return (
    <Tabs value={tab} onValueChange={onTabChange}>
      <TabsList className="mb-4 sm:mb-6">
        <TabsTrigger value="ideas" className="text-xs sm:text-sm">{String(t('tab.ideas'))}</TabsTrigger>
        <TabsTrigger value="characters" className="text-xs sm:text-sm">{String(t('tab.characters'))}</TabsTrigger>
      </TabsList>
      <TabsContent value="ideas">
        <IdeasGrid />
      </TabsContent>
      <TabsContent value="characters">
        <CharactersGrid />
      </TabsContent>
    </Tabs>
  )
}
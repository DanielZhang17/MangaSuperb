import { useAtom } from 'jotai'
import { SlidersHorizontal } from 'lucide-react'
import { useEffect } from 'react'
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'

import { AutoApi } from '@/apis/auto'
import { Button } from '@/components/ui/button'
import { useAiProviders } from '@/hooks/use-ai-providers'
import { useI18n } from '@/hooks/use-i18n'
import { usePreferences } from '@/hooks/use-preferences'
import { resolveAvailablePreferenceValue, resolvePreferenceValue } from '@/lib/auto-preferences'

import {
  autoCharacterReviewAtom,
  autoCharacterReviewStoryAtom,
  currentComicOverridesAtom,
  fullStoryAtom,
  styleAtom,
} from '../atoms'
import { ComicsWorkflowShell } from '../components/workflow-layout'
import { StoryEditor } from '../story/story-editor'
import { CharacterReview } from './character-review'

export function AutoModeTab({ onOpenPro }: { onOpenPro: () => void }) {
  const { t } = useI18n('comics')
  const [story] = useAtom(fullStoryAtom)
  const [style] = useAtom(styleAtom)
  const [overrides] = useAtom(currentComicOverridesAtom)
  const [review, setReview] = useAtom(autoCharacterReviewAtom)
  const [reviewStory, setReviewStory] = useAtom(autoCharacterReviewStoryAtom)
  const [preparing, setPreparing] = useState(false)
  const { providers, imageProviders, textProviders } = useAiProviders()
  const { preferences } = usePreferences()

  const hasStory = story.trim().length > 0
  const imageProvider = useMemo(() => {
    const preference = overrides.image_provider ?? preferences?.fields?.image_provider
    const fallback = imageProviders.includes(providers.defaults.image)
      ? providers.defaults.image
      : (imageProviders[0] ?? providers.defaults.image)

    return resolveAvailablePreferenceValue(preference, imageProviders, fallback)
  }, [imageProviders, overrides.image_provider, preferences?.fields?.image_provider, providers.defaults.image])
  const stylePreference = useMemo(() => {
    const preference = overrides.style ?? preferences?.fields?.style

    return resolvePreferenceValue(preference, style)
  }, [overrides.style, preferences?.fields?.style, style])
  const textProvider = useMemo(() => {
    const preference = overrides.text_provider ?? preferences?.fields?.text_provider
    const fallback = textProviders.includes(providers.defaults.text)
      ? providers.defaults.text
      : (textProviders[0] ?? providers.defaults.text)

    return resolveAvailablePreferenceValue(preference, textProviders, fallback)
  }, [overrides.text_provider, preferences?.fields?.text_provider, providers.defaults.text, textProviders])

  useEffect(() => {
    if (!review || reviewStory === null || reviewStory === story) return

    setReview(null)
    setReviewStory(null)
  }, [review, reviewStory, setReview, setReviewStory, story])

  const handlePrepareCharacters = async () => {
    if (!hasStory) {
      toast.error(String(t('auto.error.addStory')))

      return
    }

    try {
      setPreparing(true)
      const response = await AutoApi.prepareCharacters({
        story,
        style_preference: stylePreference,
        image_provider: imageProvider,
        text_provider: textProvider,
      })
      setReviewStory(story)
      setReview(response)
    } catch (error: any) {
      toast.error(error?.message || String(t('auto.error.prepareFailed')))
    } finally {
      setPreparing(false)
    }
  }

  return (
    <ComicsWorkflowShell>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-normal md:text-3xl">{String(t('auto.title'))}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{String(t('auto.subtitle'))}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={handlePrepareCharacters}
            disabled={preparing || !hasStory}
            className="shrink-0"
          >
            {preparing ? String(t('auto.preparing')) : String(t('auto.prepareCharacters'))}
          </Button>
          <Button type="button" variant="outline" onClick={onOpenPro} className="shrink-0">
            <SlidersHorizontal className="size-4" />
            {String(t('auto.openPro'))}
          </Button>
        </div>
      </div>
      <StoryEditor />
      {review && <CharacterReview />}
    </ComicsWorkflowShell>
  )
}

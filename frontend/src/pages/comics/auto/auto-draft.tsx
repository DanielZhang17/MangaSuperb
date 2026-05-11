import { useAtom } from 'jotai'
import { Sparkles } from 'lucide-react'
import { useMemo } from 'react'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import { useAiProviders } from '@/hooks/use-ai-providers'
import { useI18n } from '@/hooks/use-i18n'
import { usePreferences } from '@/hooks/use-preferences'
import { resolveAvailablePreferenceValue, resolvePreferenceValue } from '@/lib/auto-preferences'

import {
  currentComicDetailAtom,
  currentComicIdAtom,
  currentComicOverridesAtom,
  fullStoryAtom,
  mangaTitleAtom,
  styleAtom,
} from '../atoms'
import { ComicsWorkflowShell } from '../components/workflow-layout'
import { StoryEditor } from '../story/story-editor'
import type { AutoRunController } from './auto-mode-tab'

function copy(value: unknown, fallback: string) {
  const text = String(value)

  return text.includes('.') ? fallback : text
}

export function AutoDraft({ autoRunState }: { autoRunState: AutoRunController }) {
  const { t } = useI18n('comics')
  const [story] = useAtom(fullStoryAtom)
  const [title] = useAtom(mangaTitleAtom)
  const [comicId, setComicId] = useAtom(currentComicIdAtom)
  const [, setComicDetail] = useAtom(currentComicDetailAtom)
  const [style] = useAtom(styleAtom)
  const [overrides] = useAtom(currentComicOverridesAtom)
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

  const handleGenerate = async () => {
    if (!hasStory) {
      toast.error(copy(t('auto.error.addStory'), 'Add a story before generating manga.'))

      return
    }

    try {
      const response = await autoRunState.startRun({
        comic_id: comicId,
        title: title.trim() || 'Untitled manga',
        story,
        preferences: {
          image_provider: imageProvider,
          style_description: stylePreference,
          text_provider: textProvider,
        },
      })
      if (response?.comic?.id) {
        setComicId(response.comic.id)
        setComicDetail(response.comic)
      }
    } catch (error: any) {
      toast.error(error?.message || copy(t('auto.error.startFailed'), 'Auto run failed to start'))
    }
  }

  return (
    <ComicsWorkflowShell>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-normal md:text-3xl">
            {copy(t('auto.title'), 'Auto Manga')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {copy(t('auto.subtitle'), 'Upload or paste a novel to start.')}
          </p>
        </div>
        <Button
          type="button"
          onClick={handleGenerate}
          disabled={autoRunState.isLoading || !hasStory}
          className="shrink-0"
        >
          <Sparkles className="size-4" />
          {autoRunState.isLoading
            ? copy(t('auto.generating'), 'Generating...')
            : copy(t('auto.generateManga'), 'Generate manga')}
        </Button>
      </div>
      <StoryEditor />
    </ComicsWorkflowShell>
  )
}

import { useAtom } from 'jotai'
import { Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'

import AutoApi from '@/apis/auto'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

function fallbackTitleFromStory(story: string) {
  const firstLine = story
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean)

  if (!firstLine) return 'Untitled manga'

  return firstLine.length > 48 ? `${firstLine.slice(0, 45).trim()}...` : firstLine
}

export function AutoDraft({ autoRunState }: { autoRunState: AutoRunController }) {
  const { t } = useI18n('comics')
  const [story] = useAtom(fullStoryAtom)
  const [title, setTitle] = useAtom(mangaTitleAtom)
  const [comicId, setComicId] = useAtom(currentComicIdAtom)
  const [, setComicDetail] = useAtom(currentComicDetailAtom)
  const [style] = useAtom(styleAtom)
  const [overrides] = useAtom(currentComicOverridesAtom)
  const [titleDialogOpen, setTitleDialogOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [suggestingTitle, setSuggestingTitle] = useState(false)
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

    setSuggestingTitle(true)
    try {
      const existingTitle = title.trim()
      const nextTitle = existingTitle || (await AutoApi.suggestTitle({
        story,
        text_provider: textProvider,
      })).title

      setTitleDraft(nextTitle.trim() || fallbackTitleFromStory(story))
      setTitleDialogOpen(true)
    } catch (error: any) {
      setTitleDraft(title.trim() || fallbackTitleFromStory(story))
      setTitleDialogOpen(true)
      toast.error(error?.message || copy(t('auto.error.titleSuggestionFailed'), 'Could not generate a title. Review the fallback title.'))
    } finally {
      setSuggestingTitle(false)
    }
  }

  const handleConfirmGenerate = async () => {
    const confirmedTitle = titleDraft.trim()
    if (!confirmedTitle) {
      toast.error(copy(t('auto.titleDialog.label'), 'Comic title'))

      return
    }

    try {
      const response = await autoRunState.startRun({
        comic_id: comicId,
        title: confirmedTitle,
        story,
        preferences: {
          image_provider: imageProvider,
          style_description: stylePreference,
          text_provider: textProvider,
        },
      })
      setTitle(confirmedTitle)
      setTitleDialogOpen(false)
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
          disabled={autoRunState.isLoading || suggestingTitle || !hasStory}
          className="shrink-0"
        >
          <Sparkles className="size-4" />
          {autoRunState.isLoading || suggestingTitle
            ? copy(t('auto.generating'), 'Generating...')
            : copy(t('auto.generateManga'), 'Generate manga')}
        </Button>
      </div>
      <StoryEditor />

      <Dialog open={titleDialogOpen} onOpenChange={setTitleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy(t('auto.titleDialog.title'), 'Confirm comic title')}</DialogTitle>
            <DialogDescription>
              {copy(t('auto.titleDialog.description'), 'Review the generated title before rendering.')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="auto-title-draft">
                {copy(t('auto.titleDialog.label'), 'Comic title')}
              </Label>
              <Input
                id="auto-title-draft"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => void handleConfirmGenerate()}
              disabled={autoRunState.isLoading || !titleDraft.trim()}
            >
              {autoRunState.isLoading
                ? copy(t('auto.titleDialog.suggesting'), 'Generating title...')
                : copy(t('auto.titleDialog.confirm'), 'Start generation')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ComicsWorkflowShell>
  )
}

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

import CharactersApi from '@/apis/characters'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { AI_PROVIDER_LABELS } from '@/hooks/use-ai-providers'
import { useI18n } from '@/hooks/use-i18n'
import type { AiProviderId, AiProvidersResponse, ICharacter } from '@/service/types'

const SEX_OPTIONS = [
  { value: 'unspecified', labelKey: 'characterDialog.sex.unspecified' },
  { value: 'female', labelKey: 'characterDialog.sex.female' },
  { value: 'male', labelKey: 'characterDialog.sex.male' },
  { value: 'non-binary', labelKey: 'characterDialog.sex.nonBinary' },
  { value: 'other', labelKey: 'characterDialog.sex.other' },
]

const FALLBACK_PROVIDERS: AiProvidersResponse = {
  defaults: {
    image: 'gemini',
    text: 'gemini',
  },
  providers: {
    gemini: { image: true, text: true },
    third_party: { image: true, text: true },
  },
}

function firstAvailableProvider(
  providers: AiProvidersResponse,
  kind: 'image' | 'text',
  preferred?: AiProviderId,
): AiProviderId {
  if (preferred && providers.providers[preferred]?.[kind]) return preferred
  const defaultProvider = providers.defaults[kind]
  if (providers.providers[defaultProvider]?.[kind]) return defaultProvider

  return ((Object.keys(providers.providers) as AiProviderId[]).find(
    (provider) => providers.providers[provider]?.[kind],
  ) ?? defaultProvider)
}

export function CharacterUpsertDialog({
  mode,
  open,
  character,
  initialValues,
  providers = FALLBACK_PROVIDERS,
  defaultProvider,
  onOpenChange,
  onSaved,
}: {
  mode: 'create' | 'edit'
  open: boolean
  character?: ICharacter
  initialValues?: Partial<Pick<ICharacter, 'name' | 'description' | 'sex' | 'style_prompt'>>
  providers?: AiProvidersResponse
  defaultProvider?: AiProviderId
  onOpenChange: (open: boolean) => void
  onSaved: (character: ICharacter) => void
}) {
  const { t } = useI18n('comics')
  const imageOptions = useMemo(
    () => (Object.keys(providers.providers) as AiProviderId[]).filter(
      (provider) => providers.providers[provider]?.image,
    ),
    [providers],
  )
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sex, setSex] = useState('unspecified')
  const [stylePrompt, setStylePrompt] = useState('')
  const [optimize, setOptimize] = useState(false)
  const [provider, setProvider] = useState<AiProviderId>(
    firstAvailableProvider(providers, 'image', defaultProvider),
  )
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(mode === 'edit' ? character?.name ?? '' : initialValues?.name ?? '')
    setDescription(mode === 'edit' ? character?.description ?? '' : initialValues?.description ?? '')
    setSex(mode === 'edit' ? character?.sex ?? 'unspecified' : initialValues?.sex ?? 'unspecified')
    setStylePrompt(mode === 'edit' ? character?.style_prompt ?? '' : initialValues?.style_prompt ?? '')
    setOptimize(false)
    setProvider(firstAvailableProvider(providers, 'image', defaultProvider))
  }, [character, defaultProvider, initialValues, mode, open, providers])

  const selectedTextProvider = firstAvailableProvider(providers, 'text', provider)
  const title = String(t(mode === 'edit' ? 'characterDialog.title.edit' : 'characterDialog.title.create'))
  const submitLabel = String(t(mode === 'edit' ? 'characterDialog.submit.edit' : 'characterDialog.submit.create'))

  const handleSubmit = async () => {
    const cleanDescription = description.trim()
    if (!cleanDescription) {
      toast.error(String(t('characterDialog.descriptionRequired')))

      return
    }

    try {
      setSubmitting(true)
      const payload = {
        name: name.trim() || String(t('characterDialog.fallbackName')),
        description: cleanDescription,
        sex,
        style_prompt: stylePrompt.trim(),
        optimize,
        image_provider: provider,
        text_provider: selectedTextProvider,
      }
      const response = mode === 'edit' && character
        ? await CharactersApi.update(character.id, payload)
        : await CharactersApi.create(payload)

      onSaved(response.character)
      toast.success(String(t(mode === 'edit' ? 'characterDialog.success.edit' : 'characterDialog.success.create')))
      onOpenChange(false)
    } catch (error: any) {
      toast.error(error?.message || String(t(mode === 'edit' ? 'characterDialog.error.edit' : 'characterDialog.error.create')))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal>
      <DialogContent
        className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {String(t('characterDialog.description'))}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="character-name">{String(t('characterDialog.name'))}</Label>
            <Input
              id="character-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={String(t('characterDialog.namePlaceholder'))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="character-sex">{String(t('characterDialog.sex'))}</Label>
            <Select value={sex} onValueChange={setSex}>
              <SelectTrigger id="character-sex" className="w-full">
                <SelectValue placeholder={String(t('characterDialog.selectSex'))} />
              </SelectTrigger>
              <SelectContent>
                {SEX_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {String(t(option.labelKey))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="character-description">{String(t('characterDialog.descriptionLabel'))}</Label>
            <Textarea
              id="character-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-[180px] resize-y"
              placeholder={String(t('characterDialog.descriptionPlaceholder'))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="character-style">{String(t('characterDialog.style'))}</Label>
            <Input
              id="character-style"
              value={stylePrompt}
              onChange={(event) => setStylePrompt(event.target.value)}
              placeholder={String(t('characterDialog.stylePlaceholder'))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="character-provider">{String(t('characterDialog.aiModel'))}</Label>
            <Select value={provider} onValueChange={(value) => setProvider(value as AiProviderId)}>
              <SelectTrigger id="character-provider" className="w-full">
                <SelectValue placeholder={String(t('characterDialog.chooseModel'))} />
              </SelectTrigger>
              <SelectContent>
                {imageOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {AI_PROVIDER_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">{String(t('characterDialog.optimizeTitle'))}</p>
              <p className="text-xs text-muted-foreground">{String(t('characterDialog.optimizeDescription'))}</p>
            </div>
            <Switch checked={optimize} onCheckedChange={setOptimize} />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? String(t('characterDialog.submitting')) : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

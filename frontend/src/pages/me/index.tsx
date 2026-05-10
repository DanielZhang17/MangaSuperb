import { useAtom } from 'jotai'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import toast from 'react-hot-toast'

import { userAtom } from '@/atoms'
import { InlineInput } from '@/components/common/inline-input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DEFAULT_ASPECT_RATIOS,
  DEFAULT_BUBBLE_SHAPES,
  DEFAULT_FONT_FAMILIES,
  DEFAULT_FONT_SIZES,
  DEFAULT_LAYOUT_OPTIONS,
  DEFAULT_STYLE_PRESETS,
} from '@/config/preferences'
import { AI_PROVIDER_LABELS, useAiProviders } from '@/hooks/use-ai-providers'
import { useAuth } from '@/hooks/use-auth'
import { useI18n } from '@/hooks/use-i18n'
import { usePreferences } from '@/hooks/use-preferences'
import { getAvatarUrl } from '@/lib/utils'
import { AutoSelectControl } from '@/pages/comics/components/auto-select-control'
import type { AiProviderId, AutoPreference, ColorMode, WorkflowPreferenceFields } from '@/service/types'

const AUTO_VALUE = '__auto__'

function fieldPreference<K extends keyof WorkflowPreferenceFields>(
  preferences: { fields?: Partial<WorkflowPreferenceFields> } | undefined,
  field: K,
): WorkflowPreferenceFields[K] {
  return (preferences?.fields?.[field] ?? { mode: 'auto' }) as WorkflowPreferenceFields[K]
}

function optionsFromValues(values: readonly string[], labels: Record<string, string> = {}) {
  return values.map((value) => ({
    value,
    label: labels[value] ?? value,
  }))
}

function BubbleTailControl({
  value,
  onChange,
}: {
  value: AutoPreference<boolean>
  onChange: (value: AutoPreference<boolean>) => void
}) {
  const { t } = useI18n(['me', 'common'])
  const selectValue = value.mode === 'manual' ? String(value.value) : AUTO_VALUE

  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor="bubble-tail-preference" className="text-sm text-muted-foreground">
        {String(t('settings.bubbleTails'))}
      </Label>
      <Select
        value={selectValue}
        onValueChange={(nextValue) => {
          if (nextValue === AUTO_VALUE) {
            onChange({ mode: 'auto' })

            return
          }

          onChange({ mode: 'manual', value: nextValue === 'true' })
        }}
      >
        <SelectTrigger id="bubble-tail-preference" size="sm" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AUTO_VALUE}>{String(t('common:preference.auto'))}</SelectItem>
          <SelectItem value="true">{String(t('options.bubbleTail.show'))}</SelectItem>
          <SelectItem value="false">{String(t('options.bubbleTail.hide'))}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border/60 bg-card p-5 shadow-sm">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  )
}

export default function CharacterSettingsPage() {
  const { t } = useI18n(['me', 'common'])
  const [user] = useAtom(userAtom)
  const { updateUsername } = useAuth()
  const { preferences, layoutOptions, colorModes, update } = usePreferences()
  const { imageProviders, textProviders } = useAiProviders()
  const username = user?.username ?? String(t('username.guest'))
  const avatarUrl = getAvatarUrl(user?.avatar_index ?? null)

  const styleOptions = useMemo(() => {
    const presets = preferences?.style_presets?.length ? preferences.style_presets : DEFAULT_STYLE_PRESETS

    return presets.map((preset) => ({
      value: preset.value,
      label: preset.label,
    }))
  }, [preferences?.style_presets])

  const layoutSelectOptions = useMemo(
    () => optionsFromValues(layoutOptions.length ? layoutOptions : DEFAULT_LAYOUT_OPTIONS, {
      'auto-grid': String(t('options.layout.autoGrid')),
      'grid-2x2': String(t('options.layout.grid2x2')),
      vertical: String(t('options.layout.vertical')),
      cinematic: String(t('options.layout.cinematic')),
    }),
    [layoutOptions, t],
  )
  const colorOptions = useMemo(
    () => optionsFromValues(colorModes, {
      'black-white': String(t('options.color.blackWhite')),
      color: String(t('options.color.color')),
    }),
    [colorModes, t],
  )
  const aspectOptions = useMemo(() => optionsFromValues(DEFAULT_ASPECT_RATIOS), [])
  const fontFamilyOptions = useMemo(
    () => optionsFromValues(DEFAULT_FONT_FAMILIES, {
      'source-han-sans': String(t('options.font.sourceHanSans')),
      yahei: String(t('options.font.yahei')),
      heiti: String(t('options.font.heiti')),
      songti: String(t('options.font.songti')),
    }),
    [t],
  )
  const fontSizeOptions = useMemo(() => (
    DEFAULT_FONT_SIZES.map((value) => ({ value, label: `${value}px` }))
  ), [])
  const bubbleShapeOptions = useMemo(
    () => optionsFromValues(DEFAULT_BUBBLE_SHAPES, {
      rect: String(t('options.bubbleShape.rect')),
      round: String(t('options.bubbleShape.round')),
    }),
    [t],
  )
  const imageProviderOptions = useMemo(() => (
    imageProviders.map((value) => ({ value, label: AI_PROVIDER_LABELS[value] }))
  ), [imageProviders])
  const textProviderOptions = useMemo(() => (
    textProviders.map((value) => ({ value, label: AI_PROVIDER_LABELS[value] }))
  ), [textProviders])

  const updateField = async <K extends keyof WorkflowPreferenceFields>(
    field: K,
    value: WorkflowPreferenceFields[K],
  ) => {
    try {
      await update({
        fields: {
          [field]: value,
        },
      })
    } catch (error: any) {
      toast.error(error?.message || String(t('error.savePreferences')))
    }
  }

  return (
    <div className="min-h-screen bg-background px-6 py-8 text-foreground lg:px-10">
      <header className="mb-8 flex flex-wrap items-center gap-4">
        <img
          src={avatarUrl}
          alt={username}
          className="h-16 w-16 rounded-full border border-border"
        />
        <div className="min-w-0">
          <InlineInput
            initialValue={username}
            submitLabel={String(t('username.save'))}
            placeholder={String(t('username.placeholder'))}
            renderDisplay={(val) => (
              <h1 className="truncate text-3xl font-semibold tracking-normal">{val || String(t('username.guest'))}</h1>
            )}
            onSubmit={async (value) => {
              const cleanValue = value.trim()
              if (!cleanValue || cleanValue === user?.username) return
              await updateUsername({ username: cleanValue })
            }}
          />
          <p className="mt-1 text-sm text-muted-foreground">{String(t('settings.creatorDefaults'))}</p>
        </div>
      </header>

      <main className="grid gap-5 xl:grid-cols-2">
        <SettingsGroup title={String(t('settings.automation'))}>
          <AutoSelectControl
            label={String(t('settings.characters'))}
            value={fieldPreference(preferences, 'character_detection')}
            options={[{ value: 'enabled', label: String(t('options.autoCreateMissingCharacters')) }]}
            onChange={(value) => void updateField('character_detection', value)}
          />
          <AutoSelectControl
            label={String(t('settings.textModel'))}
            value={fieldPreference(preferences, 'text_provider')}
            options={textProviderOptions}
            onChange={(value) => void updateField('text_provider', value as AutoPreference<AiProviderId>)}
          />
          <AutoSelectControl
            label={String(t('settings.imageModel'))}
            value={fieldPreference(preferences, 'image_provider')}
            options={imageProviderOptions}
            onChange={(value) => void updateField('image_provider', value as AutoPreference<AiProviderId>)}
          />
        </SettingsGroup>

        <SettingsGroup title={String(t('settings.pageDefaults'))}>
          <AutoSelectControl
            label={String(t('settings.style'))}
            value={fieldPreference(preferences, 'style')}
            options={styleOptions}
            onChange={(value) => void updateField('style', value)}
          />
          <AutoSelectControl
            label={String(t('settings.pageLayout'))}
            value={fieldPreference(preferences, 'page_layout')}
            options={layoutSelectOptions}
            onChange={(value) => void updateField('page_layout', value)}
          />
          <AutoSelectControl
            label={String(t('settings.aspectRatio'))}
            value={fieldPreference(preferences, 'aspect_ratio')}
            options={aspectOptions}
            onChange={(value) => void updateField('aspect_ratio', value)}
          />
          <AutoSelectControl
            label={String(t('settings.color'))}
            value={fieldPreference(preferences, 'color_mode')}
            options={colorOptions}
            onChange={(value) => void updateField('color_mode', value as AutoPreference<ColorMode>)}
          />
        </SettingsGroup>

        <SettingsGroup title={String(t('settings.lettering'))}>
          <AutoSelectControl
            label={String(t('settings.font'))}
            value={fieldPreference(preferences, 'font_family')}
            options={fontFamilyOptions}
            onChange={(value) => void updateField('font_family', value)}
          />
          <AutoSelectControl
            label={String(t('settings.fontSize'))}
            value={fieldPreference(preferences, 'font_size')}
            options={fontSizeOptions}
            onChange={(value) => void updateField('font_size', value)}
          />
          <AutoSelectControl
            label={String(t('settings.bubbleShape'))}
            value={fieldPreference(preferences, 'bubble_shape')}
            options={bubbleShapeOptions}
            onChange={(value) => void updateField('bubble_shape', value)}
          />
          <BubbleTailControl
            value={fieldPreference(preferences, 'bubble_tail')}
            onChange={(value) => void updateField('bubble_tail', value)}
          />
        </SettingsGroup>
      </main>
    </div>
  )
}

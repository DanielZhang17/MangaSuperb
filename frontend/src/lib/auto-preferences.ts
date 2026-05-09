import {
  DEFAULT_ASPECT_RATIOS,
  DEFAULT_BUBBLE_SHAPES,
  DEFAULT_COLOR_MODES,
  DEFAULT_FONT_FAMILIES,
  DEFAULT_FONT_SIZES,
  DEFAULT_LAYOUT_OPTIONS,
  DEFAULT_STYLE_PRESETS,
} from '@/config/preferences'
import type { AiProviderId, AutoPreference, WorkflowPreferenceFields } from '@/service/types'

const AI_PROVIDERS: AiProviderId[] = ['gemini', 'third_party']

export function autoPreference<T>(): AutoPreference<T> {
  return { mode: 'auto' }
}

export function manualPreference<T>(value: T): AutoPreference<T> {
  return { mode: 'manual', value }
}

function validManual<T>(raw: unknown, allowed: readonly T[]): AutoPreference<T> {
  if (!raw || typeof raw !== 'object') return autoPreference<T>()

  const candidate = raw as { mode?: string; value?: unknown }
  if (candidate.mode !== 'manual') return autoPreference<T>()

  return (allowed as readonly unknown[]).includes(candidate.value)
    ? manualPreference(candidate.value as T)
    : autoPreference<T>()
}

export function normalizePreferenceFields(raw: unknown): WorkflowPreferenceFields {
  const source = raw && typeof raw === 'object'
    ? raw as Partial<Record<keyof WorkflowPreferenceFields, unknown>>
    : {}

  return {
    character_detection: validManual(source.character_detection, ['enabled'] as const),
    style: validManual(source.style, DEFAULT_STYLE_PRESETS.map((preset) => preset.value)),
    color_mode: validManual(source.color_mode, DEFAULT_COLOR_MODES),
    aspect_ratio: validManual(source.aspect_ratio, DEFAULT_ASPECT_RATIOS),
    page_layout: validManual(source.page_layout, DEFAULT_LAYOUT_OPTIONS),
    font_family: validManual(source.font_family, DEFAULT_FONT_FAMILIES),
    font_size: validManual(source.font_size, DEFAULT_FONT_SIZES),
    bubble_shape: validManual(source.bubble_shape, DEFAULT_BUBBLE_SHAPES),
    bubble_tail: validManual(source.bubble_tail, [true, false] as const),
    text_provider: validManual(source.text_provider, AI_PROVIDERS),
    image_provider: validManual(source.image_provider, AI_PROVIDERS),
  }
}

export function resolvePreferenceValue<T>(
  preference: AutoPreference<T> | undefined,
  fallback: T,
): T {
  return preference?.mode === 'manual' ? preference.value : fallback
}

export function resolveAvailablePreferenceValue<T>(
  preference: AutoPreference<T> | undefined,
  available: readonly T[],
  fallback: T,
): T {
  const preferred = resolvePreferenceValue(preference, fallback)

  return (available as readonly unknown[]).includes(preferred) ? preferred : fallback
}

import { describe, expect, it } from 'vitest'

import {
  autoPreference,
  manualPreference,
  normalizePreferenceFields,
  resolveAvailablePreferenceValue,
  resolvePreferenceValue,
} from './auto-preferences'

describe('auto preference helpers', () => {
  it('defaults missing fields to auto', () => {
    const fields = normalizePreferenceFields({})

    expect(fields.style).toEqual({ mode: 'auto' })
    expect(fields.aspect_ratio).toEqual({ mode: 'auto' })
    expect(fields.bubble_tail).toEqual({ mode: 'auto' })
  })

  it('keeps valid manual values and drops invalid values', () => {
    const fields = normalizePreferenceFields({
      page_layout: { mode: 'manual', value: 'grid-2x2' },
      color_mode: { mode: 'manual', value: 'sepia' },
      bubble_tail: { mode: 'manual', value: false },
    })

    expect(fields.page_layout).toEqual({ mode: 'manual', value: 'grid-2x2' })
    expect(fields.color_mode).toEqual({ mode: 'auto' })
    expect(fields.bubble_tail).toEqual({ mode: 'manual', value: false })
  })

  it('resolves manual values before auto fallback', () => {
    expect(resolvePreferenceValue(manualPreference('color'), 'black-white')).toBe('color')
    expect(resolvePreferenceValue(autoPreference(), 'black-white')).toBe('black-white')
  })

  it('falls back when a manual preference is no longer available', () => {
    expect(resolveAvailablePreferenceValue(
      manualPreference('gemini'),
      ['third_party'],
      'third_party',
    )).toBe('third_party')
    expect(resolveAvailablePreferenceValue(
      manualPreference('third_party'),
      ['third_party'],
      'gemini',
    )).toBe('third_party')
  })
})

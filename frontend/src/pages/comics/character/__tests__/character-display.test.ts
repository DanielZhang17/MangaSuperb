import { describe, expect, it } from 'vitest'

import { getCharacterDisplayName, getCharacterImageState } from '../character-display'

describe('character display helpers', () => {
  it('extracts a real name from generated descriptions when the stored name is generic', () => {
    const name = getCharacterDisplayName({
      id: 12,
      name: '角色-1778232423484',
      description: '日式校园漫画风格。角色名：白石遥，17岁，高中二年级女生。',
    })

    expect(name).toBe('白石遥')
  })

  it('surfaces historical image generation failures without cramming raw backend errors into the card', () => {
    const rawError = 'Failed to generate image with third_party provider: API request failed with status 503: {"error":{"message":"model overloaded with a very long upstream response"}}'
    const state = getCharacterImageState({
      image_status: 'failed',
      image_url: null,
      image_error: rawError,
    })

    expect(state.label).toBe('形象生成失败')
    expect(state.detail).toBe('服务端返回 503，可编辑后重新生成。')
    expect(state.kind).toBe('failed')
    expect(state.title).toBe(rawError)
  })
})

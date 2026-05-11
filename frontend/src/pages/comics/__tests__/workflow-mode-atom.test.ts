import { createStore } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const STORAGE_KEY = 'mangasuperb.comics.workflowMode'

describe('workflowModeAtom', () => {
  beforeEach(() => {
    vi.resetModules()
    window.localStorage.clear()
  })

  it('defaults new users to Auto mode', async () => {
    const { workflowModeAtom } = await import('../atoms')
    const store = createStore()

    expect(store.get(workflowModeAtom)).toBe('auto')
  })

  it('starts new comics without the old fixed default title', async () => {
    const { mangaTitleAtom } = await import('../atoms')
    const store = createStore()

    expect(store.get(mangaTitleAtom)).toBe('')
  })

  it('hydrates from the last browser-selected workflow mode', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'pro')

    const { workflowModeAtom } = await import('../atoms')
    const store = createStore()

    expect(store.get(workflowModeAtom)).toBe('pro')
  })

  it('persists manual mode changes for return-to-edit flows', async () => {
    const { workflowModeAtom } = await import('../atoms')
    const store = createStore()

    store.set(workflowModeAtom, 'pro')

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('pro')
    expect(store.get(workflowModeAtom)).toBe('pro')
  })
})

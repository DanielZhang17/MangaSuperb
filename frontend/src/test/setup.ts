import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, vi } from 'vitest'

import { clearActiveJobs } from '@/atoms'

const localStorageMock = (() => {
  const storage = new Map<string, string>()

  return {
    get length() {
      return storage.size
    },
    clear: vi.fn(() => storage.clear()),
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => storage.delete(key)),
    setItem: vi.fn((key: string, value: string) => storage.set(key, String(value))),
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
})

vi.stubGlobal('localStorage', localStorageMock)

class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock)

beforeEach(() => {
  clearActiveJobs()
  window.localStorage.clear()
})

afterEach(() => {
  clearActiveJobs()
  window.localStorage.clear()
})

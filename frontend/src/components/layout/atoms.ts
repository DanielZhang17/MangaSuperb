import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

// Persist sidebar collapsed state across sessions; read on init to avoid hydration flicker
export const sidebarCollapsedAtom = atomWithStorage<boolean>(
  'sidebar-collapsed',
  false,
  undefined,
  { getOnInit: true },
)

// Mobile sidebar open state (not persisted, defaults to closed)
export const sidebarOpenAtom = atom<boolean>(false)

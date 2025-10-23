import { atomWithStorage } from 'jotai/utils'

// Persist sidebar collapsed state across sessions; read on init to avoid hydration flicker
export const sidebarCollapsedAtom = atomWithStorage<boolean>(
  'sidebar-collapsed',
  false,
  undefined,
  { getOnInit: true },
)

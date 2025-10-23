import { atomWithStorage } from 'jotai/utils'

// Persist sidebar collapsed state across sessions
export const sidebarCollapsedAtom = atomWithStorage<boolean>('sidebar-collapsed', false)

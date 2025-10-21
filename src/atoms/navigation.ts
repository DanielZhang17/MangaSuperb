import { atom } from 'jotai'

export type PrimaryNavKey = 'featured' | 'sharing'
export type SidebarNavKey = 'ideas' | 'comics' | 'characters'

export const primaryNavAtom = atom<PrimaryNavKey>('featured')
export const sidebarNavAtom = atom<SidebarNavKey>('ideas')

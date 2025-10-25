import { atom } from 'jotai'

import type { IUser } from '@/service/types'

// Global user session atom
export const userAtom = atom<IUser | null>(null)

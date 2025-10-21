import { atom } from 'jotai'

export const countAtom = atom(1)

export const incAtom = atom(null, (get, set) => {
  set(countAtom, get(countAtom) + 1)
})

import { atom } from 'jotai'

export type StoryStep = 'input' | 'panels' | 'loading'

export const storyStepAtom = atom<StoryStep>('input')

export type CharacterStep = 'selection' | 'loading'
export const characterStepAtom = atom<CharacterStep>('selection')

export const mangaTitleAtom = atom('不灭战神')

export const activeTabAtom = atom('story')

import { fireEvent, render, screen } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { describe, expect, it, vi } from 'vitest'

import type { AutoCharacterPrepareResponse, ICharacter } from '@/service/types'

import {
  activeTabAtom,
  autoCharacterReviewAtom,
  autoCharacterReviewStoryAtom,
  fullStoryAtom,
  selectedCharacterIdsAtom,
  selectedCharacterRolesAtom,
  workflowModeAtom,
} from '../../atoms'
import { CharacterReview } from '../character-review'

vi.mock('../../character/character-upsert-dialog', () => ({
  CharacterUpsertDialog: ({
    mode,
    open,
    character,
    initialValues,
  }: {
    mode: 'create' | 'edit'
    open: boolean
    character?: ICharacter
    initialValues?: Partial<ICharacter>
  }) => open ? <div role="dialog">{mode} {character?.name ?? initialValues?.name}</div> : null,
}))

vi.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, options?: any) => ({
      'autoReview.title': 'Character Review',
      'autoReview.badge.created': 'Created',
      'autoReview.badge.reused': 'Reused',
      'autoReview.summary.reused': 'Reused',
      'autoReview.summary.created': 'Created',
      'autoReview.summary.conflicts': 'Conflicts',
      'autoReview.matchesExisting': `Matches existing character: ${options?.name}`,
      'autoReview.candidate': `Candidate: ${options?.description}`,
      'autoReview.visualTraits': `Visual traits: ${options?.traits}`,
      'autoReview.action.review': `Review ${options?.name}`,
      'autoReview.action.create': `Create ${options?.name}`,
      'autoReview.action.use': `Use ${options?.name}`,
      'autoReview.failedSummary': `${options?.count} character candidates failed during preparation.`,
      'autoReview.stale': 'Story changed after this review. Prepare characters again before accepting.',
      'autoReview.resolveConflicts': 'Review conflicts before accepting characters.',
      'autoReview.acceptHint': 'Accept prepared characters to use them in the Pro workflow.',
      'autoReview.accept': 'Accept characters',
    }[key] ?? key),
  }),
}))

function character(id: number, name: string): ICharacter {
  return {
    id,
    user_id: 1,
    name,
    description: `${name} description`,
    sex: 'unspecified',
    is_public: false,
    style_prompt: null,
    optimized_description: null,
    image_status: 'completed',
    image_url: null,
    image_job_id: null,
    image_error: null,
    created_at: null,
    updated_at: null,
  }
}

function renderReview(review: AutoCharacterPrepareResponse) {
  const store = createStore()
  store.set(autoCharacterReviewAtom, review)

  return {
    store,
    ...render(
      <Provider store={store}>
        <CharacterReview />
      </Provider>,
    ),
  }
}

describe('CharacterReview', () => {
  it('shows conflicts, disables acceptance, and opens the existing character edit dialog', () => {
    renderReview({
      reused: [{ character: character(1, 'Reused Hero'), role: 'supporting' }],
      created: [{ character: character(2, 'Created Hero'), role: 'protagonist' }],
      conflicts: [
        {
          candidate: {
            name: 'Hero Variant',
            aliases: ['Variant'],
            description: 'Looks similar to an existing hero.',
            sex: 'unspecified',
            visual_traits: ['silver hair'],
            role: 'protagonist',
            confidence: 0.91,
          },
          existing_character: character(3, 'Existing Hero'),
          reason: 'Similar name and visual traits',
          role: 'protagonist',
        },
      ],
      failed: [
        {
          candidate: {
            name: 'Failed Hero',
            aliases: ['Glitch'],
            description: 'A candidate that could not be created automatically.',
            sex: 'unspecified',
            visual_traits: ['blue visor'],
            role: 'supporting',
            confidence: 0.61,
          },
          error: 'Provider rejected the request.',
          role: 'supporting',
        },
      ],
      suggested_roles: { 1: 'supporting', 2: 'protagonist' },
    })

    expect(screen.getByText('Reused Hero')).toBeInTheDocument()
    expect(screen.getByText('Created Hero')).toBeInTheDocument()
    expect(screen.getByText('Hero Variant')).toBeInTheDocument()
    expect(screen.getByText(/Looks similar to an existing hero/)).toBeInTheDocument()
    expect(screen.getByText('Failed Hero')).toBeInTheDocument()
    expect(screen.getByText(/Provider rejected the request/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Accept characters' })).toBeDisabled()
    expect(screen.getByText(/Review conflicts before accepting/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Review Existing Hero' }))

    expect(screen.getByRole('dialog')).toHaveTextContent('edit Existing Hero')
  })

  it('opens the candidate create dialog when a conflict is a false positive', () => {
    renderReview({
      reused: [],
      created: [],
      conflicts: [
        {
          candidate: {
            name: 'New Hero',
            aliases: ['Rookie'],
            description: 'A genuinely new character with red armor.',
            sex: 'female',
            visual_traits: ['red armor'],
            role: 'protagonist',
            confidence: 0.87,
          },
          existing_character: character(8, 'Existing Hero'),
          reason: 'Similar name',
          role: 'protagonist',
        },
      ],
      failed: [],
      suggested_roles: {},
    })

    fireEvent.click(screen.getByRole('button', { name: 'Create New Hero' }))

    expect(screen.getByRole('dialog')).toHaveTextContent('create New Hero')
  })

  it('accepts created and reused characters into selected character atoms', () => {
    const { store } = renderReview({
      reused: [{ character: character(4, 'Mentor'), role: 'supporting' }],
      created: [{ character: character(5, 'Pilot'), role: 'protagonist' }],
      conflicts: [],
      failed: [],
      suggested_roles: { 4: 'mentor', 5: 'protagonist' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Accept characters' }))

    expect(store.get(selectedCharacterIdsAtom)).toEqual([4, 5])
    expect(store.get(selectedCharacterRolesAtom)).toEqual({
      4: 'mentor',
      5: 'protagonist',
    })
    expect(store.get(workflowModeAtom)).toBe('pro')
    expect(store.get(activeTabAtom)).toBe('characters')
  })

  it('lets a conflict be resolved by using the existing character', () => {
    const { store } = renderReview({
      reused: [],
      created: [{ character: character(6, 'Scout'), role: 'supporting' }],
      conflicts: [
        {
          candidate: {
            name: 'Hero Variant',
            aliases: [],
            description: 'Similar to the existing hero.',
            sex: 'unspecified',
            visual_traits: [],
            role: 'protagonist',
            confidence: 0.9,
          },
          existing_character: character(7, 'Existing Hero'),
          reason: 'near_name_match_needs_review',
          role: 'protagonist',
        },
      ],
      failed: [],
      suggested_roles: { 6: 'supporting' },
    })

    expect(screen.getByRole('button', { name: 'Accept characters' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Use Existing Hero' }))
    fireEvent.click(screen.getByRole('button', { name: 'Accept characters' }))

    expect(store.get(selectedCharacterIdsAtom)).toEqual([7, 6])
    expect(store.get(selectedCharacterRolesAtom)).toEqual({
      6: 'supporting',
      7: 'protagonist',
    })
  })

  it('does not accept a prepared review after the story has changed', () => {
    const store = createStore()
    store.set(fullStoryAtom, 'Updated story')
    store.set(autoCharacterReviewStoryAtom, 'Original story')
    store.set(autoCharacterReviewAtom, {
      reused: [{ character: character(10, 'Old Hero'), role: 'protagonist' }],
      created: [],
      conflicts: [],
      failed: [],
      suggested_roles: { 10: 'protagonist' },
    })

    render(
      <Provider store={store}>
        <CharacterReview />
      </Provider>,
    )

    expect(screen.getByText(/Story changed after this review/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Accept characters' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Accept characters' }))

    expect(store.get(selectedCharacterIdsAtom)).toEqual([])
  })
})

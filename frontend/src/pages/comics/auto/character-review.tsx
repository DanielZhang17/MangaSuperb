import { useAtom } from 'jotai'
import { AlertTriangle, CheckCircle2, Pencil, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAiProviders } from '@/hooks/use-ai-providers'
import type { AutoCharacterConflict, AutoCharacterPrepareResponse, AutoCharacterReviewItem, ICharacter } from '@/service/types'

import {
  activeTabAtom,
  autoCharacterReviewAtom,
  autoCharacterReviewStoryAtom,
  fullStoryAtom,
  selectedCharacterIdsAtom,
  selectedCharacterRolesAtom,
  workflowModeAtom,
} from '../atoms'
import { CharacterUpsertDialog } from '../character/character-upsert-dialog'
import { WorkflowPanel } from '../components/workflow-layout'

function CharacterRow({
  item,
  kind,
}: {
  item: AutoCharacterReviewItem
  kind: 'created' | 'reused'
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 rounded-md border border-border/60 p-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{item.character.name}</p>
          <Badge variant={kind === 'created' ? 'default' : 'secondary'}>
            {kind === 'created' ? 'Created' : 'Reused'}
          </Badge>
          <Badge variant="outline">{item.role}</Badge>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {item.character.description}
        </p>
      </div>
    </div>
  )
}

function ConflictRow({
  conflict,
  onReview,
  onUse,
  onCreate,
}: {
  conflict: AutoCharacterConflict
  onReview: (character: ICharacter) => void
  onUse: (conflict: AutoCharacterConflict) => void
  onCreate: (conflict: AutoCharacterConflict) => void
}) {
  const visualTraits = conflict.candidate.visual_traits.filter(Boolean).join(', ')

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600" />
            <p className="font-medium">{conflict.candidate.name}</p>
            <Badge variant="outline">{conflict.role}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Matches existing character: {conflict.existing_character.name}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Candidate: {conflict.candidate.description}
          </p>
          {visualTraits && (
            <p className="mt-1 text-xs text-muted-foreground">
              Visual traits: {visualTraits}
            </p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">{conflict.reason}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onReview(conflict.existing_character)}
          >
            <Pencil className="size-4" />
            Review {conflict.existing_character.name}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onCreate(conflict)}
          >
            <Plus className="size-4" />
            Create {conflict.candidate.name}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => onUse(conflict)}
          >
            Use {conflict.existing_character.name}
          </Button>
        </div>
      </div>
    </div>
  )
}

function FailedCandidateRow({
  failed,
}: {
  failed: AutoCharacterPrepareResponse['failed'][number]
}) {
  const visualTraits = failed.candidate.visual_traits.filter(Boolean).join(', ')

  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="size-4 text-destructive" />
        <p className="font-medium">{failed.candidate.name}</p>
        <Badge variant="outline">{failed.role}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Candidate: {failed.candidate.description}
      </p>
      {visualTraits && (
        <p className="mt-1 text-xs text-muted-foreground">
          Visual traits: {visualTraits}
        </p>
      )}
      <p className="mt-2 text-sm text-destructive">{failed.error}</p>
    </div>
  )
}

export function CharacterReview() {
  const [review, setReview] = useAtom(autoCharacterReviewAtom)
  const [reviewStory] = useAtom(autoCharacterReviewStoryAtom)
  const [currentStory] = useAtom(fullStoryAtom)
  const [, setSelectedIds] = useAtom(selectedCharacterIdsAtom)
  const [, setRolesMap] = useAtom(selectedCharacterRolesAtom)
  const [, setWorkflowMode] = useAtom(workflowModeAtom)
  const [, setActiveTab] = useAtom(activeTabAtom)
  const { providers } = useAiProviders()
  const [editingCharacter, setEditingCharacter] = useState<ICharacter | undefined>()
  const [creatingConflict, setCreatingConflict] = useState<AutoCharacterConflict | null>(null)

  const acceptedItems = useMemo(
    () => [...(review?.reused ?? []), ...(review?.created ?? [])],
    [review],
  )
  const hasConflicts = Boolean(review?.conflicts.length)
  const isStale = Boolean(reviewStory && reviewStory !== currentStory)
  const canAccept = Boolean(review && acceptedItems.length > 0 && !hasConflicts && !isStale)
  const candidateInitialValues = useMemo(() => {
    if (!creatingConflict) return undefined

    return {
      name: creatingConflict.candidate.name,
      description: creatingConflict.candidate.description,
      sex: creatingConflict.candidate.sex,
      style_prompt: creatingConflict.candidate.visual_traits.filter(Boolean).join(', '),
    }
  }, [creatingConflict])

  if (!review) return null

  const handleAccept = () => {
    if (!canAccept) return

    const ids = acceptedItems.map((item) => item.character.id)
    const roles = acceptedItems.reduce<Record<number, string>>((acc, item) => {
      acc[item.character.id] = review.suggested_roles[item.character.id] ?? item.role

      return acc
    }, {})

    setSelectedIds(ids)
    setRolesMap(roles)
    setWorkflowMode('pro')
    setActiveTab('characters')
  }

  const handleSaved = (character: ICharacter) => {
    if (creatingConflict) {
      const conflict = creatingConflict
      setReview((current) => {
        if (!current) return current

        return {
          ...current,
          created: [
            ...current.created,
            { character, role: conflict.role },
          ],
          conflicts: current.conflicts.filter((item) => item !== conflict),
          suggested_roles: {
            ...current.suggested_roles,
            [character.id]: conflict.role,
          },
        }
      })
      setCreatingConflict(null)

      return
    }

    setReview((current) => {
      if (!current) return current

      return {
        ...current,
        reused: current.reused.map((item) => (
          item.character.id === character.id ? { ...item, character } : item
        )),
        created: current.created.map((item) => (
          item.character.id === character.id ? { ...item, character } : item
        )),
        conflicts: current.conflicts.map((conflict) => (
          conflict.existing_character.id === character.id
            ? { ...conflict, existing_character: character }
            : conflict
        )),
      }
    })
  }

  const handleUseConflict = (conflict: AutoCharacterConflict) => {
    setReview((current) => {
      if (!current) return current

      const character = conflict.existing_character

      return {
        ...current,
        reused: [
          ...current.reused,
          { character, role: conflict.role },
        ],
        conflicts: current.conflicts.filter((item) => item !== conflict),
        suggested_roles: {
          ...current.suggested_roles,
          [character.id]: conflict.role,
        },
      }
    })
  }

  return (
    <WorkflowPanel title="Character Review">
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-2xl font-semibold">{review.reused.length}</p>
            <p className="text-sm text-muted-foreground">Reused</p>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-2xl font-semibold">{review.created.length}</p>
            <p className="text-sm text-muted-foreground">Created</p>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-2xl font-semibold">{review.conflicts.length}</p>
            <p className="text-sm text-muted-foreground">Conflicts</p>
          </div>
        </div>

        {acceptedItems.length > 0 && (
          <div className="space-y-2">
            {review.reused.map((item) => (
              <CharacterRow key={`reused-${item.character.id}`} item={item} kind="reused" />
            ))}
            {review.created.map((item) => (
              <CharacterRow key={`created-${item.character.id}`} item={item} kind="created" />
            ))}
          </div>
        )}

        {review.conflicts.length > 0 && (
          <div className="space-y-2">
            {review.conflicts.map((conflict) => (
              <ConflictRow
                key={`${conflict.existing_character.id}-${conflict.candidate.name}`}
                conflict={conflict}
                onReview={setEditingCharacter}
                onUse={handleUseConflict}
                onCreate={setCreatingConflict}
              />
            ))}
          </div>
        )}

        {review.failed.length > 0 && (
          <div className="space-y-2">
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {review.failed.length} character candidates failed during preparation.
            </div>
            {review.failed.map((failed) => (
              <FailedCandidateRow
                key={`${failed.candidate.name}-${failed.role}`}
                failed={failed}
              />
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {isStale
              ? 'Story changed after this review. Prepare characters again before accepting.'
              : hasConflicts
                ? 'Review conflicts before accepting characters.'
                : 'Accept prepared characters to use them in the Pro workflow.'}
          </div>
          <Button type="button" onClick={handleAccept} disabled={!canAccept}>
            <CheckCircle2 className="size-4" />
            Accept characters
          </Button>
        </div>
      </div>

      <CharacterUpsertDialog
        mode="edit"
        open={Boolean(editingCharacter)}
        character={editingCharacter}
        providers={providers}
        onOpenChange={(open) => !open && setEditingCharacter(undefined)}
        onSaved={handleSaved}
      />
      <CharacterUpsertDialog
        mode="create"
        open={Boolean(creatingConflict)}
        initialValues={candidateInitialValues}
        providers={providers}
        onOpenChange={(open) => !open && setCreatingConflict(null)}
        onSaved={handleSaved}
      />
    </WorkflowPanel>
  )
}

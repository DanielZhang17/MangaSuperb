import { type ReactNode, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router'

import CharactersApi from '@/apis/characters'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
} from '@/components/ui/dialog'
import { InputButton, InputButtonAction, InputButtonInput, InputButtonProvider, InputButtonSubmit, useInputButton } from '@/components/ui/shadcn-io/input-button'
import { useI18n } from '@/hooks/use-i18n'
import { proxiedStatic } from '@/lib/utils'
import type { ICharacter } from '@/service/types'

interface SuccessModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  character?: ICharacter
  jobId?: string | null
  fallbackImageUrl?: string
}

function NameSubmitButton({
  characterId,
  nameInput,
  submitting,
  setSubmitting,
  onSaved,
  children,
}: {
  characterId?: number
  nameInput: string
  submitting: boolean
  setSubmitting: (v: boolean) => void
  onSaved: (newName: string) => void
  children: ReactNode
}) {
  const { setShowInput } = useInputButton()

  return (
    <InputButtonSubmit
      disabled={!characterId || !nameInput?.trim() || submitting}
      onClick={async (e) => {
        e.preventDefault()
        if (!characterId) return
        const newName = nameInput.trim()
        if (!newName) return

        try {
          setSubmitting(true)
          const res = await CharactersApi.updateName(characterId, { name: newName })
          onSaved(res.character.name)
          setShowInput(false)
          toast.success('名称已更新')
        } catch (err: any) {
          toast.error(err?.message || '更新名称失败')
        } finally {
          setSubmitting(false)
        }
      }}
    >
      {children}
    </InputButtonSubmit>
  )
}

export function CreationSuccessModal({ open, onOpenChange, character, fallbackImageUrl }: SuccessModalProps) {
  const { t } = useI18n('createCharacter')
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [nameInput, setNameInput] = useState<string>(character?.name ?? '')
  const [currentImageUrl, setCurrentImageUrl] = useState<string | undefined>(undefined)

  // Update image URL when character changes
  useEffect(() => {
    const rawImageUrl = character?.image_url ?? fallbackImageUrl
    const imageUrl = proxiedStatic(rawImageUrl || undefined) || undefined
    setCurrentImageUrl(imageUrl)
  }, [character?.image_url, fallbackImageUrl])

  // Update name input when character name changes
  useEffect(() => {
    if (character?.name) {
      setNameInput(character.name)
    }
  }, [character?.name])

  const displayName = nameInput || character?.name

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-8 bg-card border-none max-w-md w-[500px]">
        <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <span className="sr-only">{String(t('success.close'))}</span>
        </DialogClose>
        
        {currentImageUrl && (
          <div className="mt-6">
            <img
              key={currentImageUrl}
              src={currentImageUrl}
              alt="Generated Character"
              className="w-full h-auto rounded-lg object-cover"
            />
          </div>
        )}

        {displayName && (
          <div className="mt-4 text-center">
            <h3 className="text-lg font-semibold">{displayName}</h3>
          </div>
        )}

        <div className="flex flex-col gap-4 mt-6">
          <InputButtonProvider>
            <InputButton>
              <InputButtonAction>{String(t('success.name.prompt'))}</InputButtonAction>
              <NameSubmitButton
                characterId={character?.id}
                nameInput={nameInput}
                submitting={submitting}
                setSubmitting={setSubmitting}
                onSaved={(newName) => setNameInput(newName)}
              >
                {submitting ? '保存中…' : String(t('success.name.submit'))}
              </NameSubmitButton>
            </InputButton>
            <InputButtonInput
              type="text"
              placeholder={String(t('success.name.placeholder'))}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
            />
          </InputButtonProvider>
          <Button
            variant="default"
            className="w-full"
            onClick={() => navigate('/ideas?tab=characters')}
          >
            {String(t('success.viewIdeas'))}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

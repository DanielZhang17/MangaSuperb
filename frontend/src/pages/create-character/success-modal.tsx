import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
} from '@/components/ui/dialog'
import { InputButton, InputButtonAction, InputButtonInput, InputButtonProvider, InputButtonSubmit } from '@/components/ui/shadcn-io/input-button'
import { useI18n } from '@/hooks/use-i18n'
import type { ICharacter } from '@/service/types'

interface SuccessModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  character?: ICharacter
  jobId?: string | null
  fallbackImageUrl?: string
}

export function CreationSuccessModal({ open, onOpenChange, character, jobId, fallbackImageUrl }: SuccessModalProps) {
  const { t } = useI18n('createCharacter')
  const imageUrl = character?.image_url ?? fallbackImageUrl
  const status = character?.image_status

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-8 bg-card border-none max-w-md w-[500px]">
        <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <span className="sr-only">{String(t('success.close'))}</span>
        </DialogClose>
        
        {status && (
          <div className="mt-2 text-xs text-muted-foreground">
            {String(t('success.imageStatus'))}{status}
            {jobId ? ` · ${String(t('success.jobId'))}${jobId}` : ''}
          </div>
        )}

        {imageUrl && (
          <div className="mt-6">
            <img
              src={imageUrl}
              alt="Generated Character"
              className="w-full h-auto rounded-lg object-cover"
            />
          </div>
        )}

        <div className="flex flex-col gap-4 mt-6">
          <InputButtonProvider>
            <InputButton>
              <InputButtonAction>{String(t('success.name.prompt'))}</InputButtonAction>
              <InputButtonSubmit>{String(t('success.name.submit'))}</InputButtonSubmit>
            </InputButton>
            <InputButtonInput type="text" placeholder={String(t('success.name.placeholder'))} defaultValue={character?.name} />
          </InputButtonProvider>
          <Button variant="default" className="w-full">
            {String(t('success.viewIdeas'))}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

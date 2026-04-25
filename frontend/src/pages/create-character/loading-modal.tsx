import { LoadingView } from '@/components/common/loading-view'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useI18n } from '@/hooks/use-i18n'
import type { ICharacter } from '@/service/types'

interface LoadingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone?: () => void
  character?: ICharacter
}

export function LoadingModal({ open, onOpenChange, onDone, character }: LoadingModalProps) {
  const { t } = useI18n('createCharacter')

  // Map image_status to display text
  const getStatusText = () => {
    const status = character?.image_status
    if (status === 'pending') return String(t('loading.pending'))
    if (status === 'processing') return String(t('loading.processing'))
    if (status === 'completed') return String(t('loading.completed'))
    if (status === 'failed') return String(t('loading.failed'))
    return String(t('loading.initial'))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 bg-card border-none max-w-xl w-[500px]">
        <LoadingView
          initialText={getStatusText()}
          onCompletion={() => {
            onDone?.()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

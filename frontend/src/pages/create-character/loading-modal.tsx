import { LoadingView } from '@/components/common/loading-view'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useI18n } from '@/hooks/use-i18n'

interface LoadingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone?: () => void
}

export function LoadingModal({ open, onOpenChange, onDone }: LoadingModalProps) {
  const { t } = useI18n('createCharacter')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 bg-card border-none max-w-xl w-[500px]">
        <LoadingView
          initialText={String(t('loading.initial'))}
          onCompletion={() => {
            onDone?.()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

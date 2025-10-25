import { LoadingView } from '@/components/common/loading-view'
import { Dialog, DialogContent } from '@/components/ui/dialog'

interface LoadingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone?: () => void
}

export function LoadingModal({ open, onOpenChange, onDone }: LoadingModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 bg-card border-none max-w-xl w-[500px]">
        <LoadingView
          initialText="人物生成中..."
          onCompletion={() => {
            onDone?.()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

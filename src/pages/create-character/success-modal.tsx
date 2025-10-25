import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
} from '@/components/ui/dialog'
import { InputButton, InputButtonAction, InputButtonInput, InputButtonProvider, InputButtonSubmit } from '@/components/ui/shadcn-io/input-button'
import type { ICharacter } from '@/service/types'

interface SuccessModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  character?: ICharacter
  jobId?: string | null
  fallbackImageUrl?: string
}

export function CreationSuccessModal({ open, onOpenChange, character, jobId, fallbackImageUrl }: SuccessModalProps) {
  const imageUrl = character?.image_url ?? fallbackImageUrl
  const status = character?.image_status

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-8 bg-card border-none max-w-md w-[500px]">
        <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <span className="sr-only">Close</span>
        </DialogClose>
        
        {status && (
          <div className="mt-2 text-xs text-muted-foreground">
            图片生成状态：{status}
            {jobId ? ` · 任务ID：${jobId}` : ''}
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
              <InputButtonAction>为你的角色取个名字</InputButtonAction>
              <InputButtonSubmit>提交</InputButtonSubmit>
            </InputButton>
            <InputButtonInput type="text" placeholder="取名字" defaultValue={character?.name} />
          </InputButtonProvider>
          <Button variant="default" className="w-full">
            我的创意中查看
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

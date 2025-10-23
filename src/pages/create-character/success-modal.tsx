import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogClose,
} from '@/components/ui/dialog';
import { X } from 'lucide-react';

interface SuccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generatedImageUrl: string;
}

export function CreationSuccessModal({ open, onOpenChange, generatedImageUrl }: SuccessModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-8 bg-card border-none max-w-md w-auto">
        {/* Custom close button */}
        <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="w-5 h-5" />
          <span className="sr-only">Close</span>
        </DialogClose>
        
        {/* Modal content: image */}
        <div className="mt-6">
          <img 
            src={generatedImageUrl} 
            alt="Generated Character" 
            className="w-full h-auto rounded-lg object-cover"
          />
        </div>

        {/* Modal footer: action buttons */}
        <div className="flex flex-col gap-4 mt-6">
          <Input placeholder="为你的角色取个名字..." />
          <Button variant="default" className="w-full">
            我的创意中查看
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

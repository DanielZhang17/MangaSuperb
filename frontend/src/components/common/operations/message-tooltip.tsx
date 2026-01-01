import { Megaphone } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const messages = [
  {
    id: 1,
    title: 'New feature released!',
    content: 'We have just launched a new feature that you might like.',
  },
  {
    id: 2,
    title: 'System maintenance',
    content: 'Our system will be under maintenance on Sunday.',
  },
  {
    id: 3,
    title: 'Your subscription is ending soon',
    content:
      'Please renew your subscription to continue enjoying our services.',
  },
]

export function MessageToolTip() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={'icon-lg'}
        >
          <Megaphone className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="right" className="w-80">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">消息</h4>
            <p className="text-sm text-muted-foreground">
                    您有 {messages.length} 条未读消息。
            </p>
          </div>
          <div className="grid gap-2">
            {messages.map((message) => (
              <div
                key={message.id}
                className="grid grid-cols-[25px_1fr] items-start pb-4 last:mb-0 last:pb-0"
              >
                <span className="flex h-2 w-2 translate-y-1 rounded-full bg-sky-500" />
                <div className="grid gap-1">
                  <p className="text-sm font-medium leading-none">
                    {message.title}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {message.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
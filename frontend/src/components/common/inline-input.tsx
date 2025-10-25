import { Loader2, Pencil } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface InlineInputProps {
  initialValue: string;
  onSubmit: (value: string) => void | Promise<void>;
  placeholder?: string;
  type?: React.InputHTMLAttributes<HTMLInputElement>['type'];
  renderDisplay?: (value: string) => React.ReactNode;
  submitLabel?: string;
  className?: string;
}

export function InlineInput({
  initialValue,
  onSubmit,
  placeholder,
  type = 'text',
  renderDisplay,
  submitLabel = '提交',
  className,
}: InlineInputProps) {
  const [editing, setEditing] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [local, setLocal] = React.useState(initialValue);

  React.useEffect(() => {
    if (!editing) setLocal(initialValue);
  }, [initialValue, editing]);

  const handleSubmit = React.useCallback(
    async (e?: React.FormEvent<HTMLFormElement>) => {
      if (e) e.preventDefault();
      if (pending) return;
      try {
        setPending(true);
        await Promise.resolve(onSubmit?.(local));
        setEditing(false);
      } finally {
        setPending(false);
      }
    },
    [local, onSubmit, pending],
  );

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setEditing(false);
        setLocal(initialValue);
      }
    },
    [handleSubmit, initialValue],
  );

  if (!editing) {
    return (
      <div className={[
        'inline-flex items-center gap-2 min-w-0',
        className,
      ].filter(Boolean).join(' ')}>
        <div className="min-w-0">
          {renderDisplay ? (
            renderDisplay(local)
          ) : (
            <span className="truncate text-foreground" title={local}>
              {local || '—'}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => setEditing(true)}
          aria-label="编辑"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={[
        'inline-flex items-center gap-2 min-w-0 w-full',
        className,
      ].filter(Boolean).join(' ')}
    >
      <Input
        type={type}
        placeholder={placeholder}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={pending}
        className="w-full min-w-0 max-w-52"
        autoFocus
      />
      <Button type="submit" disabled={pending} className="whitespace-nowrap">
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> 提交中
          </span>
        ) : (
          submitLabel
        )}
      </Button>
    </form>
  );
}

export default InlineInput;

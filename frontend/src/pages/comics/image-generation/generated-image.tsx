import { ImageOff, RefreshCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/hooks/use-i18n'
import { cn, proxiedStatic } from '@/lib/utils'

export interface GeneratedImageProps {
  src?: string | null
  alt: string
  className?: string
  aspectRatio?: string
  onRetry?: () => void
}

export function GeneratedImage({
  src,
  alt,
  className,
  aspectRatio = '4 / 3',
  onRetry,
}: GeneratedImageProps) {
  const { t } = useI18n('comics')
  const proxiedSrc = useMemo(() => proxiedStatic(src), [src])
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>(proxiedSrc ? 'loading' : 'failed')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    setStatus(proxiedSrc ? 'loading' : 'failed')
  }, [proxiedSrc])

  const retry = () => {
    setStatus(proxiedSrc ? 'loading' : 'failed')
    setRetryKey((key) => key + 1)
    onRetry?.()
  }

  if (!proxiedSrc || status === 'failed') {
    return (
      <div
        role="alert"
        className={cn(
          'flex w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/60 p-4 text-center text-sm text-muted-foreground',
          className,
        )}
        style={{ aspectRatio }}
      >
        <ImageOff className="h-8 w-8" />
        <div>
          <p className="font-medium text-foreground/80">
            {proxiedSrc ? String(t('generatedImage.loadFailed')) : String(t('generatedImage.empty'))}
          </p>
          <p className="mt-1 text-xs">{String(t('generatedImage.helper'))}</p>
        </div>
        {proxiedSrc && (
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            <RefreshCcw className="size-4" />
            {String(t('generatedImage.retry'))}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn('relative w-full overflow-hidden rounded-lg bg-muted', className)}
      style={{ aspectRatio }}
    >
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {String(t('generatedImage.loading'))}
        </div>
      )}
      <img
        key={`${proxiedSrc}-${retryKey}`}
        src={proxiedSrc}
        alt={alt}
        className={cn('h-full w-full object-contain transition-opacity', status === 'loaded' ? 'opacity-100' : 'opacity-0')}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('failed')}
      />
    </div>
  )
}

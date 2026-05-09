import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function ComicsWorkflowShell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto flex w-full max-w-[1536px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8', className)}>
      {children}
    </div>
  )
}

export function WorkflowHeader({
  title,
  meta,
  actions,
}: {
  title: string
  meta?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold tracking-normal text-foreground md:text-3xl">{title}</h2>
        {meta && <div className="mt-2 text-sm text-muted-foreground">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function WorkflowContent({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid w-full grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]', className)}>
      {children}
    </div>
  )
}

export function WorkflowPanel({
  children,
  className,
  title,
}: {
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <section className={cn('rounded-lg border border-border/60 bg-card p-4 shadow-sm sm:p-5', className)}>
      {title && <h3 className="mb-4 text-base font-semibold text-foreground/90">{title}</h3>}
      {children}
    </section>
  )
}

export function WorkflowActionBar({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-3', className)}>
      {children}
    </div>
  )
}

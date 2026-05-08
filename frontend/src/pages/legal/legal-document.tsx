import { ArrowLeft, CheckCircle2, ScrollText, ShieldCheck } from 'lucide-react'
import { Link, useNavigate } from 'react-router'

import I18nToggle from '@/components/common/operations/i18n'
import ModeToggle from '@/components/common/operations/mode-toggle'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/hooks/use-i18n'

type LegalVariant = 'privacy' | 'eula'

interface Section {
  title: string
  body: string[]
}

interface LegalDocumentProps {
  variant: LegalVariant
}

export function LegalDocument({ variant }: LegalDocumentProps) {
  const { t } = useI18n('legal')
  const { t: tCommon } = useI18n('common')
  const navigate = useNavigate()

  const sections = (t(`${variant}.sections`, { returnObjects: true }) as Section[]) ?? []
  const highlights = (t(`${variant}.highlights`, { returnObjects: true }) as string[]) ?? []

  const Icon = variant === 'privacy' ? ShieldCheck : ScrollText

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={String(t('action.back'))}
              onClick={() => navigate(-1)}
              className="hidden sm:inline-flex"
            >
              <ArrowLeft className="size-4" />
            </Button>
            <Link to="/" className="text-lg font-semibold tracking-tight">
              MangaSuperb
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle />
            <I18nToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-12">
        <div className="space-y-3 text-center">
          <Icon className="mx-auto size-10 text-primary" aria-hidden="true" />
          <p className="text-sm uppercase tracking-wider text-muted-foreground">
            {String(t('action.documentLabel'))}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">{String(t(`${variant}.title`))}</h1>
          <p className="text-sm text-muted-foreground">{String(t(`${variant}.updated`))}</p>
          <p className="text-base text-muted-foreground">{String(t(`${variant}.description`))}</p>
        </div>

        {highlights.length > 0 && (
          <section className="mt-8 rounded-2xl border bg-card/70 p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {String(t('highlights.title'))}
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {highlights.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-foreground/80">
                  <CheckCircle2 className="mt-0.5 size-4 text-primary" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-8 grid gap-6">
          {sections.map((section) => (
            <section key={section.title} className="rounded-2xl border bg-card/60 p-6 shadow-sm">
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
                {section.body.map((paragraph, index) => (
                  <p key={`${section.title}-${index}`}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border bg-muted/30 p-6 text-sm text-muted-foreground">
          <p className="text-base font-semibold text-foreground">{String(t(`${variant}.cta`))}</p>
          <p className="mt-2">{String(t(`${variant}.contact`))}</p>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3 text-sm">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2"
          >
            <ArrowLeft className="size-4" />
            {String(t('action.back'))}
          </Button>
          <Link to="/" className="text-primary underline-offset-4 hover:underline">
            {String(t('action.home'))}
          </Link>
          <span className="text-muted-foreground">
            {String(tCommon('cancel'))}
          </span>
        </div>
      </main>
    </div>
  )
}

export default LegalDocument

import { useAtom } from 'jotai'
import { Download, RefreshCcw } from 'lucide-react'
import { useEffect } from 'react'
import { useMemo } from 'react'
import { useState } from 'react'

import InlineInput from '@/components/common/inline-input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/hooks/use-i18n'
import type { AutoRun } from '@/service/types'

import { currentComicDetailAtom, mangaTitleAtom } from '../atoms'
import { ComicsWorkflowShell, WorkflowPanel } from '../components/workflow-layout'
import { GeneratedImage } from '../image-generation/generated-image'
import { extractComicStory } from '../lib/workflow-hydration'

function copy(value: unknown, fallback: string) {
  const text = String(value)

  return text.includes('.') ? fallback : text
}

function getRenderedPages(pages: any[]) {
  const pageByNumber = new Map<number, any>()

  for (const page of pages) {
    const pageNumber = Number(page?.page_number)
    if (!Number.isFinite(pageNumber) || pageNumber <= 0) continue
    pageByNumber.set(pageNumber, page)
  }

  return Array.from(pageByNumber.entries())
    .sort(([a], [b]) => a - b)
    .map(([pageNumber, page]) => ({ pageNumber, page }))
}

export function AutoPreview({
  autoRun,
  onRegenerateCurrentPage,
}: {
  autoRun: AutoRun | null
  onRegenerateCurrentPage: () => void
}) {
  const { t } = useI18n('comics')
  const [comicDetail, setComicDetail] = useAtom(currentComicDetailAtom)
  const [storedTitle, setStoredTitle] = useAtom(mangaTitleAtom)
  const [selectedTab, setSelectedTab] = useState('preview')
  const [selectedPageNumber, setSelectedPageNumber] = useState(1)
  const title = comicDetail?.title || storedTitle || autoRun?.title_snapshot || 'Untitled manga'
  const story = autoRun?.story_snapshot || (comicDetail ? extractComicStory(comicDetail) : '')
  const renderedPages = useMemo(() => getRenderedPages(comicDetail?.pages ?? []), [comicDetail?.pages])
  const exportUrl = comicDetail?.pdf_url || comicDetail?.zip_url || null
  const selectedPage = renderedPages.find(({ pageNumber }) => pageNumber === selectedPageNumber)
    ?? renderedPages[0]

  useEffect(() => {
    if (renderedPages.length === 0) return
    if (!renderedPages.some(({ pageNumber }) => pageNumber === selectedPageNumber)) {
      setSelectedPageNumber(renderedPages[0].pageNumber)
    }
  }, [renderedPages, selectedPageNumber])

  const handleRename = (nextTitle: string) => {
    const cleanedTitle = nextTitle.trim()
    if (!cleanedTitle) return

    setStoredTitle(cleanedTitle)
    setComicDetail((current) => current ? { ...current, title: cleanedTitle } : current)
  }

  return (
    <ComicsWorkflowShell>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
        <h2 className="text-2xl font-semibold tracking-normal md:text-3xl">
          {copy(t('autoPreview.title'), 'Generated manga preview')}
        </h2>
          <InlineInput
            initialValue={title}
            onSubmit={handleRename}
            placeholder={copy(t('editor.placeholderTitle'), 'Enter title')}
            submitLabel={copy(t('editor.save'), 'Save')}
            className="mt-1"
          />
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-2 sm:w-[260px]">
          <TabsTrigger value="preview" onClick={() => setSelectedTab('preview')}>
            {copy(t('autoPreview.previewTab'), 'Preview')}
          </TabsTrigger>
          <TabsTrigger value="story" onClick={() => setSelectedTab('story')}>
            {copy(t('autoPreview.storyTab'), 'Story')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="preview" className="mt-6">
          <div className="grid w-full gap-6 xl:grid-cols-[112px_minmax(0,1fr)_320px]">
            <aside className="flex min-w-0 flex-row items-center gap-3 overflow-x-auto xl:flex-col xl:items-stretch xl:overflow-visible">
              {renderedPages.map(({ pageNumber, page }) => {
                const label = `Page ${String(pageNumber).padStart(2, '0')}`

                return (
                  <button
                    key={pageNumber}
                    type="button"
                    aria-label={label}
                    aria-current={selectedPage?.pageNumber === pageNumber ? 'page' : undefined}
                    onClick={() => setSelectedPageNumber(pageNumber)}
                    className="relative h-24 w-24 shrink-0 rounded-lg border border-input bg-card p-2 text-left transition-all hover:border-primary xl:w-28 aria-[current=page]:border-primary aria-[current=page]:shadow-[0_0_0_3px] aria-[current=page]:shadow-primary/10"
                  >
                    <span className="absolute left-2 top-2 z-10 rounded bg-background/80 px-1 text-xs font-medium text-muted-foreground">
                      {String(pageNumber).padStart(2, '0')}
                    </span>
                    {page?.image_url ? (
                      <GeneratedImage
                        src={page.image_url}
                        alt={`${label} thumbnail`}
                        aspectRatio="3 / 4"
                        className="h-full rounded-md border-0 p-0"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                        {label}
                      </div>
                    )}
                  </button>
                )
              })}
            </aside>

            <section className="flex min-h-[520px] min-w-0 flex-col rounded-lg border border-border/60 bg-card p-4 shadow-sm sm:p-5">
              {selectedPage?.page?.image_url ? (
                <div className="flex flex-1 items-center justify-center overflow-hidden rounded-lg border border-dashed border-muted-foreground/30 bg-muted/70 p-3">
                  <GeneratedImage
                    src={selectedPage.page.image_url}
                    alt={`${title} page ${selectedPage.pageNumber}`}
                    aspectRatio="3 / 4"
                    className="max-h-full max-w-full border-0 bg-transparent"
                  />
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/70">
                  <p className="text-sm text-muted-foreground">
                    {copy(t('autoPreview.noPages'), 'Generated pages will appear here.')}
                  </p>
                </div>
              )}
            </section>

            <WorkflowPanel title={copy(t('autoPreview.actions'), 'Actions')} className="h-fit">
              <div className="flex flex-col gap-2">
                <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
                  <p className="font-medium text-foreground">
                    {copy(t('autoPreview.currentPage', { page: selectedPage?.pageNumber ?? '' }), `Page ${selectedPage?.pageNumber ?? ''}`)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {copy(t('autoPreview.pageCount', { count: renderedPages.length }), `${renderedPages.length} pages`)}
                  </p>
                </div>
                {exportUrl ? (
                  <Button asChild>
                    <a href={exportUrl}>
                      <Download className="size-4" />
                      {copy(t('autoPreview.exportPdf'), 'Export PDF')}
                    </a>
                  </Button>
                ) : (
                  <Button type="button" disabled>
                    <Download className="size-4" />
                    {copy(t('autoPreview.exportPdf'), 'Export PDF')}
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={onRegenerateCurrentPage}>
                  <RefreshCcw className="size-4" />
                  {copy(t('autoPreview.regeneratePage'), 'Regenerate current page')}
                </Button>
              </div>
            </WorkflowPanel>
          </div>
        </TabsContent>
        <TabsContent value="story" className="mt-6">
          <WorkflowPanel>
            <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">{story}</p>
          </WorkflowPanel>
        </TabsContent>
      </Tabs>
    </ComicsWorkflowShell>
  )
}

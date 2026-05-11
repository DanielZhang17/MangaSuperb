import { useAtom } from 'jotai'
import { Download, RefreshCcw } from 'lucide-react'
import { useMemo } from 'react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/hooks/use-i18n'
import type { AutoRun } from '@/service/types'

import { currentComicDetailAtom } from '../atoms'
import { ComicsWorkflowShell, WorkflowContent, WorkflowPanel } from '../components/workflow-layout'
import { GeneratedImage } from '../image-generation/generated-image'

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
  const [comicDetail] = useAtom(currentComicDetailAtom)
  const [selectedTab, setSelectedTab] = useState('preview')
  const title = autoRun?.title_snapshot || comicDetail?.title || 'Untitled manga'
  const story = autoRun?.story_snapshot || ''
  const renderedPages = useMemo(() => getRenderedPages(comicDetail?.pages ?? []), [comicDetail?.pages])
  const exportUrl = comicDetail?.pdf_url || comicDetail?.zip_url || null

  return (
    <ComicsWorkflowShell>
      <div>
        <h2 className="text-2xl font-semibold tracking-normal md:text-3xl">
          {copy(t('autoPreview.title'), 'Generated manga preview')}
        </h2>
        <p className="mt-1 text-sm font-medium text-foreground/80">{title}</p>
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
          <WorkflowContent>
            <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {renderedPages.length > 0 ? (
                renderedPages.map(({ pageNumber, page }) => (
                  <figure key={pageNumber} className="overflow-hidden rounded-md border border-border/60 bg-card">
                    {page?.image_url ? (
                      <GeneratedImage
                        src={page.image_url}
                        alt={`${title} page ${pageNumber}`}
                        aspectRatio="3 / 4"
                        className="rounded-none border-0"
                      />
                    ) : (
                      <div className="flex aspect-[3/4] items-center justify-center bg-muted text-sm text-muted-foreground">
                        {copy(t('autoPreview.noPages'), 'Generated pages will appear here.')}
                      </div>
                    )}
                    <figcaption className="border-t border-border/60 px-3 py-2 text-sm text-muted-foreground">
                      Page {pageNumber}
                    </figcaption>
                  </figure>
                ))
              ) : (
                <WorkflowPanel>
                  <p className="text-sm text-muted-foreground">
                    {copy(t('autoPreview.noPages'), 'Generated pages will appear here.')}
                  </p>
                </WorkflowPanel>
              )}
            </div>
            <WorkflowPanel title={copy(t('autoPreview.actions'), 'Actions')} className="h-fit">
              <div className="flex flex-col gap-2">
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
          </WorkflowContent>
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

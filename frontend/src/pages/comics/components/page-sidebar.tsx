import { useAtom, useAtomValue } from 'jotai'
import { Plus, X } from 'lucide-react'
import { useMemo } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { currentComicDetailAtom, customPagesAtom, selectedPageAtom } from '../atoms'

interface PageSidebarProps {
  className?: string
  showAddButton?: boolean
}

function extractExistingPages(detail: any | null): number[] {
  if (!detail) return []
  const pages = new Set<number>()
  const layouts = Array.isArray(detail.page_layouts) ? detail.page_layouts : []
  const shots = Array.isArray(detail.panel_shots) ? detail.panel_shots : []

  layouts.forEach((layout: any) => {
    const page = Number(layout?.page_number)
    if (Number.isFinite(page) && page > 0) pages.add(page)
  })

  shots.forEach((shot: any) => {
    const page = Number(shot?.page_number)
    if (Number.isFinite(page) && page > 0) pages.add(page)
  })

  return Array.from(pages).sort((a, b) => a - b)
}

export function PageSidebar({ className, showAddButton = true }: PageSidebarProps) {
  const [selectedPage, setSelectedPage] = useAtom(selectedPageAtom)
  const comicDetail = useAtomValue(currentComicDetailAtom)
  const [customPages, setCustomPages] = useAtom(customPagesAtom)

  const { pages, placeholders } = useMemo(() => {
    const existingPages = extractExistingPages(comicDetail)
    const existingSet = new Set(existingPages)
    const customUnique = Array.from(
      new Set(
        (customPages || []).filter((page) => Number.isFinite(page) && page > 0 && !existingSet.has(page)),
      ),
    ).sort((a, b) => a - b)

    const combined = [...existingPages, ...customUnique]

    // If no pages exist at all, initialize with page 1
    if (combined.length === 0) {
      combined.push(1)
      customUnique.push(1)
      // Ensure page 1 is added to the atom so it persists
      setCustomPages([1])
    }

    return {
      pages: combined,
      placeholders: new Set(customUnique),
    }
  }, [comicDetail, customPages, setCustomPages])

  const handleAddPage = () => {
    const maxExisting = pages.length ? Math.max(...pages) : 0
    const next = maxExisting + 1
    setCustomPages((prev) => Array.from(new Set([...(prev ?? []), next])))
    setSelectedPage(next)
  }

  const handleDeletePage = (page: number, isPlaceholder: boolean) => {
    if (!isPlaceholder) return // Only delete placeholder pages

    setCustomPages((prev) => (prev ?? []).filter((p) => p !== page))

    // If deleting the selected page, select another one
    if (page === selectedPage) {
      const remainingPages = pages.filter((p) => p !== page)
      if (remainingPages.length > 0) {
        setSelectedPage(remainingPages[0])
      }
    }
  }

  return (
    <aside className={cn('flex flex-col lg:flex-col gap-4 lg:w-44 lg:self-start w-full', className)}>
      {/* Mobile: flex-wrap downward, Desktop: vertical sidebar */}
      <div className="flex lg:flex-col gap-2 rounded-xl border bg-muted/40 p-3 lg:p-3">
        <p className="hidden lg:block text-xs font-medium text-muted-foreground mb-2">页面</p>
        <div className="flex flex-wrap lg:flex-nowrap lg:flex-col gap-2 lg:gap-1 lg:overflow-x-hidden lg:overflow-y-auto lg:max-h-[420px] lg:pr-1 scrollbar-themed">
          {pages.map((page) => {
            const isActive = page === selectedPage
            const isPlaceholder = placeholders.has(page)

            return (
              <div
                key={page}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  'hover:bg-background cursor-pointer',
                  isActive ? 'bg-background font-semibold shadow-sm' : 'bg-transparent',
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedPage(page)}
                  className="flex-1 text-left"
                >
                  第{String(page).padStart(2, '0')}页{isPlaceholder ? '（新建）' : ''}
                </button>
                {isPlaceholder && (
                  <button
                    type="button"
                    onClick={() => handleDeletePage(page, isPlaceholder)}
                    className="ml-2 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                    aria-label="删除页面"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {showAddButton && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex items-center gap-2 lg:w-full w-auto self-start"
          onClick={handleAddPage}
        >
          <Plus className="h-4 w-4" />
          添加页面
        </Button>
      )}
    </aside>
  )
}

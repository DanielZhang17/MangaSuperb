import i18next from 'i18next'
import { Languages } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const OPTIONS = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en', label: 'English' },
]

export default function I18nToggle() {
  const initial = (i18next.language || localStorage.getItem('i18nextLng') || 'zh-CN') as string
  const [open, setOpen] = useState(false)
  const [locale, setLocale] = useState(initial)

  const short = useMemo(() => {
    switch (locale) {
      case 'zh-CN':
        return '中'
      case 'zh-TW':
        return '繁'
      default:
        return 'EN'
    }
  }, [locale])

  useEffect(() => {
    // 同步到 <html lang>
    document.documentElement.lang = locale
  }, [locale])

  const changeLang = async (lng: string) => {
    try {
      await i18next.changeLanguage(lng)
    } catch {
      // 忽略未初始化时的错误，仍然写入本地以便后续生效
    }

    localStorage.setItem('i18nextLng', lng)
    setLocale(lng)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-lg"
          onClick={() => setOpen((v) => !v)}
          aria-label="Language selector"
          className="relative"
        >
          <Languages className="size-5" />
          <span className="pointer-events-none absolute -right-1 -top-1 rounded bg-secondary px-1 text-[10px] leading-none text-secondary-foreground">
            {short}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent side="right" className="w-44 p-1">
        <ul className="flex flex-col">
          {OPTIONS.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                onClick={() => changeLang(opt.value)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent',
                  locale === opt.value && 'bg-accent',
                )}
              >
                <span>{opt.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

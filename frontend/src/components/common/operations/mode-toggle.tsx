import { useCallback, useEffect, useState } from 'react'

import { useTheme } from '@/components/providers/theme-provider'
import { ThemeToggleButton, useThemeTransition } from '@/components/ui/shadcn-io/theme-toggle-button'

const ModeToggle = () => {
  const { theme, toggleTheme } = useTheme()
  const { startTransition } = useThemeTransition()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleThemeToggle = useCallback(() => {
    startTransition(() => {
      toggleTheme()
    })
  }, [startTransition, toggleTheme])

  if (!mounted) {
    return null
  }

  return (
    <ThemeToggleButton
      theme={theme}
      onClick={handleThemeToggle}
      variant="circle"
      start="top-right"
      className="size-10"
    />
  )
}

export default ModeToggle
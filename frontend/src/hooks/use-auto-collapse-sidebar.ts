import { useAtom } from 'jotai'
import { useEffect, useRef } from 'react'

import { sidebarCollapsedAtom } from '@/components/layout/atoms'

/**
 * Auto-collapse the sidebar when viewport is below the given breakpoint.
 * - When width < breakpoint: force collapsed = true
 * - When width ≥ breakpoint: keep the current (user/persisted) state, do not auto-expand
 *
 * Default breakpoint = 1024 (lg)
 */
export function useAutoCollapseSidebar(breakpointPx = 1024) {
  const [, setCollapsed] = useAtom(sidebarCollapsedAtom)
  // Avoid setting state redundantly on first render
  const initializedRef = useRef(false)

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx}px)`) as MediaQueryList

    const apply = (mq: MediaQueryList | MediaQueryListEvent) => {
      if (mq.matches) {
        // Below breakpoint: force collapse
        setCollapsed(true)
      } else {
        // Above breakpoint: keep user's persisted choice; no-op
        if (!initializedRef.current) {
          // Ensure we don't double-run on mount
          initializedRef.current = true
        }
      }
    }

    // Initial check
    apply(mql)

    // Subscribe to changes
    const handler = (e: MediaQueryListEvent) => apply(e)
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler)
    } else if (typeof (mql as any).addListener === 'function') {
      ;(mql as any).addListener(handler)
    }

    return () => {
      if (typeof mql.removeEventListener === 'function') {
        mql.removeEventListener('change', handler)
      } else if (typeof (mql as any).removeListener === 'function') {
        ;(mql as any).removeListener(handler)
      }
    }
  }, [breakpointPx, setCollapsed])
}

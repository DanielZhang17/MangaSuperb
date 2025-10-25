import { useEffect, useState } from 'react'

import i18next from '@/i18n'

// Minimal hook to rerender on language change and expose t()
export function useI18n(ns?: string | string[]) {
  const [lng, setLng] = useState(i18next.language)

  useEffect(() => {
    const handler = (l: string) => setLng(l)
    i18next.on('languageChanged', handler)

    return () => { i18next.off('languageChanged', handler) }
  }, [])

  const t = (key: string, options?: any) => i18next.t(key, { ns, ...options })

  return { t, i18n: i18next, lang: lng }
}

export default useI18n

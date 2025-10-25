import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router'

import AuthApi from '@/apis/auth'
import { useI18n } from '@/hooks/use-i18n'

export function RequireAuth({ children }: { children: React.ReactElement }) {
  const { t } = useI18n('common')
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    let mounted = true
    AuthApi.me()
      .then((res) => {
        if (!mounted) return
        setIsAuthed(!!res.user)
      })
      .catch(() => {
        if (!mounted) return
        setIsAuthed(false)
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  if (loading) {
    return (
      <div className="w-full h-[60vh] flex items-center justify-center text-muted-foreground">{String(t('loading'))}</div>
    )
  }

  if (!isAuthed) {
    // Preserve where the user wanted to go
    return <Navigate to="/auth" replace state={{ from: location }} />
  }

  return children
}

export default RequireAuth

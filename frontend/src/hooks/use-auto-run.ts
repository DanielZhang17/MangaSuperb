import { useAtomValue, useSetAtom } from 'jotai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { AutoApi } from '@/apis/auto'
import { currentComicDetailAtom, currentComicIdAtom } from '@/pages/comics/atoms'
import type { AutoRun, AutoRunResponse, ResolveAutoRunRequest, StartAutoRunRequest } from '@/service/types'

const POLL_MS = 2000
const ACTIVE_AUTO_RUN_STATUSES = new Set<AutoRun['status']>(['queued', 'running', 'needs_review'])

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message

  return fallback
}

function isActiveAutoRun(autoRun: AutoRun | null): boolean {
  return Boolean(autoRun && ACTIVE_AUTO_RUN_STATUSES.has(autoRun.status))
}

export function useAutoRun() {
  const comicId = useAtomValue(currentComicIdAtom)
  const setComicId = useSetAtom(currentComicIdAtom)
  const setComicDetail = useSetAtom(currentComicDetailAtom)
  const [autoRun, setAutoRun] = useState<AutoRun | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoRunRef = useRef<AutoRun | null>(null)
  const comicIdRef = useRef<number | null>(comicId)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    autoRunRef.current = autoRun
  }, [autoRun])

  useEffect(() => {
    comicIdRef.current = comicId
  }, [comicId])

  const clearPollingTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const applyRunResponse = useCallback((response: AutoRunResponse) => {
    setAutoRun(response.auto_run)
    if (response.comic?.id) {
      setComicId(response.comic.id)
      setComicDetail(response.comic)
    }

    return response.auto_run
  }, [setComicDetail, setComicId])

  const loadRunForComic = useCallback(async (targetComicId: number | null) => {
    const activeResponse = await AutoApi.getActiveRun(targetComicId)
    if (activeResponse.auto_run || !targetComicId) {
      return activeResponse
    }

    return AutoApi.getLatestRun(targetComicId)
  }, [])

  const refresh = useCallback(async (runId?: number) => {
    setIsLoading(true)
    setError(null)

    const activeRunId = runId ?? autoRunRef.current?.id

    try {
      if (activeRunId) {
        const response = await AutoApi.getRun(activeRunId)

        return applyRunResponse(response)
      }

      const response = await loadRunForComic(comicIdRef.current)

      return applyRunResponse(response)
    } catch (caught) {
      setError(getErrorMessage(caught, 'Failed to refresh Auto run'))
      throw caught
    } finally {
      setIsLoading(false)
    }
  }, [applyRunResponse, loadRunForComic])

  useEffect(() => {
    clearPollingTimer()

    let cancelled = false

    const hydrate = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await loadRunForComic(comicId)
        if (cancelled) return
        applyRunResponse(response)
      } catch (caught) {
        if (cancelled) return
        setError(getErrorMessage(caught, 'Failed to load Auto run'))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void hydrate()

    return () => {
      cancelled = true
      clearPollingTimer()
    }
  }, [applyRunResponse, clearPollingTimer, comicId, loadRunForComic])

  useEffect(() => {
    clearPollingTimer()

    if (!isActiveAutoRun(autoRun)) return undefined

    let cancelled = false

    const tick = async () => {
      try {
        const response = await AutoApi.getRun(autoRun.id)
        if (cancelled) return
        setError(null)
        applyRunResponse(response)

        if (isActiveAutoRun(response.auto_run)) {
          timerRef.current = window.setTimeout(tick, POLL_MS)
        }
      } catch (caught) {
        if (cancelled) return
        setError(getErrorMessage(caught, 'Failed to refresh Auto run'))
        timerRef.current = window.setTimeout(tick, POLL_MS)
      }
    }

    timerRef.current = window.setTimeout(tick, POLL_MS)

    return () => {
      cancelled = true
      clearPollingTimer()
    }
  }, [applyRunResponse, autoRun, clearPollingTimer])

  useEffect(() => () => {
    clearPollingTimer()
  }, [clearPollingTimer])

  const startRun = useCallback(async (body: StartAutoRunRequest) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await AutoApi.startRun(body)
      applyRunResponse(response)

      return response
    } catch (caught) {
      setError(getErrorMessage(caught, 'Failed to start Auto run'))
      throw caught
    } finally {
      setIsLoading(false)
    }
  }, [applyRunResponse])

  const abortRun = useCallback(async () => {
    const currentRun = autoRunRef.current
    if (!currentRun) return null

    setIsLoading(true)
    setError(null)

    try {
      await AutoApi.abortRun(currentRun.id)

      return await refresh(currentRun.id)
    } catch (caught) {
      setError(getErrorMessage(caught, 'Failed to abort Auto run'))
      throw caught
    } finally {
      setIsLoading(false)
    }
  }, [refresh])

  const retryRun = useCallback(async () => {
    const currentRun = autoRunRef.current
    if (!currentRun) return null

    setIsLoading(true)
    setError(null)

    try {
      const response = await AutoApi.retryRun(currentRun.id)

      return applyRunResponse(response)
    } catch (caught) {
      setError(getErrorMessage(caught, 'Failed to retry Auto run'))
      throw caught
    } finally {
      setIsLoading(false)
    }
  }, [applyRunResponse])

  const resolveRun = useCallback(async (body: ResolveAutoRunRequest) => {
    const currentRun = autoRunRef.current
    if (!currentRun) return null

    setIsLoading(true)
    setError(null)

    try {
      const response = await AutoApi.resolveRun(currentRun.id, body)

      return applyRunResponse(response)
    } catch (caught) {
      setError(getErrorMessage(caught, 'Failed to resolve Auto run'))
      throw caught
    } finally {
      setIsLoading(false)
    }
  }, [applyRunResponse])

  const derivedState = useMemo(() => ({
    isActive: isActiveAutoRun(autoRun),
    needsReview: autoRun?.status === 'needs_review',
    isComplete: autoRun?.status === 'completed',
    hasFailed: autoRun?.status === 'failed',
    isAborted: autoRun?.status === 'aborted',
  }), [autoRun])

  return {
    autoRun,
    isLoading,
    error,
    startRun,
    abortRun,
    retryRun,
    resolveRun,
    refresh,
    ...derivedState,
  }
}

export default useAutoRun

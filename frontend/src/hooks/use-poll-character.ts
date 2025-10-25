import { useCallback, useEffect, useRef, useState } from 'react'

import CharactersApi from '@/apis/characters'
import type { GetCharacterResponse, ICharacter } from '@/service/types'

export interface UsePollCharacterOptions {
  intervalMs?: number
  maxAttempts?: number
  terminalStatuses?: string[]
  onUpdate?: (character: ICharacter) => void
  onComplete?: (character: ICharacter) => void
  onTimeout?: () => void
}

/**
 * Poll a character by id until it reaches one of the terminal statuses.
 * Returns control functions to start/stop polling and the latest character.
 */
export default function usePollCharacter(options?: UsePollCharacterOptions) {
  const intervalMs = options?.intervalMs ?? 2000
  const maxAttempts = options?.maxAttempts ?? 30
  // If a caller provides explicit terminalStatuses use them to decide when to stop polling.
  // Otherwise we default to only stopping on 'completed' or 'failed' because some
  // intermediate states like 'finished' may not carry the final image_url yet.
  const terminalStatusesOpt = options?.terminalStatuses

  const [character, setCharacter] = useState<ICharacter | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const attemptsRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const activeRef = useRef(false)
  const currentIdRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stopPolling = useCallback(() => {
    activeRef.current = false
    clearTimer()
    attemptsRef.current = 0
    currentIdRef.current = null
    setLoading(false)
  }, [clearTimer])

  const pollOnce = useCallback(async (id: number) => {
    try {
      const latestResp: GetCharacterResponse = await CharactersApi.get(id)
      const latest = latestResp?.character as ICharacter
      setCharacter(latest)
      options?.onUpdate?.(latest)

      if (latest?.image_status) {
        // If user provided custom terminalStatuses, respect them for stopping.
        if (terminalStatusesOpt && terminalStatusesOpt.includes(latest.image_status)) {
          if (latest.image_status === 'completed') {
            options?.onComplete?.(latest)
          } else if (latest.image_status === 'failed') {
            options?.onTimeout?.()
          }

          stopPolling()

          return
        }

        // Default behavior: only stop when completed (success) or failed (terminal failure).
        if (latest.image_status === 'completed') {
          options?.onComplete?.(latest)
          stopPolling()

          return
        }

        if (latest.image_status === 'failed') {
          options?.onTimeout?.()
          stopPolling()

          return
        }
      }
    } catch (e: any) {
      setError(e)
      // swallow error and let attempts handle retry
    }

    // schedule next
    if (activeRef.current) {
      attemptsRef.current += 1
      if (attemptsRef.current >= maxAttempts) {
        // timeout
        options?.onTimeout?.()

        stopPolling()

        return
      }

      timerRef.current = window.setTimeout(() => {
        if (currentIdRef.current) pollOnce(currentIdRef.current)
      }, intervalMs)
    }
  }, [intervalMs, maxAttempts, options, stopPolling, terminalStatusesOpt])

  const startPolling = useCallback((id: number) => {
    // reset state
    stopPolling()
    activeRef.current = true
    attemptsRef.current = 0
    currentIdRef.current = id
    setLoading(true)
    setError(null)

    // first immediate poll
    void pollOnce(id)
  }, [pollOnce, stopPolling])

  useEffect(() => {
    return () => {
      clearTimer()
      activeRef.current = false
    }
  }, [clearTimer])

  return {
    character,
    loading,
    error,
    startPolling,
    stopPolling,
  }
}

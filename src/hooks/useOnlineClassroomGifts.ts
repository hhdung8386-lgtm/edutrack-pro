import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ONLINE_CLASSROOM_GIFT_EFFECT_MS,
  ONLINE_CLASSROOM_GIFT_FALLBACK_REFRESH_MS,
  createOnlineClassroomGiftClientRequestId,
  getOnlineClassroomGiftEvents,
  onlineClassroomGiftErrorMessage,
  onlineClassroomGiftSignal,
  parseOnlineClassroomGiftSignal,
  sendOnlineClassroomGift,
  type OnlineClassroomGiftEvent,
  type OnlineClassroomGiftType,
} from '@/lib/onlineClassroomGifts'
import type { OnlineClassroomRole } from '@/lib/onlineClassroom'

type UseOnlineClassroomGiftsOptions = {
  bookingId: string
  role: OnlineClassroomRole
  token?: string
  enabled?: boolean
  fallbackRefreshMs?: number
  broadcastSignal?: (message: string) => boolean | Promise<boolean>
}

type UseOnlineClassroomGiftsResult = {
  activeGift: OnlineClassroomGiftEvent | null
  pendingGiftCount: number
  canSendGift: boolean
  sendingGiftType: OnlineClassroomGiftType | null
  loadingGifts: boolean
  sendError: string
  syncWarning: string
  sendGift: (giftType: OnlineClassroomGiftType) => Promise<void>
  refreshGifts: () => Promise<void>
  handleRealtimeMessage: (message: string) => boolean
  dismissActiveGift: () => void
  clearSendError: () => void
}

function shouldRetryGiftSend(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error || '')
  return /unavailable|deadline-exceeded|network|fetch|internal/i.test(raw)
}

export function useOnlineClassroomGifts({
  bookingId,
  role,
  token,
  enabled = true,
  fallbackRefreshMs = ONLINE_CLASSROOM_GIFT_FALLBACK_REFRESH_MS,
  broadcastSignal,
}: UseOnlineClassroomGiftsOptions): UseOnlineClassroomGiftsResult {
  const [queue, setQueue] = useState<OnlineClassroomGiftEvent[]>([])
  const [sendingGiftType, setSendingGiftType] = useState<OnlineClassroomGiftType | null>(null)
  const [loadingGifts, setLoadingGifts] = useState(false)
  const [sendError, setSendError] = useState('')
  const [syncWarning, setSyncWarning] = useState('')
  const mountedRef = useRef(true)
  const sendingRef = useRef(false)
  const seenEventIdsRef = useRef(new Set<string>())
  const refreshInFlightRef = useRef<{
    bookingId: string
    token?: string
    request: Promise<void>
  } | null>(null)
  const broadcastSignalRef = useRef(broadcastSignal)
  const currentScopeRef = useRef({ bookingId, token })

  useEffect(() => {
    currentScopeRef.current = { bookingId, token }
  }, [bookingId, token])

  useEffect(() => {
    broadcastSignalRef.current = broadcastSignal
  }, [broadcastSignal])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const ingestEvents = useCallback((events: OnlineClassroomGiftEvent[]) => {
    if (events.length === 0) return
    const freshEvents: OnlineClassroomGiftEvent[] = []
    for (const event of events) {
      if (seenEventIdsRef.current.has(event.id)) continue
      seenEventIdsRef.current.add(event.id)
      freshEvents.push(event)
    }
    while (seenEventIdsRef.current.size > 200) {
      const oldest = seenEventIdsRef.current.values().next().value
      if (typeof oldest !== 'string') break
      seenEventIdsRef.current.delete(oldest)
    }
    if (freshEvents.length > 0) {
      setQueue((current) => [...current, ...freshEvents].slice(0, 6))
    }
  }, [])

  const fetchGifts = useCallback(async (eventId?: string) => {
    if (!enabled || !bookingId) return
    const inFlight = refreshInFlightRef.current
    if (inFlight) {
      await inFlight.request
      const sameScope = inFlight.bookingId === bookingId && inFlight.token === token
      if (sameScope && (!eventId || seenEventIdsRef.current.has(eventId))) return
    }
    const request = (async () => {
      try {
        const response = await getOnlineClassroomGiftEvents(bookingId, token, eventId)
        if (!mountedRef.current
          || currentScopeRef.current.bookingId !== bookingId
          || currentScopeRef.current.token !== token) return
        ingestEvents(response.events)
        setSyncWarning('')
      } catch (error) {
        if (!mountedRef.current) return
        setSyncWarning(onlineClassroomGiftErrorMessage(error))
      }
    })()
    refreshInFlightRef.current = { bookingId, token, request }
    try {
      await request
    } finally {
      if (refreshInFlightRef.current?.request === request) refreshInFlightRef.current = null
    }
  }, [bookingId, enabled, ingestEvents, token])

  const refreshGifts = useCallback(async () => {
    setLoadingGifts(true)
    try {
      await fetchGifts()
    } finally {
      if (mountedRef.current) setLoadingGifts(false)
    }
  }, [fetchGifts])

  useEffect(() => {
    seenEventIdsRef.current.clear()
    if (!enabled || !bookingId) return
    const initialRefresh = window.setTimeout(() => {
      setQueue([])
      setSyncWarning('')
      void refreshGifts()
    }, 0)

    const safeRefreshMs = Math.max(15_000, Math.min(60_000, fallbackRefreshMs))
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void fetchGifts()
    }, safeRefreshMs)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void fetchGifts()
    }
    window.addEventListener('focus', onVisibilityChange)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearTimeout(initialRefresh)
      window.clearInterval(interval)
      window.removeEventListener('focus', onVisibilityChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [bookingId, enabled, fallbackRefreshMs, fetchGifts, refreshGifts])

  const activeGiftId = queue[0]?.id || ''
  useEffect(() => {
    if (!activeGiftId) return
    const timer = window.setTimeout(() => {
      setQueue((current) => current[0]?.id === activeGiftId ? current.slice(1) : current)
    }, ONLINE_CLASSROOM_GIFT_EFFECT_MS)
    return () => window.clearTimeout(timer)
  }, [activeGiftId])

  const sendGift = useCallback(async (giftType: OnlineClassroomGiftType) => {
    if (!enabled || !bookingId || (role !== 'teacher' && role !== 'admin') || sendingRef.current) return
    const clientRequestId = createOnlineClassroomGiftClientRequestId()
    const sendBookingId = bookingId
    sendingRef.current = true
    setSendingGiftType(giftType)
    setSendError('')
    try {
      let response
      try {
        response = await sendOnlineClassroomGift(bookingId, giftType, clientRequestId)
      } catch (firstError) {
        if (!shouldRetryGiftSend(firstError)) throw firstError
        // The same request id makes a retry safe if the first response was lost
        // after the backend had already persisted the event.
        response = await sendOnlineClassroomGift(bookingId, giftType, clientRequestId)
      }
      if (!mountedRef.current || currentScopeRef.current.bookingId !== sendBookingId) return
      ingestEvents([response.event])
      const signalSender = broadcastSignalRef.current
      if (signalSender) {
        try {
          await signalSender(onlineClassroomGiftSignal(response.event.id))
        } catch {
          // The persisted event remains authoritative. The receiver's bounded
          // fallback refresh will discover it if the Jitsi signal is unavailable.
        }
      }
    } catch (error) {
      if (mountedRef.current && currentScopeRef.current.bookingId === sendBookingId) {
        setSendError(onlineClassroomGiftErrorMessage(error))
      }
    } finally {
      sendingRef.current = false
      if (mountedRef.current) setSendingGiftType(null)
    }
  }, [bookingId, enabled, ingestEvents, role])

  const handleRealtimeMessage = useCallback((message: string): boolean => {
    const eventId = parseOnlineClassroomGiftSignal(message)
    if (!eventId) return false
    if (!seenEventIdsRef.current.has(eventId)) void fetchGifts(eventId)
    return true
  }, [fetchGifts])

  const dismissActiveGift = useCallback(() => {
    setQueue((current) => current.slice(1))
  }, [])

  return {
    activeGift: queue[0] || null,
    pendingGiftCount: Math.max(0, queue.length - 1),
    canSendGift: enabled && (role === 'teacher' || role === 'admin'),
    sendingGiftType,
    loadingGifts,
    sendError,
    syncWarning,
    sendGift,
    refreshGifts,
    handleRealtimeMessage,
    dismissActiveGift,
    clearSendError: () => setSendError(''),
  }
}

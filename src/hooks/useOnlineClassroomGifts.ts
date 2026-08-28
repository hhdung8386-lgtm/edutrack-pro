import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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

type GiftRouteScope = Readonly<{
  bookingId: string
  token?: string
  routeEpoch: object
}>

type GiftRefreshPipeline = {
  scope: GiftRouteScope
  queued: boolean
  request: Promise<void>
}

type GiftQueueState = {
  scope: GiftRouteScope
  events: OnlineClassroomGiftEvent[]
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
  const routeScope = useMemo<GiftRouteScope>(() => ({
    bookingId,
    token,
    routeEpoch: {},
  }), [bookingId, token])
  const [queueState, setQueueState] = useState<GiftQueueState>(() => ({
    scope: routeScope,
    events: [],
  }))
  const [sendingGiftType, setSendingGiftType] = useState<OnlineClassroomGiftType | null>(null)
  const [loadingGifts, setLoadingGifts] = useState(false)
  const [sendError, setSendError] = useState('')
  const [syncWarning, setSyncWarning] = useState('')
  const mountedRef = useRef(true)
  const sendingRef = useRef<GiftRouteScope | null>(null)
  const seenEventIdsRef = useRef(new Set<string>())
  const refreshInFlightRef = useRef<GiftRefreshPipeline | null>(null)
  const signalRefreshTimerRef = useRef<number | null>(null)
  const signaledEventIdsRef = useRef(new Set<string>())
  const broadcastSignalRef = useRef(broadcastSignal)
  const currentScopeRef = useRef(routeScope)

  useLayoutEffect(() => {
    currentScopeRef.current = routeScope
    if (signalRefreshTimerRef.current !== null) {
      window.clearTimeout(signalRefreshTimerRef.current)
      signalRefreshTimerRef.current = null
    }
  }, [routeScope])

  useEffect(() => {
    broadcastSignalRef.current = broadcastSignal
  }, [broadcastSignal])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const ingestEvents = useCallback((events: OnlineClassroomGiftEvent[], scope: GiftRouteScope) => {
    if (events.length === 0 || currentScopeRef.current !== scope) return
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
      // Do not discard rewards from a burst. The overlay consumes this FIFO;
      // backend retention bounds how many events a refresh can return.
      setQueueState((current) => currentScopeRef.current === scope
        ? {
            scope,
            events: [...(current.scope === scope ? current.events : []), ...freshEvents],
          }
        : current)
    }
  }, [])

  const fetchGifts = useCallback(async () => {
    const scope = routeScope
    if (!enabled || !scope.bookingId || currentScopeRef.current !== scope) return
    const inFlight = refreshInFlightRef.current
    if (inFlight && currentScopeRef.current === inFlight.scope) {
      inFlight.queued = true
      await inFlight.request
      return
    }
    const pipeline: GiftRefreshPipeline = {
      scope,
      queued: false,
      request: Promise.resolve(),
    }
    const request = (async () => {
      do {
        if (!mountedRef.current || currentScopeRef.current !== scope) return
        pipeline.queued = false
        try {
          // Realtime messages are untrusted wake-up hints. Always fetch the
          // bounded authoritative event list instead of one caller-supplied id.
          const response = await getOnlineClassroomGiftEvents(scope.bookingId, scope.token)
          if (!mountedRef.current
            || currentScopeRef.current !== scope) return
          ingestEvents(response.events, scope)
          setSyncWarning('')
        } catch (error) {
          if (!mountedRef.current
            || currentScopeRef.current !== scope) return
          setSyncWarning(onlineClassroomGiftErrorMessage(error))
        }
      } while (
        pipeline.queued
        && currentScopeRef.current === scope
      )
    })()
    pipeline.request = request
    refreshInFlightRef.current = pipeline
    try {
      await request
    } finally {
      if (refreshInFlightRef.current === pipeline) refreshInFlightRef.current = null
    }
  }, [enabled, ingestEvents, routeScope])

  const scheduleSignalRefresh = useCallback(() => {
    const scope = routeScope
    if (!enabled || !scope.bookingId || currentScopeRef.current !== scope || signalRefreshTimerRef.current !== null) return
    signalRefreshTimerRef.current = window.setTimeout(() => {
      signalRefreshTimerRef.current = null
      if (currentScopeRef.current !== scope) return
      void fetchGifts()
    }, 500)
  }, [enabled, fetchGifts, routeScope])

  const refreshGifts = useCallback(async () => {
    const scope = routeScope
    if (currentScopeRef.current !== scope) return
    setLoadingGifts(true)
    try {
      await fetchGifts()
    } finally {
      if (mountedRef.current && currentScopeRef.current === scope) setLoadingGifts(false)
    }
  }, [fetchGifts, routeScope])

  useEffect(() => {
    const scope = routeScope
    seenEventIdsRef.current.clear()
    signaledEventIdsRef.current.clear()
    if (!enabled || !bookingId) return
    const initialRefresh = window.setTimeout(() => {
      if (currentScopeRef.current !== scope) return
      setQueueState({ scope, events: [] })
      setSendingGiftType(null)
      setLoadingGifts(false)
      setSendError('')
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
      if (signalRefreshTimerRef.current !== null) {
        window.clearTimeout(signalRefreshTimerRef.current)
        signalRefreshTimerRef.current = null
      }
      window.clearInterval(interval)
      window.removeEventListener('focus', onVisibilityChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [bookingId, enabled, fallbackRefreshMs, fetchGifts, refreshGifts, routeScope])

  const visibleQueue = queueState.scope === routeScope ? queueState.events : []
  const activeGiftId = visibleQueue[0]?.id || ''
  useEffect(() => {
    if (!activeGiftId) return
    const scope = routeScope
    const timer = window.setTimeout(() => {
      setQueueState((current) => currentScopeRef.current === scope
        && current.scope === scope
        && current.events[0]?.id === activeGiftId
        ? { scope, events: current.events.slice(1) }
        : current)
    }, ONLINE_CLASSROOM_GIFT_EFFECT_MS)
    return () => window.clearTimeout(timer)
  }, [activeGiftId, routeScope])

  const sendGift = useCallback(async (giftType: OnlineClassroomGiftType) => {
    const scope = routeScope
    if (
      !enabled
      || !scope.bookingId
      || (role !== 'teacher' && role !== 'admin')
      || currentScopeRef.current !== scope
      || (sendingRef.current && currentScopeRef.current === sendingRef.current)
    ) return
    const clientRequestId = createOnlineClassroomGiftClientRequestId()
    sendingRef.current = scope
    setSendingGiftType(giftType)
    setSendError('')
    try {
      let response
      try {
        response = await sendOnlineClassroomGift(scope.bookingId, giftType, clientRequestId)
      } catch (firstError) {
        if (!shouldRetryGiftSend(firstError)) throw firstError
        // The same request id makes a retry safe if the first response was lost
        // after the backend had already persisted the event.
        response = await sendOnlineClassroomGift(scope.bookingId, giftType, clientRequestId)
      }
      if (!mountedRef.current || currentScopeRef.current !== scope) return
      ingestEvents([response.event], scope)
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
      if (mountedRef.current && currentScopeRef.current === scope) {
        setSendError(onlineClassroomGiftErrorMessage(error))
      }
    } finally {
      if (sendingRef.current === scope) sendingRef.current = null
      if (mountedRef.current && currentScopeRef.current === scope) setSendingGiftType(null)
    }
  }, [enabled, ingestEvents, role, routeScope])

  const handleRealtimeMessage = useCallback((message: string): boolean => {
    if (currentScopeRef.current !== routeScope) return false
    const eventId = parseOnlineClassroomGiftSignal(message)
    if (!eventId) return false
    if (!seenEventIdsRef.current.has(eventId) && !signaledEventIdsRef.current.has(eventId)) {
      signaledEventIdsRef.current.add(eventId)
      while (signaledEventIdsRef.current.size > 200) {
        const oldest = signaledEventIdsRef.current.values().next().value
        if (typeof oldest !== 'string') break
        signaledEventIdsRef.current.delete(oldest)
      }
      scheduleSignalRefresh()
    }
    return true
  }, [routeScope, scheduleSignalRefresh])

  const dismissActiveGift = useCallback(() => {
    const scope = routeScope
    setQueueState((current) => currentScopeRef.current === scope && current.scope === scope
      ? { scope, events: current.events.slice(1) }
      : current)
  }, [routeScope])

  return {
    activeGift: visibleQueue[0] || null,
    pendingGiftCount: Math.max(0, visibleQueue.length - 1),
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

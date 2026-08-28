import { createHash } from 'node:crypto'

export const ONLINE_CLASSROOM_GIFT_EVENTS_COLLECTION = 'giftEvents'
export const ONLINE_CLASSROOM_GIFT_RATE_LIMITS_COLLECTION = 'giftRateLimits'
export const ONLINE_CLASSROOM_GIFT_EFFECT_MS = 5_200
export const ONLINE_CLASSROOM_GIFT_DISCOVERY_WINDOW_MS = 45_000
export const ONLINE_CLASSROOM_GIFT_RETENTION_MS = 24 * 60 * 60 * 1000
export const ONLINE_CLASSROOM_GIFT_MIN_INTERVAL_MS = 1_200
export const ONLINE_CLASSROOM_GIFT_RATE_WINDOW_MS = 30_000
export const ONLINE_CLASSROOM_GIFT_RATE_WINDOW_MAX = 8

export type OnlineClassroomGiftType = 'gold-star' | 'champion-cup' | 'rocket' | 'celebration'
export type OnlineClassroomGiftSenderRole = 'admin' | 'teacher'

export type OnlineClassroomGiftCatalogItem = {
  type: OnlineClassroomGiftType
  title: string
  message: string
}

export type OnlineClassroomGiftEvent = {
  id: string
  giftType: OnlineClassroomGiftType
  title: string
  message: string
  senderRole: OnlineClassroomGiftSenderRole
  senderName: string
  recipientName: string
  createdAtMs: number
  displayUntilMs: number
}

export type OnlineClassroomGiftRateState = {
  windowStartedAtMs: number
  sentInWindow: number
  lastSentAtMs: number
}

export type OnlineClassroomGiftRateDecision = {
  allowed: boolean
  retryAfterMs: number
  nextState: OnlineClassroomGiftRateState
}

export const ONLINE_CLASSROOM_GIFT_CATALOG: Readonly<Record<OnlineClassroomGiftType, OnlineClassroomGiftCatalogItem>> = {
  'gold-star': {
    type: 'gold-star',
    title: 'Ngôi sao tiến bộ',
    message: 'Em làm rất tốt!',
  },
  'champion-cup': {
    type: 'champion-cup',
    title: 'Cúp chinh phục',
    message: 'Một câu trả lời xuất sắc!',
  },
  rocket: {
    type: 'rocket',
    title: 'Tên lửa bứt phá',
    message: 'Tiếp tục giữ phong độ nhé!',
  },
  celebration: {
    type: 'celebration',
    title: 'Pháo giấy cổ vũ',
    message: 'Chúc mừng em đã hoàn thành thử thách!',
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isOnlineClassroomGiftType(value: unknown): value is OnlineClassroomGiftType {
  return typeof value === 'string' && Object.hasOwn(ONLINE_CLASSROOM_GIFT_CATALOG, value)
}

export function isOnlineClassroomGiftClientRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{15,119}$/.test(value)
}

export function isOnlineClassroomGiftEventId(value: unknown): value is string {
  return typeof value === 'string' && /^gift_[a-f0-9]{40}$/.test(value)
}

export function canSendOnlineClassroomGift(role: unknown): role is OnlineClassroomGiftSenderRole {
  return role === 'admin' || role === 'teacher'
}

export function onlineClassroomGiftRequestFingerprint(giftType: OnlineClassroomGiftType): string {
  return createHash('sha256').update(`gift-v1|${giftType}`, 'utf8').digest('hex')
}

export function onlineClassroomGiftEventId(
  sessionKey: string,
  actorKey: string,
  clientRequestId: string,
): string {
  const digest = createHash('sha256')
    .update(`gift-event-v1|${sessionKey}|${actorKey}|${clientRequestId}`, 'utf8')
    .digest('hex')
    .slice(0, 40)
  return `gift_${digest}`
}

export function onlineClassroomGiftRateLimitId(actorKey: string): string {
  return createHash('sha256').update(`gift-rate-v1|${actorKey}`, 'utf8').digest('hex').slice(0, 40)
}

export function decideOnlineClassroomGiftRate(
  current: Partial<OnlineClassroomGiftRateState> | null,
  nowMs: number,
): OnlineClassroomGiftRateDecision {
  const safeNowMs = Number.isSafeInteger(nowMs) && nowMs >= 0 ? nowMs : 0
  const currentWindowStartedAtMs = Number.isSafeInteger(current?.windowStartedAtMs)
    && Number(current?.windowStartedAtMs) >= 0
    ? Number(current?.windowStartedAtMs)
    : safeNowMs
  const lastSentAtMs = Number.isSafeInteger(current?.lastSentAtMs) && Number(current?.lastSentAtMs) >= 0
    ? Number(current?.lastSentAtMs)
    : 0
  // Server clocks should be monotonic, but a transaction may observe a stored
  // timestamp slightly ahead after clock correction. Clamp forward so rollback
  // never resets the bucket or loses counts; requests fail closed until the
  // minimum interval has genuinely elapsed.
  const effectiveNowMs = Math.max(safeNowMs, currentWindowStartedAtMs, lastSentAtMs)
  const windowExpired = effectiveNowMs - currentWindowStartedAtMs >= ONLINE_CLASSROOM_GIFT_RATE_WINDOW_MS
  const windowStartedAtMs = windowExpired ? effectiveNowMs : currentWindowStartedAtMs
  const sentInWindow = windowExpired
    ? 0
    : Number.isSafeInteger(current?.sentInWindow) && Number(current?.sentInWindow) >= 0
      ? Number(current?.sentInWindow)
      : 0

  const intervalRetryMs = lastSentAtMs > 0
    ? Math.max(0, ONLINE_CLASSROOM_GIFT_MIN_INTERVAL_MS - (effectiveNowMs - lastSentAtMs))
    : 0
  const windowRetryMs = sentInWindow >= ONLINE_CLASSROOM_GIFT_RATE_WINDOW_MAX
    ? Math.max(1, ONLINE_CLASSROOM_GIFT_RATE_WINDOW_MS - (effectiveNowMs - windowStartedAtMs))
    : 0
  const retryAfterMs = Math.max(intervalRetryMs, windowRetryMs)
  if (retryAfterMs > 0) {
    return {
      allowed: false,
      retryAfterMs,
      nextState: { windowStartedAtMs, sentInWindow, lastSentAtMs },
    }
  }

  return {
    allowed: true,
    retryAfterMs: 0,
    nextState: {
      windowStartedAtMs,
      sentInWindow: sentInWindow + 1,
      lastSentAtMs: effectiveNowMs,
    },
  }
}

export function createOnlineClassroomGiftEvent(input: {
  id: string
  giftType: OnlineClassroomGiftType
  senderRole: OnlineClassroomGiftSenderRole
  senderName: string
  recipientName: string
  createdAtMs: number
}): OnlineClassroomGiftEvent {
  const catalogItem = ONLINE_CLASSROOM_GIFT_CATALOG[input.giftType]
  return {
    id: input.id,
    giftType: input.giftType,
    title: catalogItem.title,
    message: catalogItem.message,
    senderRole: input.senderRole,
    senderName: input.senderName.trim().slice(0, 120) || (input.senderRole === 'admin' ? 'Admin 123English' : 'Gia sư 123English'),
    recipientName: input.recipientName.trim().slice(0, 120) || 'Học viên 123English',
    createdAtMs: input.createdAtMs,
    displayUntilMs: input.createdAtMs + ONLINE_CLASSROOM_GIFT_DISCOVERY_WINDOW_MS,
  }
}

export function validateOnlineClassroomGiftEvent(value: unknown): OnlineClassroomGiftEvent | null {
  if (!isRecord(value)) return null
  const expectedKeys = new Set([
    'id',
    'giftType',
    'title',
    'message',
    'senderRole',
    'senderName',
    'recipientName',
    'createdAtMs',
    'displayUntilMs',
  ])
  const actualKeys = Object.keys(value)
  if (actualKeys.length !== expectedKeys.size || actualKeys.some((key) => !expectedKeys.has(key))) return null
  if (!isOnlineClassroomGiftEventId(value.id) || !isOnlineClassroomGiftType(value.giftType)) return null
  if (!canSendOnlineClassroomGift(value.senderRole)) return null
  if (typeof value.title !== 'string' || value.title.length < 1 || value.title.length > 80) return null
  if (typeof value.message !== 'string' || value.message.length < 1 || value.message.length > 120) return null
  if (typeof value.senderName !== 'string' || value.senderName.length < 1 || value.senderName.length > 120) return null
  if (typeof value.recipientName !== 'string' || value.recipientName.length < 1 || value.recipientName.length > 120) return null
  if (!Number.isSafeInteger(value.createdAtMs) || Number(value.createdAtMs) < 0) return null
  if (!Number.isSafeInteger(value.displayUntilMs)
    || Number(value.displayUntilMs) !== Number(value.createdAtMs) + ONLINE_CLASSROOM_GIFT_DISCOVERY_WINDOW_MS) return null
  const catalogItem = ONLINE_CLASSROOM_GIFT_CATALOG[value.giftType]
  if (value.title !== catalogItem.title || value.message !== catalogItem.message) return null
  return value as OnlineClassroomGiftEvent
}

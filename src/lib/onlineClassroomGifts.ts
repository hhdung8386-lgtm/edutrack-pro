import { getFunctions, httpsCallable } from 'firebase/functions'
import app from '@/lib/firebase'

export type OnlineClassroomGiftType = 'gold-star' | 'champion-cup' | 'rocket' | 'celebration'
export type OnlineClassroomGiftSenderRole = 'admin' | 'teacher'

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

export type OnlineClassroomGiftCatalogItem = {
  type: OnlineClassroomGiftType
  title: string
  shortLabel: string
}

export const ONLINE_CLASSROOM_GIFT_EFFECT_MS = 5_200
export const ONLINE_CLASSROOM_GIFT_FALLBACK_REFRESH_MS = 25_000
export const ONLINE_CLASSROOM_GIFT_CATALOG: readonly OnlineClassroomGiftCatalogItem[] = [
  { type: 'gold-star', title: 'Ngôi sao tiến bộ', shortLabel: 'Ngôi sao' },
  { type: 'champion-cup', title: 'Cúp chinh phục', shortLabel: 'Cúp vàng' },
  { type: 'rocket', title: 'Tên lửa bứt phá', shortLabel: 'Bứt phá' },
  { type: 'celebration', title: 'Pháo giấy cổ vũ', shortLabel: 'Chúc mừng' },
]

const GIFT_SIGNAL_PREFIX = '123english:classroom-gift:v1:'
const GIFT_EVENT_ID_PATTERN = /^gift_[a-f0-9]{40}$/
const functions = getFunctions(app, 'asia-southeast1')

const sendGiftCallable = httpsCallable<
  { bookingId: string; giftType: OnlineClassroomGiftType; clientRequestId: string },
  {
    success: boolean
    duplicate: boolean
    event: OnlineClassroomGiftEvent
    accountingImpact: 'none'
  }
>(functions, 'sendOnlineClassroomGift')

const getGiftEventsCallable = httpsCallable<
  { bookingId: string; token?: string; eventId?: string },
  { events: OnlineClassroomGiftEvent[]; serverNowMs: number }
>(functions, 'getOnlineClassroomGiftEvents')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isOnlineClassroomGiftType(value: unknown): value is OnlineClassroomGiftType {
  return value === 'gold-star' || value === 'champion-cup' || value === 'rocket' || value === 'celebration'
}

export function validateOnlineClassroomGiftEvent(value: unknown): OnlineClassroomGiftEvent | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !GIFT_EVENT_ID_PATTERN.test(value.id)) return null
  if (!isOnlineClassroomGiftType(value.giftType)) return null
  if (value.senderRole !== 'admin' && value.senderRole !== 'teacher') return null
  if (typeof value.title !== 'string' || value.title.length < 1 || value.title.length > 80) return null
  if (typeof value.message !== 'string' || value.message.length < 1 || value.message.length > 120) return null
  if (typeof value.senderName !== 'string' || value.senderName.length < 1 || value.senderName.length > 120) return null
  if (typeof value.recipientName !== 'string' || value.recipientName.length < 1 || value.recipientName.length > 120) return null
  if (!Number.isSafeInteger(value.createdAtMs) || Number(value.createdAtMs) < 0) return null
  if (!Number.isSafeInteger(value.displayUntilMs) || Number(value.displayUntilMs) <= Number(value.createdAtMs)) return null
  return value as OnlineClassroomGiftEvent
}

export function createOnlineClassroomGiftClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `gift-${crypto.randomUUID()}`
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(18))
    return `gift-${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`
  }
  return `gift-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 18)}`
}

export function onlineClassroomGiftSignal(eventId: string): string {
  if (!GIFT_EVENT_ID_PATTERN.test(eventId)) throw new Error('Mã sự kiện quà không hợp lệ.')
  return `${GIFT_SIGNAL_PREFIX}${eventId}`
}

export function parseOnlineClassroomGiftSignal(message: string): string | null {
  if (!message.startsWith(GIFT_SIGNAL_PREFIX)) return null
  const eventId = message.slice(GIFT_SIGNAL_PREFIX.length)
  return GIFT_EVENT_ID_PATTERN.test(eventId) ? eventId : null
}

export async function sendOnlineClassroomGift(
  bookingId: string,
  giftType: OnlineClassroomGiftType,
  clientRequestId: string,
) {
  const response = (await sendGiftCallable({ bookingId, giftType, clientRequestId })).data
  const event = validateOnlineClassroomGiftEvent(response.event)
  if (!response.success || response.accountingImpact !== 'none' || !event) {
    throw new Error('Phản hồi tặng quà không hợp lệ. Vui lòng tải lại lớp học.')
  }
  return { ...response, event }
}

export async function getOnlineClassroomGiftEvents(
  bookingId: string,
  token?: string,
  eventId?: string,
): Promise<{ events: OnlineClassroomGiftEvent[]; serverNowMs: number }> {
  const response = (await getGiftEventsCallable({
    bookingId,
    ...(token ? { token } : {}),
    ...(eventId ? { eventId } : {}),
  })).data
  const events = Array.isArray(response.events)
    ? response.events.map(validateOnlineClassroomGiftEvent).filter((event): event is OnlineClassroomGiftEvent => Boolean(event))
    : []
  return {
    events,
    serverNowMs: Number.isSafeInteger(response.serverNowMs) ? response.serverNowMs : Date.now(),
  }
}

export function onlineClassroomGiftErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '')
  const cleaned = raw
    .replace(/^FirebaseError:\s*/i, '')
    .replace(/^functions\/[a-z-]+:\s*/i, '')
    .trim()
  if (/resource-exhausted|quá nhanh/i.test(raw)) return 'Bạn đang tặng quà quá nhanh. Hãy chờ một chút rồi thử lại.'
  if (/permission-denied|Chỉ gia sư/i.test(raw)) return 'Chỉ gia sư được phân công hoặc Admin mới có thể tặng quà.'
  return cleaned || 'Chưa thể gửi quà. Vui lòng kiểm tra kết nối và thử lại.'
}

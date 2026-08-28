import { Firestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  ONLINE_CLASSROOM_GIFT_EVENTS_COLLECTION,
  ONLINE_CLASSROOM_GIFT_RATE_LIMITS_COLLECTION,
  ONLINE_CLASSROOM_GIFT_RETENTION_MS,
  canSendOnlineClassroomGift,
  createOnlineClassroomGiftEvent,
  decideOnlineClassroomGiftRate,
  isOnlineClassroomGiftClientRequestId,
  isOnlineClassroomGiftEventId,
  isOnlineClassroomGiftType,
  onlineClassroomGiftEventId,
  onlineClassroomGiftRateLimitId,
  onlineClassroomGiftRequestFingerprint,
  validateOnlineClassroomGiftEvent,
  type OnlineClassroomGiftEvent,
} from './onlineClassroomGift'
import { ONLINE_CLASSROOM_ROOMS_COLLECTION, isSafeClassroomId } from './onlineClassroom'
import { loadEligibleContext, resolveViewer } from './onlineClassroomFunctions'

const db = new Firestore()
const ONLINE_CLASSROOM_GIFT_LIST_LIMIT = 25
const ONLINE_CLASSROOM_GIFT_CLEANUP_LIMIT = 12

type StoredGiftEvent = OnlineClassroomGiftEvent & {
  requestFingerprint?: unknown
}

function readStoredGiftEvent(value: unknown): OnlineClassroomGiftEvent | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  return validateOnlineClassroomGiftEvent({
    id: source.id,
    giftType: source.giftType,
    title: source.title,
    message: source.message,
    senderRole: source.senderRole,
    senderName: source.senderName,
    recipientName: source.recipientName,
    createdAtMs: source.createdAtMs,
    displayUntilMs: source.displayUntilMs,
  })
}

async function cleanupExpiredGiftEvents(sessionKey: string): Promise<void> {
  try {
    const expired = await db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION)
      .doc(sessionKey)
      .collection(ONLINE_CLASSROOM_GIFT_EVENTS_COLLECTION)
      .where('expiresAt', '<=', Timestamp.now())
      .limit(ONLINE_CLASSROOM_GIFT_CLEANUP_LIMIT)
      .get()
    if (expired.empty) return
    const batch = db.batch()
    expired.docs.forEach((snapshot) => batch.delete(snapshot.ref))
    await batch.commit()
  } catch (error) {
    // Gift cleanup is hygiene only. Expired events are filtered from every
    // callable response, so a temporary cleanup failure cannot replay a gift.
    logger.warn('Online classroom gift cleanup skipped', {
      sessionKey,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export const sendOnlineClassroomGift = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
}, async (request) => {
  const bookingId = request.data?.bookingId
  const giftType = request.data?.giftType
  const clientRequestId = request.data?.clientRequestId
  if (!isSafeClassroomId(bookingId)) {
    throw new HttpsError('invalid-argument', 'Booking không hợp lệ.')
  }
  if (!isOnlineClassroomGiftType(giftType) || !isOnlineClassroomGiftClientRequestId(clientRequestId)) {
    throw new HttpsError('invalid-argument', 'Loại quà hoặc mã thao tác không hợp lệ.')
  }

  const context = await loadEligibleContext(bookingId)
  const viewer = await resolveViewer(request, context)
  const senderRole = viewer.role
  if (!canSendOnlineClassroomGift(senderRole)) {
    throw new HttpsError('permission-denied', 'Chỉ gia sư được phân công hoặc Admin mới có thể tặng quà trong lớp.')
  }

  const actorKey = senderRole === 'admin'
    ? `admin:${request.auth!.uid}`
    : `teacher:${context.booking.teacherId}`
  const requestFingerprint = onlineClassroomGiftRequestFingerprint(giftType)
  const eventId = onlineClassroomGiftEventId(context.sessionKey, actorKey, clientRequestId)
  const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(context.sessionKey)
  const eventRef = roomRef.collection(ONLINE_CLASSROOM_GIFT_EVENTS_COLLECTION).doc(eventId)
  const rateRef = roomRef.collection(ONLINE_CLASSROOM_GIFT_RATE_LIMITS_COLLECTION)
    .doc(onlineClassroomGiftRateLimitId(actorKey))
  const nowMs = Date.now()

  const result = await db.runTransaction(async (transaction) => {
    const [existingSnapshot, rateSnapshot] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(rateRef),
    ])
    if (existingSnapshot.exists) {
      const existingData = existingSnapshot.data() as StoredGiftEvent
      const existingEvent = readStoredGiftEvent(existingData)
      if (!existingEvent || existingData.requestFingerprint !== requestFingerprint) {
        throw new HttpsError(
          'failed-precondition',
          'Mã thao tác quà đã được dùng cho nội dung khác. Hãy tải lại lớp học.',
          { reason: 'GIFT_IDEMPOTENCY_CONFLICT' },
        )
      }
      return { event: existingEvent, duplicate: true }
    }

    const rateDecision = decideOnlineClassroomGiftRate(rateSnapshot.data() || null, nowMs)
    if (!rateDecision.allowed) {
      throw new HttpsError(
        'resource-exhausted',
        'Bạn đang tặng quà quá nhanh. Vui lòng chờ một chút rồi thử lại.',
        { reason: 'GIFT_RATE_LIMITED', retryAfterMs: rateDecision.retryAfterMs },
      )
    }

    const event = createOnlineClassroomGiftEvent({
      id: eventId,
      giftType,
      senderRole,
      senderName: viewer.displayName,
      recipientName: context.student.name || context.booking.studentName || 'Học viên 123English',
      createdAtMs: nowMs,
    })
    transaction.create(eventRef, {
      ...event,
      bookingId: context.booking.id,
      sessionKey: context.sessionKey,
      recipientStudentId: context.booking.studentId,
      senderActorKey: actorKey,
      requestFingerprint,
      createdAt: Timestamp.fromMillis(nowMs),
      expiresAt: Timestamp.fromMillis(nowMs + ONLINE_CLASSROOM_GIFT_RETENTION_MS),
    })
    transaction.set(rateRef, {
      ...rateDecision.nextState,
      actorKey,
      updatedAt: Timestamp.fromMillis(nowMs),
    }, { merge: true })
    return { event, duplicate: false }
  })

  await cleanupExpiredGiftEvents(context.sessionKey)
  return {
    success: true,
    duplicate: result.duplicate,
    event: result.event,
    // This invariant is explicit so clients never interpret the visual gift as
    // diamonds, attendance, payroll or another financial/reward mutation.
    accountingImpact: 'none' as const,
  }
})

export const getOnlineClassroomGiftEvents = onCall({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
}, async (request) => {
  const bookingId = request.data?.bookingId
  const requestedEventId = request.data?.eventId
  if (!isSafeClassroomId(bookingId)) {
    throw new HttpsError('invalid-argument', 'Booking không hợp lệ.')
  }
  if (requestedEventId !== undefined && !isOnlineClassroomGiftEventId(requestedEventId)) {
    throw new HttpsError('invalid-argument', 'Mã sự kiện quà không hợp lệ.')
  }

  const context = await loadEligibleContext(bookingId)
  await resolveViewer(request, context)
  const eventsRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION)
    .doc(context.sessionKey)
    .collection(ONLINE_CLASSROOM_GIFT_EVENTS_COLLECTION)
  const snapshots = requestedEventId
    ? [await eventsRef.doc(requestedEventId).get()]
    : (await eventsRef.orderBy('createdAtMs', 'desc').limit(ONLINE_CLASSROOM_GIFT_LIST_LIMIT).get()).docs
  const serverNowMs = Date.now()
  const events = snapshots
    .map((snapshot) => readStoredGiftEvent(snapshot.data()))
    .filter((event): event is OnlineClassroomGiftEvent => Boolean(event && event.displayUntilMs > serverNowMs))
    .sort((left, right) => left.createdAtMs - right.createdAtMs || left.id.localeCompare(right.id))

  await cleanupExpiredGiftEvents(context.sessionKey)
  return { events, serverNowMs }
})

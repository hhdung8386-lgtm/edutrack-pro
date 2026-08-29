import { Firestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  ONLINE_CLASSROOM_GIFT_EVENTS_COLLECTION,
  ONLINE_CLASSROOM_GIFT_DISCOVERY_WINDOW_MS,
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
import {
  loadEligibleContext,
  preauthorizeClassroomRequest,
  resolveViewer,
} from './onlineClassroomFunctions'

const db = new Firestore()
const ONLINE_CLASSROOM_GIFT_LIST_LIMIT = 50
const ONLINE_CLASSROOM_GIFT_CLEANUP_LIMIT = 12
const ONLINE_CLASSROOM_GIFT_CLOCK_SKEW_MS = 10_000
const ONLINE_CLASSROOM_GIFT_CLEANUP_COOLDOWN_MS = 15 * 60 * 1000
const ONLINE_CLASSROOM_GIFT_CLEANUP_CACHE_MAX = 500
const giftCleanupLastAttemptBySession = new Map<string, number>()

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

async function cleanupExpiredGiftArtifacts(sessionKey: string): Promise<void> {
  const startedAtMs = Date.now()
  const previousAttemptMs = giftCleanupLastAttemptBySession.get(sessionKey) || 0
  if (startedAtMs - previousAttemptMs < ONLINE_CLASSROOM_GIFT_CLEANUP_COOLDOWN_MS) return
  if (!giftCleanupLastAttemptBySession.has(sessionKey)
    && giftCleanupLastAttemptBySession.size >= ONLINE_CLASSROOM_GIFT_CLEANUP_CACHE_MAX) {
    const oldestSessionKey = giftCleanupLastAttemptBySession.keys().next().value
    if (oldestSessionKey) giftCleanupLastAttemptBySession.delete(oldestSessionKey)
  }
  giftCleanupLastAttemptBySession.delete(sessionKey)
  giftCleanupLastAttemptBySession.set(sessionKey, startedAtMs)
  try {
    const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(sessionKey)
    const now = Timestamp.now()
    const [expiredEvents, expiredRateLimits] = await Promise.all([
      roomRef.collection(ONLINE_CLASSROOM_GIFT_EVENTS_COLLECTION)
        .where('expiresAt', '<=', now)
        .limit(ONLINE_CLASSROOM_GIFT_CLEANUP_LIMIT)
        .get(),
      roomRef.collection(ONLINE_CLASSROOM_GIFT_RATE_LIMITS_COLLECTION)
        .where('expiresAt', '<=', now)
        .limit(ONLINE_CLASSROOM_GIFT_CLEANUP_LIMIT)
        .get(),
    ])
    if (expiredEvents.empty && expiredRateLimits.empty) return
    const batch = db.batch()
    expiredEvents.docs.forEach((snapshot) => batch.delete(snapshot.ref))
    expiredRateLimits.docs.forEach((snapshot) => batch.delete(snapshot.ref))
    await batch.commit()
  } catch (error) {
    giftCleanupLastAttemptBySession.delete(sessionKey)
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
  // Gift writes are lightweight and intentionally low-volume in the pilot.
  // Fractional CPU preserves regional deployment headroom for classroom calls.
  cpu: 'gcf_gen1',
  maxInstances: 3,
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

  await preauthorizeClassroomRequest(request, bookingId)
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
  // A room-wide bucket prevents several Admin accounts from bypassing the
  // per-actor limiter and flooding the student's animation queue.
  const roomRateRef = roomRef.collection(ONLINE_CLASSROOM_GIFT_RATE_LIMITS_COLLECTION)
    .doc(onlineClassroomGiftRateLimitId('room'))

  const result = await db.runTransaction(async (transaction) => {
    const [existingSnapshot, rateSnapshot, roomRateSnapshot] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(rateRef),
      transaction.get(roomRateRef),
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

    // Capture time inside every transaction attempt, after the reads. If a
    // concurrent writer wins, Firestore retries this callback with a fresh
    // timestamp instead of applying an older timestamp to newer rate state.
    const nowMs = Date.now()
    const rateDecision = decideOnlineClassroomGiftRate(rateSnapshot.data() || null, nowMs)
    const roomRateDecision = decideOnlineClassroomGiftRate(roomRateSnapshot.data() || null, nowMs)
    if (!rateDecision.allowed || !roomRateDecision.allowed) {
      throw new HttpsError(
        'resource-exhausted',
        'Bạn đang tặng quà quá nhanh. Vui lòng chờ một chút rồi thử lại.',
        {
          reason: 'GIFT_RATE_LIMITED',
          retryAfterMs: Math.max(rateDecision.retryAfterMs, roomRateDecision.retryAfterMs),
        },
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
      expiresAt: Timestamp.fromMillis(nowMs + ONLINE_CLASSROOM_GIFT_RETENTION_MS),
    }, { merge: true })
    transaction.set(roomRateRef, {
      ...roomRateDecision.nextState,
      actorKey: 'room',
      updatedAt: Timestamp.fromMillis(nowMs),
      expiresAt: Timestamp.fromMillis(nowMs + ONLINE_CLASSROOM_GIFT_RETENTION_MS),
    }, { merge: true })
    return { event, duplicate: false }
  })

  await cleanupExpiredGiftArtifacts(context.sessionKey)
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

  await preauthorizeClassroomRequest(request, bookingId)
  const context = await loadEligibleContext(bookingId)
  await resolveViewer(request, context)
  const eventsRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION)
    .doc(context.sessionKey)
    .collection(ONLINE_CLASSROOM_GIFT_EVENTS_COLLECTION)
  const serverNowMs = Date.now()
  const snapshots = requestedEventId
    ? [await eventsRef.doc(requestedEventId).get()]
    : (await eventsRef
      .where('createdAtMs', '>=', serverNowMs - ONLINE_CLASSROOM_GIFT_DISCOVERY_WINDOW_MS)
      .where('createdAtMs', '<=', serverNowMs + ONLINE_CLASSROOM_GIFT_CLOCK_SKEW_MS)
      .orderBy('createdAtMs', 'desc')
      .limit(ONLINE_CLASSROOM_GIFT_LIST_LIMIT)
      .get()).docs
  const events = snapshots
    .map((snapshot) => readStoredGiftEvent(snapshot.data()))
    .filter((event): event is OnlineClassroomGiftEvent => Boolean(
      event
      && event.createdAtMs <= serverNowMs + ONLINE_CLASSROOM_GIFT_CLOCK_SKEW_MS
      && event.displayUntilMs > serverNowMs,
    ))
    .sort((left, right) => left.createdAtMs - right.createdAtMs || left.id.localeCompare(right.id))

  return { events, serverNowMs }
})

import { FieldValue, Firestore, Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { onRequest } from 'firebase-functions/v2/https'
import {
  ONLINE_CLASSROOM_ROOMS_COLLECTION,
  normalizeOnlineClassroomExtensionMinutes,
  onlineClassroomSessionTiming,
  type OnlineClassroomBookingLike,
} from './onlineClassroom'
import {
  ONLINE_CLASSROOM_ATTENDANCE_EVENTS_COLLECTION,
  ONLINE_CLASSROOM_ATTENDANCE_SESSIONS_COLLECTION,
  ONLINE_CLASSROOM_JAAS_WEBHOOK_MAX_BYTES,
  decideOnlineClassroomJaasAttendanceIdempotency,
  onlineClassroomJaasAttendanceEventDocumentId,
  onlineClassroomJaasAttendanceEventFingerprint,
  isOnlineClassroomAttendancePermanentConflict,
  mergeOnlineClassroomAttendanceSessionHistory,
  normalizeOnlineClassroomAttendanceEffectiveSession,
  parseOnlineClassroomAttendanceRoomBinding,
  parseOnlineClassroomJaasAttendanceEvent,
  projectOnlineClassroomAttendanceSummary,
  reduceOnlineClassroomAttendanceSummary,
  resolveOnlineClassroomAttendanceParticipantRole,
  shouldUseOnlineClassroomAttendanceEffectiveSession,
  verifyOnlineClassroomJaasWebhookSignature,
  type OnlineClassroomAttendanceEffectiveSession,
  type OnlineClassroomAttendancePermanentConflictReason,
  type OnlineClassroomAttendanceRoomBinding,
  type OnlineClassroomJaasAttendanceEvent,
} from './onlineClassroomAttendance'
import {
  ONLINE_TRIAL_CLASSES_COLLECTION,
  isSafeOnlineTrialClassId,
  validateOnlineTrialClassWebhookBinding,
} from './onlineTrialClass'

const db = new Firestore()
const jaasWebhookSigningSecret = defineSecret('JAAS_WEBHOOK_SIGNING_SECRET')
const JAAS_APP_ID_PATTERN = /^vpaas-magic-cookie-[A-Za-z0-9_-]{16,128}$/

class AttendanceWebhookError extends Error {
  constructor(public readonly publicCode: OnlineClassroomAttendancePermanentConflictReason) {
    super(publicCode)
    this.name = 'AttendanceWebhookError'
  }
}

function roomLogId(roomAlias: string): string {
  return onlineClassroomJaasAttendanceEventDocumentId(roomAlias).slice(0, 21)
}

function participantEvent(event: OnlineClassroomJaasAttendanceEvent): boolean {
  return event.eventType === 'PARTICIPANT_JOINED'
    || event.eventType === 'PARTICIPANT_LEFT'
    || event.eventType === 'PARTICIPANT_JOINED_LOBBY'
    || event.eventType === 'PARTICIPANT_LEFT_LOBBY'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function timestampMillis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null
}

function effectiveSessionFromRoom(
  roomData: unknown,
  booking: OnlineClassroomBookingLike,
  binding: OnlineClassroomAttendanceRoomBinding,
): OnlineClassroomAttendanceEffectiveSession {
  if (!isRecord(roomData)) throw new AttendanceWebhookError('invalid-room-binding')
  const rawExtensionMinutes = roomData.extensionMinutes
  const extensionMinutes = normalizeOnlineClassroomExtensionMinutes(rawExtensionMinutes)
  if (rawExtensionMinutes !== undefined
    && (!Number.isSafeInteger(rawExtensionMinutes)
      || Number(rawExtensionMinutes) < 0
      || Number(rawExtensionMinutes) > 10)) {
    throw new AttendanceWebhookError('invalid-room-timing')
  }

  const persisted = {
    scheduledStartsAtMs: timestampMillis(roomData.scheduledStartsAt),
    scheduledEndsAtMs: timestampMillis(roomData.scheduledEndsAt),
    hardEndsAtMs: timestampMillis(roomData.hardEndsAt),
  }
  const persistedCount = Object.values(persisted).filter((value) => value !== null).length
  if (persistedCount === 3) {
    const normalized = normalizeOnlineClassroomAttendanceEffectiveSession({
      sessionKey: binding.sessionKey,
      extensionMinutes,
      ...persisted,
      timingSource: 'room',
    })
    if (!normalized) throw new AttendanceWebhookError('invalid-room-timing')
    return normalized
  }
  if (persistedCount > 0) throw new AttendanceWebhookError('invalid-room-timing')

  // Rooms created by the original pilot predate persisted timing fields. An
  // unambiguous room↔booking binding is still safe to retain as attendance
  // evidence; mark the fallback explicitly so Admin can distinguish it.
  const fallback = onlineClassroomSessionTiming(booking, extensionMinutes)
  const normalized = fallback && normalizeOnlineClassroomAttendanceEffectiveSession({
    sessionKey: binding.sessionKey,
    extensionMinutes,
    scheduledStartsAtMs: fallback.scheduledStartsAt.getTime(),
    scheduledEndsAtMs: fallback.scheduledEndsAt.getTime(),
    hardEndsAtMs: fallback.hardEndsAt.getTime(),
    timingSource: 'legacy-booking-fallback',
  })
  if (!normalized) throw new AttendanceWebhookError('invalid-room-timing')
  return normalized
}

function effectiveSessionFromSummary(value: unknown): OnlineClassroomAttendanceEffectiveSession | null {
  if (!isRecord(value)) return null
  const effectiveSessionKey = value.effectiveSessionKey ?? value.sessionKey
  const topLevel = normalizeOnlineClassroomAttendanceEffectiveSession({
    sessionKey: effectiveSessionKey,
    extensionMinutes: value.extensionMinutes,
    scheduledStartsAtMs: timestampMillis(value.effectiveScheduledStartsAt),
    scheduledEndsAtMs: timestampMillis(value.effectiveScheduledEndsAt),
    hardEndsAtMs: timestampMillis(value.effectiveHardEndsAt),
    timingSource: value.effectiveTimingSource,
  })
  if (topLevel) return topLevel
  return isRecord(value.sessionHistory) && typeof effectiveSessionKey === 'string'
    ? normalizeOnlineClassroomAttendanceEffectiveSession(value.sessionHistory[effectiveSessionKey])
    : null
}

function eventParticipantRecord(
  event: OnlineClassroomJaasAttendanceEvent,
  role: ReturnType<typeof resolveOnlineClassroomAttendanceParticipantRole>,
): Record<string, unknown> | undefined {
  if (!participantEvent(event)) return undefined
  return {
    role,
    ...(event.data.id ? { jaasUserId: event.data.id } : {}),
    ...(event.data.participantId ? { participantId: event.data.participantId } : {}),
    ...(event.data.participantJid ? { participantJid: event.data.participantJid } : {}),
    ...(event.data.moderator !== undefined ? { moderator: event.data.moderator } : {}),
    ...(event.data.disconnectReason ? { disconnectReason: event.data.disconnectReason } : {}),
  }
}

function assertFreshBinding(
  roomDocumentId: string,
  roomData: unknown,
  bookingDocumentId: string,
  bookingData: unknown,
  roomAlias: string,
  expected: OnlineClassroomAttendanceRoomBinding,
): OnlineClassroomAttendanceRoomBinding {
  const parsed = parseOnlineClassroomAttendanceRoomBinding({
    roomDocumentId,
    roomData,
    expectedRoomName: roomAlias,
    bookingDocumentId,
    bookingData,
  })
  if (!parsed.ok
    || parsed.binding.bookingId !== expected.bookingId
    || parsed.binding.sessionKey !== expected.sessionKey
    || parsed.binding.teacherId !== expected.teacherId
    || parsed.binding.studentId !== expected.studentId) {
    throw new AttendanceWebhookError('room-booking-binding-changed')
  }
  return parsed.binding
}

async function acknowledgeTrialClassAttendanceEvent(
  roomSnapshot: QueryDocumentSnapshot,
  event: OnlineClassroomJaasAttendanceEvent,
): Promise<{ handled: boolean; duplicate: boolean }> {
  const preliminaryRoom = roomSnapshot.data()
  if (preliminaryRoom.scopeType !== 'trial') return { handled: false, duplicate: false }
  if (!isSafeOnlineTrialClassId(preliminaryRoom.trialClassId)) {
    throw new AttendanceWebhookError('invalid-room-binding')
  }
  const trialRef = db.collection(ONLINE_TRIAL_CLASSES_COLLECTION).doc(preliminaryRoom.trialClassId)
  const eventKey = onlineClassroomJaasAttendanceEventDocumentId(event.idempotencyKey)
  const result = await db.runTransaction(async (transaction) => {
    const [freshRoomSnapshot, trialSnapshot] = await Promise.all([
      transaction.get(roomSnapshot.ref),
      transaction.get(trialRef),
    ])
    if (!freshRoomSnapshot.exists || !trialSnapshot.exists) {
      throw new AttendanceWebhookError('invalid-room-binding')
    }
    const room = freshRoomSnapshot.data() || {}
    const trial = trialSnapshot.data() || {}
    if (!validateOnlineTrialClassWebhookBinding({
      roomDocumentId: freshRoomSnapshot.id,
      expectedRoomName: event.roomAlias,
      roomScopeType: room.scopeType,
      roomScopeId: room.scopeId,
      roomTrialClassId: room.trialClassId,
      roomSessionKey: room.sessionKey,
      roomName: room.roomName,
      roomAccountingImpact: room.accountingImpact,
      trialDocumentId: trialSnapshot.id,
      trialKind: trial.kind,
      trialClassId: trial.trialClassId,
      trialRoomSessionKey: trial.roomSessionKey,
      trialRoomName: trial.roomName,
      trialAccountingImpact: trial.accountingImpact,
    })) {
      throw new AttendanceWebhookError('invalid-room-binding')
    }

    const currentAtMs = Number.isSafeInteger(trial.lastJaasEventAtMs)
      ? Number(trial.lastJaasEventAtMs)
      : -1
    const currentKey = typeof trial.lastJaasEventKey === 'string' ? trial.lastJaasEventKey : ''
    const duplicate = currentAtMs === event.timestamp && currentKey === eventKey
    const shouldAdvance = event.timestamp > currentAtMs
      || (event.timestamp === currentAtMs && eventKey > currentKey)
    if (shouldAdvance) {
      transaction.update(trialRef, {
        lastJaasEventAtMs: event.timestamp,
        lastJaasEventAt: Timestamp.fromMillis(event.timestamp),
        lastJaasEventKey: eventKey,
        lastJaasEventType: event.eventType,
        lastProviderActivityAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
    return { duplicate }
  })
  return { handled: true, duplicate: result.duplicate }
}

/**
 * Authenticated JaaS history receiver. This endpoint records provider evidence
 * only: it never writes lessons, booking state, diamonds, approvals or payroll.
 * JaaS event timestamps, not delivery order or server receipt time, drive the
 * summary state because provider documentation explicitly does not guarantee
 * webhook ordering.
 */
export const onlineClassroomJaasAttendanceWebhook = onRequest({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
  cors: false,
  secrets: [jaasWebhookSigningSecret],
}, async (request, response) => {
  response.set('Cache-Control', 'no-store')
  if (request.method !== 'POST') {
    response.set('Allow', 'POST')
    response.status(405).json({ error: 'method-not-allowed' })
    return
  }

  const signingSecret = jaasWebhookSigningSecret.value()
  const expectedAppId = String(process.env.CLASSROOM_JAAS_APP_ID || '').trim()
  if (!signingSecret || !JAAS_APP_ID_PATTERN.test(expectedAppId)) {
    logger.error('JaaS attendance webhook configuration is incomplete', {
      signingSecretConfigured: Boolean(signingSecret),
      appIdConfigured: JAAS_APP_ID_PATTERN.test(expectedAppId),
    })
    response.status(503).json({ error: 'jaas-webhook-not-configured' })
    return
  }

  const rawBody = request.rawBody
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0
    || rawBody.length > ONLINE_CLASSROOM_JAAS_WEBHOOK_MAX_BYTES) {
    response.status(400).json({ error: 'invalid-raw-body' })
    return
  }

  const signature = verifyOnlineClassroomJaasWebhookSignature({
    secret: signingSecret,
    signatureHeader: request.get('x-jaas-signature'),
    rawBody,
  })
  if (!signature.ok) {
    logger.warn('JaaS attendance webhook signature rejected', { reason: signature.reason })
    response.status(401).json({ error: 'invalid-signature' })
    return
  }

  const parsed = parseOnlineClassroomJaasAttendanceEvent(rawBody, expectedAppId)
  if (!parsed.ok) {
    if (parsed.reason === 'unsupported-event') {
      // The endpoint may receive a newly enabled JaaS event during a rolling
      // configuration change. Authenticated but unsupported events are ACKed
      // so the provider does not retry them forever.
      response.status(200).json({ received: true, ignored: true })
      return
    }
    const status = parsed.reason === 'fqn-not-allowed' ? 403 : 400
    logger.warn('JaaS attendance webhook payload rejected', { reason: parsed.reason })
    response.status(status).json({ error: parsed.reason })
    return
  }
  const event = parsed.event
  const opaqueRoomId = roomLogId(event.roomAlias)

  try {
    // The random room alias is server-generated and indexed on the private
    // onlineClassrooms collection. limit(2) lets us fail closed on an
    // unexpected duplicate alias instead of guessing which booking owns it.
    const roomCandidates = await db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION)
      .where('roomName', '==', event.roomAlias)
      .limit(2)
      .get()
    if (roomCandidates.empty) {
      logger.info('Authenticated JaaS event did not match a managed classroom', {
        eventType: event.eventType,
        room: opaqueRoomId,
      })
      response.status(202).json({ received: true, ignored: true })
      return
    }
    if (roomCandidates.size !== 1) {
      throw new AttendanceWebhookError('ambiguous-room-alias')
    }

    const roomSnapshot = roomCandidates.docs[0]
    const trialResult = await acknowledgeTrialClassAttendanceEvent(roomSnapshot, event)
    if (trialResult.handled) {
      // Trial Class is a standalone meeting aggregate. A signed event is ACKed
      // after its room↔trial binding is revalidated, without reading or writing
      // booking, lesson, minutes, diamonds, salary, or payroll data.
      response.status(200).json({
        received: true,
        duplicate: trialResult.duplicate,
        scope: 'trial',
      })
      return
    }
    const preliminaryRoom = parseOnlineClassroomAttendanceRoomBinding({
      roomDocumentId: roomSnapshot.id,
      roomData: roomSnapshot.data(),
      expectedRoomName: event.roomAlias,
    })
    if (!preliminaryRoom.ok) {
      throw new AttendanceWebhookError(preliminaryRoom.reason)
    }
    const preliminaryBinding = preliminaryRoom.binding
    const bookingRef = db.collection('bookingRequests').doc(preliminaryBinding.bookingId)
    const bookingSnapshot = await bookingRef.get()
    if (!bookingSnapshot.exists) {
      throw new AttendanceWebhookError('booking-room-identity-mismatch')
    }
    const verifiedRoom = parseOnlineClassroomAttendanceRoomBinding({
      roomDocumentId: roomSnapshot.id,
      roomData: roomSnapshot.data(),
      expectedRoomName: event.roomAlias,
      bookingDocumentId: bookingSnapshot.id,
      bookingData: bookingSnapshot.data(),
    })
    if (!verifiedRoom.ok) {
      throw new AttendanceWebhookError(verifiedRoom.reason)
    }
    const binding = verifiedRoom.binding
    const participantRole = resolveOnlineClassroomAttendanceParticipantRole(event, binding)
    const eventFingerprint = onlineClassroomJaasAttendanceEventFingerprint(event)
    const eventDocumentId = onlineClassroomJaasAttendanceEventDocumentId(event.idempotencyKey)
    const summaryRef = db.collection(ONLINE_CLASSROOM_ATTENDANCE_SESSIONS_COLLECTION)
      .doc(binding.bookingId)
    const eventRef = summaryRef.collection(ONLINE_CLASSROOM_ATTENDANCE_EVENTS_COLLECTION)
      .doc(eventDocumentId)

    const result = await db.runTransaction(async (transaction) => {
      // Re-read both halves of the mapping inside the write transaction. A
      // booking reassignment or repaired room document cannot race a webhook
      // into the wrong booking history.
      const freshRoomSnapshot = await transaction.get(roomSnapshot.ref)
      const freshBookingSnapshot = await transaction.get(bookingRef)
      const existingEventSnapshot = await transaction.get(eventRef)
      const summarySnapshot = await transaction.get(summaryRef)
      if (!freshRoomSnapshot.exists || !freshBookingSnapshot.exists) {
        throw new AttendanceWebhookError('room-booking-binding-changed')
      }
      assertFreshBinding(
        freshRoomSnapshot.id,
        freshRoomSnapshot.data(),
        freshBookingSnapshot.id,
        freshBookingSnapshot.data(),
        event.roomAlias,
        binding,
      )

      const idempotencyDecision = decideOnlineClassroomJaasAttendanceIdempotency(
        existingEventSnapshot.exists,
        existingEventSnapshot.data()?.eventFingerprint,
        eventFingerprint,
      )
      if (idempotencyDecision === 'conflict') {
        throw new AttendanceWebhookError('idempotency-key-conflict')
      }
      const booking = {
        id: freshBookingSnapshot.id,
        ...freshBookingSnapshot.data(),
      } as OnlineClassroomBookingLike
      const incomingEffectiveSession = effectiveSessionFromRoom(
        freshRoomSnapshot.data(),
        booking,
        binding,
      )
      const currentSummaryData = summarySnapshot.data()
      const currentEffectiveSession = effectiveSessionFromSummary(currentSummaryData)
      const useIncomingEffectiveSession = !currentEffectiveSession
        || shouldUseOnlineClassroomAttendanceEffectiveSession({
          currentSummary: currentSummaryData,
          currentEffectiveSessionKey: currentEffectiveSession.sessionKey,
          incomingSessionKey: binding.sessionKey,
          event,
        })
      const effectiveSession = useIncomingEffectiveSession
        ? incomingEffectiveSession
        : currentEffectiveSession || incomingEffectiveSession
      const effectiveRoomName = useIncomingEffectiveSession
        || typeof currentSummaryData?.roomName !== 'string'
        ? binding.roomName
        : currentSummaryData.roomName
      const sessionHistory = mergeOnlineClassroomAttendanceSessionHistory(
        currentSummaryData?.sessionHistory,
        incomingEffectiveSession,
      )
      const serverTimestamp = FieldValue.serverTimestamp()
      const effectiveTimingFields = {
        attendanceMetadataSchemaVersion: 1,
        sessionKey: effectiveSession.sessionKey,
        effectiveSessionKey: effectiveSession.sessionKey,
        roomName: effectiveRoomName,
        extensionMinutes: effectiveSession.extensionMinutes,
        effectiveScheduledStartsAt: Timestamp.fromMillis(effectiveSession.scheduledStartsAtMs),
        effectiveScheduledEndsAt: Timestamp.fromMillis(effectiveSession.scheduledEndsAtMs),
        effectiveHardEndsAt: Timestamp.fromMillis(effectiveSession.hardEndsAtMs),
        effectiveTimingSource: effectiveSession.timingSource,
        sessionHistory,
      }

      if (idempotencyDecision === 'duplicate') {
        // A legitimate retry after Admin grants the extension may be the only
        // later delivery for the room. Refresh timing evidence without
        // incrementing attendance counters a second time.
        transaction.set(summaryRef, {
          ...effectiveTimingFields,
          updatedAt: serverTimestamp,
        }, { merge: true })
        return { duplicate: true }
      }

      const summary = reduceOnlineClassroomAttendanceSummary(
        currentSummaryData,
        event,
        participantRole,
      )
      const projection = projectOnlineClassroomAttendanceSummary(
        summary,
        effectiveSession.scheduledStartsAtMs,
      )
      const participant = eventParticipantRecord(event, participantRole)
      transaction.create(eventRef, {
        schemaVersion: 1,
        source: 'jaas-webhook',
        bookingId: binding.bookingId,
        sessionKey: binding.sessionKey,
        roomName: binding.roomName,
        teacherId: binding.teacherId,
        studentId: binding.studentId,
        appId: event.appId,
        fqn: event.fqn,
        jaasSessionId: event.sessionId,
        idempotencyKey: event.idempotencyKey,
        eventFingerprint,
        eventType: event.eventType,
        eventAtMs: event.timestamp,
        eventAt: Timestamp.fromMillis(event.timestamp),
        extensionMinutes: incomingEffectiveSession.extensionMinutes,
        effectiveScheduledStartsAt: Timestamp.fromMillis(incomingEffectiveSession.scheduledStartsAtMs),
        effectiveScheduledEndsAt: Timestamp.fromMillis(incomingEffectiveSession.scheduledEndsAtMs),
        effectiveHardEndsAt: Timestamp.fromMillis(incomingEffectiveSession.hardEndsAtMs),
        effectiveTimingSource: incomingEffectiveSession.timingSource,
        isBreakout: event.data.isBreakout,
        ...(event.data.breakoutRoomId ? { breakoutRoomId: event.data.breakoutRoomId } : {}),
        ...(participant ? { participant } : {}),
        receivedAt: serverTimestamp,
        accountingImpact: 'none',
      })
      transaction.set(summaryRef, {
        ...summary,
        bookingId: binding.bookingId,
        ...effectiveTimingFields,
        teacherId: binding.teacherId,
        studentId: binding.studentId,
        appId: event.appId,
        source: 'jaas-webhook',
        timestampAuthority: 'jaas-event-timestamp',
        accountingImpact: 'none',
        status: projection.status,
        teacherFirstJoinedAt: projection.teacherFirstJoinedAtMs === null
          ? null
          : Timestamp.fromMillis(projection.teacherFirstJoinedAtMs),
        teacherLastLeftAt: projection.teacherLastLeftAtMs === null
          ? null
          : Timestamp.fromMillis(projection.teacherLastLeftAtMs),
        teacherJoinCount: projection.teacherJoinCount,
        studentFirstJoinedAt: projection.studentFirstJoinedAtMs === null
          ? null
          : Timestamp.fromMillis(projection.studentFirstJoinedAtMs),
        studentLastLeftAt: projection.studentLastLeftAtMs === null
          ? null
          : Timestamp.fromMillis(projection.studentLastLeftAtMs),
        studentJoinCount: projection.studentJoinCount,
        teacherLateSeconds: projection.teacherLateSeconds,
        firstEventAt: summary.firstEventAtMs === null
          ? null
          : Timestamp.fromMillis(summary.firstEventAtMs),
        lastEventAt: summary.lastEventAtMs === null
          ? null
          : Timestamp.fromMillis(summary.lastEventAtMs),
        roomCreatedAt: summary.roomCreatedAtMs === null
          ? null
          : Timestamp.fromMillis(summary.roomCreatedAtMs),
        roomDestroyedAt: summary.roomDestroyedAtMs === null
          ? null
          : Timestamp.fromMillis(summary.roomDestroyedAtMs),
        ...(summarySnapshot.exists ? {} : { createdAt: serverTimestamp }),
        updatedAt: serverTimestamp,
      }, { merge: true })
      return { duplicate: false }
    })

    response.status(200).json({ received: true, duplicate: result.duplicate })
  } catch (error) {
    if (error instanceof AttendanceWebhookError) {
      const permanent = isOnlineClassroomAttendancePermanentConflict(error.publicCode)
      logger.error('JaaS attendance event permanently ignored after safe binding audit', {
        disposition: permanent ? 'acknowledged-permanent-conflict' : 'retryable-conflict',
        reason: error.publicCode,
        eventType: event.eventType,
        room: opaqueRoomId,
        event: onlineClassroomJaasAttendanceEventDocumentId(event.idempotencyKey).slice(0, 21),
      })
      // These conflicts cannot become safe through blind provider retries
      // (legacy room without bookingId, duplicate alias, reassignment or an
      // idempotency collision). ACK after a structured Cloud Logging audit to
      // prevent an infinite retry storm while retaining a clear investigation
      // trail without exposing the raw room alias or participant identifiers.
      response.status(permanent ? 200 : 500).json(permanent
        ? { received: true, ignored: true, reason: error.publicCode }
        : { error: error.publicCode })
      return
    }
    logger.error('JaaS attendance webhook persistence failed', {
      eventType: event.eventType,
      room: opaqueRoomId,
      error: error instanceof Error ? error.message : String(error),
    })
    response.status(500).json({ error: 'persistence-failed' })
  }
})

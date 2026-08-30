import { createHash, randomUUID } from 'node:crypto'
import { FieldValue, Firestore, QueryDocumentSnapshot, Timestamp } from 'firebase-admin/firestore'
import { getFunctions } from 'firebase-admin/functions'
import { logger } from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onTaskDispatched } from 'firebase-functions/v2/tasks'
import {
  ONLINE_CLASSROOM_ROOMS_COLLECTION,
  isSafeClassroomId,
} from './onlineClassroom'
import {
  createOnlineClassroomJaasAdminJwt,
  onlineClassroomJaasConferenceFullName,
  resolveOnlineClassroomMeetingConfig,
} from './onlineClassroomJaas'
import {
  ONLINE_CLASSROOM_HARD_END_CLOSE_LEASE_MS,
  classifyOnlineClassroomJaasDestroyResponse,
  decideOnlineClassroomHardEndClaim,
  nextOnlineClassroomHardEndFailureState,
  onlineClassroomHardEndTaskId,
  planOnlineClassroomHardEndTask,
  sanitizeOnlineClassroomProviderResponseBody,
} from './onlineClassroomLifecycle'

const db = new Firestore()
const jaasPrivateKey = defineSecret('JAAS_PRIVATE_KEY')
const HARD_END_TASK_FUNCTION = 'closeOnlineClassroomAtHardEnd'
const HARD_END_TASK_REGION = 'asia-southeast1'
const HARD_END_SWEEP_LIMIT = 40
const HARD_END_SWEEP_PAGE_SIZE = 40
const HARD_END_SWEEP_MAX_SCANNED = 400

type HardEndTaskPayload = {
  sessionKey: string
  expectedHardEndMs: number
  scheduledDeliveryMs?: number
}

type LifecycleRoom = {
  roomName?: unknown
  hardEndsAt?: unknown
  state?: unknown
  closeAttemptId?: unknown
  closeLeaseExpiresAt?: unknown
  closeRetryAfter?: unknown
  closeFailureCount?: unknown
}

type HardEndClaim =
  | { status: 'missing' | 'ended' | 'busy' | 'stale' | 'retry-later' | 'quarantined' }
  | { status: 'future'; hardEndMs: number }
  | { status: 'claimed'; attemptId: string; roomName: string; hardEndMs: number }

function taskAlreadyExists(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = String((error as { code?: unknown }).code || '')
  return code === 'functions/task-already-exists'
    || code === 'task-already-exists'
    || code === 'already-exists'
    || code === '6'
}

function hardEndTaskId(sessionKey: string, hardEndMs: number, deliveryMs: number): string {
  const sessionKeyHash = createHash('sha256')
    .update(sessionKey, 'utf8')
    .digest('hex')
    .slice(0, 32)
  return onlineClassroomHardEndTaskId(sessionKeyHash, hardEndMs, deliveryMs)
}

/**
 * Register an exact, idempotent backend hard-end task. Long-range bookings use
 * deterministic checkpoints so they stay within Cloud Tasks' scheduling window.
 */
export async function enqueueOnlineClassroomHardEndTask(
  sessionKey: string,
  hardEndMs: number,
  previousDeliveryMs?: number,
): Promise<void> {
  if (!isSafeClassroomId(sessionKey)
    || !Number.isSafeInteger(hardEndMs)
    || hardEndMs <= 0
    || (previousDeliveryMs !== undefined
      && (!Number.isSafeInteger(previousDeliveryMs) || previousDeliveryMs <= 0))) {
    throw new Error('ONLINE_CLASSROOM_HARD_END_TASK_INVALID')
  }
  const nowMs = Date.now()
  const plan = planOnlineClassroomHardEndTask(hardEndMs, nowMs, previousDeliveryMs)
  if (!plan) throw new Error('ONLINE_CLASSROOM_HARD_END_TASK_PLAN_INVALID')
  const queue = getFunctions().taskQueue<HardEndTaskPayload>(
    `locations/${HARD_END_TASK_REGION}/functions/${HARD_END_TASK_FUNCTION}`,
  )
  try {
    await queue.enqueue({
      sessionKey,
      expectedHardEndMs: hardEndMs,
      scheduledDeliveryMs: plan.deliveryMs,
    }, {
      id: hardEndTaskId(sessionKey, hardEndMs, plan.deliveryMs),
      scheduleTime: new Date(plan.scheduleTimeMs),
      dispatchDeadlineSeconds: 30,
    })
  } catch (error) {
    if (!taskAlreadyExists(error)) throw error
  }
}

async function claimHardEnd(sessionKey: string, expectedHardEndMs?: number): Promise<HardEndClaim> {
  const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(sessionKey)
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(roomRef)
    const room = (snapshot.data() || {}) as LifecycleRoom
    const nowMs = Date.now()
    const hardEndMs = room.hardEndsAt instanceof Timestamp ? room.hardEndsAt.toMillis() : undefined
    const leaseExpiresAt = room.closeLeaseExpiresAt instanceof Timestamp
      ? room.closeLeaseExpiresAt.toMillis()
      : undefined
    const retryAfterMs = room.closeRetryAfter instanceof Timestamp
      ? room.closeRetryAfter.toMillis()
      : undefined
    const decision = decideOnlineClassroomHardEndClaim({
      exists: snapshot.exists,
      state: room.state,
      hardEndMs,
      closeLeaseExpiresAtMs: leaseExpiresAt,
      closeRetryAfterMs: retryAfterMs,
      expectedHardEndMs,
      nowMs,
    })
    if (decision === 'invalid') throw new Error('ONLINE_CLASSROOM_HARD_END_MISSING')
    if (decision === 'future') return { status: 'future', hardEndMs: hardEndMs! }
    if (decision !== 'claimable') return { status: decision }
    if (typeof room.roomName !== 'string'
      || !/^[A-Za-z0-9_-]{1,200}$/.test(room.roomName)) {
      throw new Error('ONLINE_CLASSROOM_ROOM_ALIAS_INVALID')
    }

    const attemptId = randomUUID()
    transaction.set(roomRef, {
      state: 'ending',
      closeAttemptId: attemptId,
      closeExpectedHardEndAt: room.hardEndsAt,
      closeClaimedAt: FieldValue.serverTimestamp(),
      closeLeaseExpiresAt: Timestamp.fromMillis(nowMs + ONLINE_CLASSROOM_HARD_END_CLOSE_LEASE_MS),
      closeRetryAfter: FieldValue.delete(),
      closeLastAttemptAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return { status: 'claimed', attemptId, roomName: room.roomName, hardEndMs: hardEndMs! }
  })
}

function lifecycleErrorCode(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'UNKNOWN'
  const safe = raw.replace(/[^A-Z0-9_-]/gi, '_').slice(0, 120)
  return safe || 'UNKNOWN'
}

async function releaseFailedClaim(sessionKey: string, attemptId: string, error: unknown): Promise<void> {
  const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(sessionKey)
  const outcome = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(roomRef)
    if (!snapshot.exists || snapshot.data()?.closeAttemptId !== attemptId) return null
    const room = snapshot.data() as LifecycleRoom
    const nowMs = Date.now()
    const failure = nextOnlineClassroomHardEndFailureState(room.closeFailureCount, nowMs)
    transaction.set(roomRef, {
      state: failure.quarantined ? 'close_failed' : 'scheduled',
      closeAttemptId: FieldValue.delete(),
      closeExpectedHardEndAt: FieldValue.delete(),
      closeClaimedAt: FieldValue.delete(),
      closeLeaseExpiresAt: FieldValue.delete(),
      closeFailureCount: failure.failureCount,
      closeLastErrorCode: lifecycleErrorCode(error),
      closeLastErrorAt: FieldValue.serverTimestamp(),
      closeRetryAfter: failure.retryAfterMs === null
        ? FieldValue.delete()
        : Timestamp.fromMillis(failure.retryAfterMs),
      closeQuarantinedAt: failure.quarantined ? FieldValue.serverTimestamp() : FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return failure
  })
  if (outcome?.quarantined) {
    logger.error('Online classroom hard-end moved to quarantine after repeated failures', {
      sessionKeyHash: createHash('sha256').update(sessionKey).digest('hex').slice(0, 16),
      failureCount: outcome.failureCount,
    })
  }
}

async function finishHardEnd(
  sessionKey: string,
  attemptId: string,
  hardEndMs: number,
  providerStatus: number,
): Promise<void> {
  const roomRef = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION).doc(sessionKey)
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(roomRef)
    if (!snapshot.exists || snapshot.data()?.closeAttemptId !== attemptId) return
    const persistedHardEnd = snapshot.data()?.hardEndsAt
    if (!(persistedHardEnd instanceof Timestamp) || persistedHardEnd.toMillis() !== hardEndMs) {
      throw new Error('ONLINE_CLASSROOM_HARD_END_CHANGED_DURING_CLOSE')
    }
    transaction.set(roomRef, {
      state: 'ended',
      endedAt: FieldValue.serverTimestamp(),
      hardEndClosedAt: FieldValue.serverTimestamp(),
      hardEndProviderStatus: providerStatus,
      closeAttemptId: FieldValue.delete(),
      closeExpectedHardEndAt: FieldValue.delete(),
      closeClaimedAt: FieldValue.delete(),
      closeLeaseExpiresAt: FieldValue.delete(),
      closeRetryAfter: FieldValue.delete(),
      closeFailureCount: FieldValue.delete(),
      closeLastErrorCode: FieldValue.delete(),
      closeLastErrorAt: FieldValue.delete(),
      closeQuarantinedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  })
}

async function executeOnlineClassroomHardEnd(
  sessionKey: string,
  privateKey: string,
  expectedHardEndMs?: number,
  previousDeliveryMs?: number,
): Promise<HardEndClaim['status']> {
  const claim = await claimHardEnd(sessionKey, expectedHardEndMs)
  if (claim.status === 'future') {
    await enqueueOnlineClassroomHardEndTask(sessionKey, claim.hardEndMs, previousDeliveryMs)
    return claim.status
  }
  if (claim.status !== 'claimed') return claim.status

  try {
    const meetingConfig = resolveOnlineClassroomMeetingConfig({
      appId: process.env.CLASSROOM_JAAS_APP_ID,
      kid: process.env.CLASSROOM_JAAS_KID,
      privateKey,
    })
    if (meetingConfig.meetingProvider !== 'jaas') {
      throw new Error('ONLINE_CLASSROOM_JAAS_REQUIRED_FOR_HARD_END')
    }
    const jwt = createOnlineClassroomJaasAdminJwt({ config: meetingConfig })
    const conferenceFullName = onlineClassroomJaasConferenceFullName(meetingConfig, claim.roomName)
    const response = await fetch('https://8x8.vc/v1/_jaas/conference-commands/v1/meeting', {
      method: 'POST',
      headers: {
        accept: '*/*',
        authorization: `Bearer ${jwt}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'DESTROY',
        payload: { conferenceFullName },
      }),
      signal: AbortSignal.timeout(10_000),
    })
    const providerDecision = classifyOnlineClassroomJaasDestroyResponse(response.status)
    if (providerDecision === 'failed') {
      const providerBody = sanitizeOnlineClassroomProviderResponseBody(
        await response.text().catch(() => ''),
      )
      logger.error('Online classroom JaaS destroy request failed', {
        sessionKeyHash: createHash('sha256').update(sessionKey).digest('hex').slice(0, 16),
        providerStatus: response.status,
        ...(providerBody ? { providerBody } : {}),
      })
      throw new Error(`ONLINE_CLASSROOM_JAAS_DESTROY_FAILED_${response.status}`)
    }
    await finishHardEnd(sessionKey, claim.attemptId, claim.hardEndMs, response.status)
    return 'ended'
  } catch (error) {
    await releaseFailedClaim(sessionKey, claim.attemptId, error).catch(() => undefined)
    throw error
  }
}

export const closeOnlineClassroomAtHardEnd = onTaskDispatched<HardEndTaskPayload>({
  region: HARD_END_TASK_REGION,
  timeoutSeconds: 30,
  memory: '256MiB',
  maxInstances: 10,
  retryConfig: {
    maxAttempts: 8,
    minBackoffSeconds: 5,
    maxBackoffSeconds: 60,
    maxDoublings: 3,
  },
  rateLimits: { maxConcurrentDispatches: 10, maxDispatchesPerSecond: 10 },
  secrets: [jaasPrivateKey],
}, async (request) => {
  const { sessionKey, expectedHardEndMs, scheduledDeliveryMs } = request.data || {}
  if (!isSafeClassroomId(sessionKey)
    || !Number.isSafeInteger(expectedHardEndMs)
    || Number(expectedHardEndMs) <= 0
    || (scheduledDeliveryMs !== undefined
      && (!Number.isSafeInteger(scheduledDeliveryMs) || Number(scheduledDeliveryMs) <= 0))) {
    throw new Error('ONLINE_CLASSROOM_HARD_END_TASK_INVALID')
  }
  const result = await executeOnlineClassroomHardEnd(
    sessionKey,
    jaasPrivateKey.value(),
    Number(expectedHardEndMs),
    scheduledDeliveryMs === undefined ? undefined : Number(scheduledDeliveryMs),
  )
  logger.info('Online classroom hard-end task completed', {
    sessionKeyHash: createHash('sha256').update(sessionKey).digest('hex').slice(0, 16),
    expectedHardEndMs,
    result,
  })
})

async function loadHardEndSweepCandidateIds(nowMs: number): Promise<{
  ids: string[]
  scanned: number
  exhausted: boolean
}> {
  const ids: string[] = []
  let scanned = 0
  let cursor: QueryDocumentSnapshot | undefined
  let exhausted = false
  while (ids.length < HARD_END_SWEEP_LIMIT && scanned < HARD_END_SWEEP_MAX_SCANNED) {
    let query = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION)
      .where('state', 'in', ['scheduled', 'ending'])
      .where('hardEndsAt', '<=', Timestamp.fromMillis(nowMs))
      .orderBy('hardEndsAt', 'asc')
      .limit(HARD_END_SWEEP_PAGE_SIZE)
    if (cursor) query = query.startAfter(cursor)
    const snapshot = await query.get()
    if (snapshot.empty) {
      exhausted = true
      break
    }
    for (const roomSnapshot of snapshot.docs) {
      scanned += 1
      const room = roomSnapshot.data() as LifecycleRoom
      const decision = decideOnlineClassroomHardEndClaim({
        exists: true,
        state: room.state,
        hardEndMs: room.hardEndsAt instanceof Timestamp ? room.hardEndsAt.toMillis() : undefined,
        closeLeaseExpiresAtMs: room.closeLeaseExpiresAt instanceof Timestamp
          ? room.closeLeaseExpiresAt.toMillis()
          : undefined,
        closeRetryAfterMs: room.closeRetryAfter instanceof Timestamp
          ? room.closeRetryAfter.toMillis()
          : undefined,
        nowMs,
      })
      if (decision === 'claimable') ids.push(roomSnapshot.id)
      if (ids.length >= HARD_END_SWEEP_LIMIT || scanned >= HARD_END_SWEEP_MAX_SCANNED) break
    }
    cursor = snapshot.docs.at(-1)
    if (snapshot.size < HARD_END_SWEEP_PAGE_SIZE) {
      exhausted = true
      break
    }
  }
  return { ids, scanned, exhausted }
}

/** Recovery layer for a missing task or a worker that died after claiming. */
export const sweepOnlineClassroomHardEnds = onSchedule({
  region: HARD_END_TASK_REGION,
  schedule: 'every 1 minutes',
  timeZone: 'Asia/Ho_Chi_Minh',
  timeoutSeconds: 60,
  memory: '256MiB',
  secrets: [jaasPrivateKey],
}, async () => {
  const candidates = await loadHardEndSweepCandidateIds(Date.now())
  const results = await Promise.allSettled(candidates.ids.map((sessionKey) => (
    // The recovery sweep intentionally has no expected hard end fence: it reads
    // the current persisted deadline and can recover the task created by an extension.
    executeOnlineClassroomHardEnd(sessionKey, jaasPrivateKey.value())
  )))
  const failed = results.filter((result) => result.status === 'rejected')
  if (failed.length > 0) {
    logger.error('Online classroom hard-end sweep had failures', {
      scanned: candidates.scanned,
      attempted: candidates.ids.length,
      failed: failed.length,
    })
  }
  if (!candidates.exhausted && candidates.scanned >= HARD_END_SWEEP_MAX_SCANNED) {
    logger.warn('Online classroom hard-end sweep scan cap reached', {
      scanned: candidates.scanned,
      attempted: candidates.ids.length,
    })
  }
})

export const ONLINE_CLASSROOM_HARD_END_TASK_MAX_SCHEDULE_AHEAD_MS = 28 * 24 * 60 * 60 * 1000
export const ONLINE_CLASSROOM_HARD_END_CLOSE_LEASE_MS = 60_000
export const ONLINE_CLASSROOM_HARD_END_QUARANTINE_AFTER_FAILURES = 12

const ONLINE_CLASSROOM_HARD_END_MIN_RETRY_MS = 5_000
const ONLINE_CLASSROOM_HARD_END_MAX_RETRY_MS = 15 * 60_000

export type OnlineClassroomHardEndClaimDecision =
  | 'missing'
  | 'invalid'
  | 'stale'
  | 'ended'
  | 'future'
  | 'busy'
  | 'retry-later'
  | 'quarantined'
  | 'claimable'

export type OnlineClassroomHardEndClaimInput = {
  exists: boolean
  state?: unknown
  hardEndMs?: unknown
  closeLeaseExpiresAtMs?: unknown
  closeRetryAfterMs?: unknown
  expectedHardEndMs?: number
  nowMs: number
}

export type OnlineClassroomHardEndTaskPlan = {
  deliveryMs: number
  scheduleTimeMs: number
}

/**
 * Pure decision helper shared by the task and the recovery sweep. Supplying an
 * expected hard end turns the request into a fenced task: a task created before
 * a legitimate extension becomes a stale no-op instead of closing the new room.
 */
export function decideOnlineClassroomHardEndClaim(
  input: OnlineClassroomHardEndClaimInput,
): OnlineClassroomHardEndClaimDecision {
  if (!input.exists) return 'missing'
  if (!Number.isSafeInteger(input.nowMs)
    || !Number.isSafeInteger(input.hardEndMs)
    || Number(input.hardEndMs) <= 0) return 'invalid'

  const hardEndMs = Number(input.hardEndMs)
  if (input.expectedHardEndMs !== undefined
    && (!Number.isSafeInteger(input.expectedHardEndMs)
      || input.expectedHardEndMs <= 0
      || input.expectedHardEndMs !== hardEndMs)) return 'stale'
  if (input.state === 'ended') return 'ended'
  if (input.nowMs < hardEndMs) return 'future'
  if (input.state === 'close_failed') return 'quarantined'
  if (input.state === 'ending'
    && Number.isSafeInteger(input.closeLeaseExpiresAtMs)
    && Number(input.closeLeaseExpiresAtMs) > input.nowMs) return 'busy'
  if (Number.isSafeInteger(input.closeRetryAfterMs)
    && Number(input.closeRetryAfterMs) > input.nowMs) return 'retry-later'
  return 'claimable'
}

function anchoredDeliveryMs(hardEndMs: number, nowMs: number): number {
  const distanceMs = hardEndMs - nowMs
  if (distanceMs <= ONLINE_CLASSROOM_HARD_END_TASK_MAX_SCHEDULE_AHEAD_MS) return hardEndMs
  const checkpointCount = Math.ceil(
    distanceMs / ONLINE_CLASSROOM_HARD_END_TASK_MAX_SCHEDULE_AHEAD_MS,
  ) - 1
  return hardEndMs - checkpointCount * ONLINE_CLASSROOM_HARD_END_TASK_MAX_SCHEDULE_AHEAD_MS
}

/**
 * Plan a deterministic checkpoint. `previousDeliveryMs` is carried in the task
 * payload, so an early checkpoint can never enqueue itself with the same ID.
 */
export function planOnlineClassroomHardEndTask(
  hardEndMs: number,
  nowMs: number,
  previousDeliveryMs?: number,
): OnlineClassroomHardEndTaskPlan | null {
  if (!Number.isSafeInteger(hardEndMs)
    || hardEndMs <= 0
    || !Number.isSafeInteger(nowMs)
    || nowMs <= 0
    || (previousDeliveryMs !== undefined
      && (!Number.isSafeInteger(previousDeliveryMs) || previousDeliveryMs <= 0))) return null

  let deliveryMs = anchoredDeliveryMs(hardEndMs, nowMs)
  if (previousDeliveryMs !== undefined && previousDeliveryMs < hardEndMs && deliveryMs <= previousDeliveryMs) {
    deliveryMs = Math.min(
      hardEndMs,
      previousDeliveryMs + ONLINE_CLASSROOM_HARD_END_TASK_MAX_SCHEDULE_AHEAD_MS,
    )
  }
  if (previousDeliveryMs !== undefined && deliveryMs <= previousDeliveryMs) {
    // The provider clock can dispatch the final task a fraction early. Give that
    // retry a distinct delivery fence/ID instead of swallowing it as a duplicate.
    deliveryMs = previousDeliveryMs + 1_000
    if (deliveryMs - nowMs > ONLINE_CLASSROOM_HARD_END_TASK_MAX_SCHEDULE_AHEAD_MS) return null
  }
  return {
    deliveryMs,
    scheduleTimeMs: Math.max(nowMs + 1_000, deliveryMs),
  }
}

export function onlineClassroomHardEndTaskId(
  sessionKeyHash: string,
  hardEndMs: number,
  deliveryMs: number,
): string {
  return `classroom-${sessionKeyHash}-${hardEndMs.toString(36)}-${deliveryMs.toString(36)}`
}

export type OnlineClassroomJaasDestroyResponseDecision = 'closed' | 'already-closed' | 'failed'

export function classifyOnlineClassroomJaasDestroyResponse(
  status: number,
): OnlineClassroomJaasDestroyResponseDecision {
  if (Number.isInteger(status) && status >= 200 && status < 300) return 'closed'
  if (status === 404) return 'already-closed'
  return 'failed'
}

/** Keep provider diagnostics useful without retaining credentials or identity. */
export function sanitizeOnlineClassroomProviderResponseBody(body: unknown): string {
  if (typeof body !== 'string' || body.length === 0) return ''
  return body
    .slice(0, 4_000)
    .replace(/bearer\s+[^\s,"'}]+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[REDACTED_JWT]')
    .replace(/("(?:authorization|token|jwt|secret|private[_-]?key)"\s*:\s*")[^"]*(")/gi, '$1[REDACTED]$2')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 500)
}

export function onlineClassroomHardEndFailureBackoffMs(failureCount: number): number {
  if (!Number.isSafeInteger(failureCount) || failureCount <= 0) {
    return ONLINE_CLASSROOM_HARD_END_MIN_RETRY_MS
  }
  return Math.min(
    ONLINE_CLASSROOM_HARD_END_MAX_RETRY_MS,
    ONLINE_CLASSROOM_HARD_END_MIN_RETRY_MS * (2 ** Math.min(10, failureCount - 1)),
  )
}

export function normalizeOnlineClassroomHardEndFailureCount(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0
}

export function nextOnlineClassroomHardEndFailureState(
  currentFailureCount: unknown,
  nowMs: number,
): {
  failureCount: number
  quarantined: boolean
  retryAfterMs: number | null
} {
  const failureCount = normalizeOnlineClassroomHardEndFailureCount(currentFailureCount) + 1
  const quarantined = failureCount >= ONLINE_CLASSROOM_HARD_END_QUARANTINE_AFTER_FAILURES
  return {
    failureCount,
    quarantined,
    retryAfterMs: quarantined
      ? null
      : nowMs + onlineClassroomHardEndFailureBackoffMs(failureCount),
  }
}

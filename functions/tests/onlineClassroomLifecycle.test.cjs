const test = require('node:test')
const assert = require('node:assert/strict')

const {
  ONLINE_CLASSROOM_HARD_END_CLOSE_LEASE_MS,
  ONLINE_CLASSROOM_HARD_END_TASK_MAX_SCHEDULE_AHEAD_MS,
  classifyOnlineClassroomJaasDestroyResponse,
  decideOnlineClassroomHardEndClaim,
  nextOnlineClassroomHardEndFailureState,
  normalizeOnlineClassroomHardEndFailureCount,
  onlineClassroomHardEndFailureBackoffMs,
  onlineClassroomHardEndTaskId,
  planOnlineClassroomHardEndTask,
  sanitizeOnlineClassroomProviderResponseBody,
} = require('../lib/onlineClassroomLifecycle.js')

test('task cũ trở thành stale sau khi phòng được gia hạn, sweep vẫn đọc mốc hiện tại', () => {
  const oldHardEndMs = Date.parse('2026-08-29T10:00:00.000Z')
  const extendedHardEndMs = oldHardEndMs + 10 * 60_000
  const nowMs = oldHardEndMs + 1_000

  assert.equal(decideOnlineClassroomHardEndClaim({
    exists: true,
    state: 'scheduled',
    hardEndMs: extendedHardEndMs,
    expectedHardEndMs: oldHardEndMs,
    nowMs,
  }), 'stale')
  assert.equal(decideOnlineClassroomHardEndClaim({
    exists: true,
    state: 'scheduled',
    hardEndMs: extendedHardEndMs,
    nowMs,
  }), 'future')
  assert.equal(decideOnlineClassroomHardEndClaim({
    exists: true,
    state: 'scheduled',
    hardEndMs: extendedHardEndMs,
    nowMs: extendedHardEndMs,
  }), 'claimable')
})

test('lease và retry fence chặn worker đè nhau nhưng lease hết hạn được recovery', () => {
  const nowMs = Date.parse('2026-08-29T10:00:00.000Z')
  const base = { exists: true, hardEndMs: nowMs - 1, nowMs }

  assert.equal(decideOnlineClassroomHardEndClaim({
    ...base,
    state: 'ending',
    closeLeaseExpiresAtMs: nowMs + ONLINE_CLASSROOM_HARD_END_CLOSE_LEASE_MS,
  }), 'busy')
  assert.equal(decideOnlineClassroomHardEndClaim({
    ...base,
    state: 'ending',
    closeLeaseExpiresAtMs: nowMs,
  }), 'claimable')
  assert.equal(decideOnlineClassroomHardEndClaim({
    ...base,
    state: 'scheduled',
    closeRetryAfterMs: nowMs + 5_000,
  }), 'retry-later')
  assert.equal(decideOnlineClassroomHardEndClaim({
    ...base,
    state: 'close_failed',
  }), 'quarantined')
  assert.equal(decideOnlineClassroomHardEndClaim({
    ...base,
    state: 'ended',
  }), 'ended')
})

test('chỉ 2xx và 404 được xem là đóng phòng idempotent; 409 phải retry', () => {
  assert.equal(classifyOnlineClassroomJaasDestroyResponse(200), 'closed')
  assert.equal(classifyOnlineClassroomJaasDestroyResponse(204), 'closed')
  assert.equal(classifyOnlineClassroomJaasDestroyResponse(404), 'already-closed')
  assert.equal(classifyOnlineClassroomJaasDestroyResponse(400), 'failed')
  assert.equal(classifyOnlineClassroomJaasDestroyResponse(401), 'failed')
  assert.equal(classifyOnlineClassroomJaasDestroyResponse(409), 'failed')
  assert.equal(classifyOnlineClassroomJaasDestroyResponse(500), 'failed')
})

test('body lỗi provider được rút gọn và xóa credential, JWT, email', () => {
  const jwt = `eyJ${'a'.repeat(20)}.${'b'.repeat(20)}.${'c'.repeat(20)}`
  const sanitized = sanitizeOnlineClassroomProviderResponseBody(JSON.stringify({
    authorization: `Bearer secret-access-token`,
    token: 'private-token-value',
    jwt,
    owner: 'student@example.com',
    detail: 'x'.repeat(1_000),
  }))
  assert.doesNotMatch(sanitized, /secret-access-token|private-token-value|student@example\.com|eyJ/)
  assert.match(sanitized, /REDACTED/)
  assert.ok(sanitized.length <= 500)
})

test('checkpoint luôn tiến tới trước và không tự dùng lại task ID khi chạy sớm', () => {
  const dayMs = 24 * 60 * 60 * 1_000
  const nowMs = Date.parse('2026-08-29T00:00:00.000Z')
  const hardEndMs = nowMs + 70 * dayMs
  const initial = planOnlineClassroomHardEndTask(hardEndMs, nowMs)
  assert.ok(initial)
  assert.ok(initial.deliveryMs > nowMs)
  assert.ok(initial.deliveryMs - nowMs <= ONLINE_CLASSROOM_HARD_END_TASK_MAX_SCHEDULE_AHEAD_MS)
  assert.deepEqual(planOnlineClassroomHardEndTask(hardEndMs, nowMs), initial)

  const earlyNowMs = initial.deliveryMs - 500
  const next = planOnlineClassroomHardEndTask(hardEndMs, earlyNowMs, initial.deliveryMs)
  assert.ok(next)
  assert.ok(next.deliveryMs > initial.deliveryMs)
  assert.notEqual(
    onlineClassroomHardEndTaskId('session-hash', hardEndMs, initial.deliveryMs),
    onlineClassroomHardEndTaskId('session-hash', hardEndMs, next.deliveryMs),
  )

  let checkpoint = next
  let iterations = 0
  while (checkpoint.deliveryMs < hardEndMs) {
    const following = planOnlineClassroomHardEndTask(hardEndMs, checkpoint.deliveryMs, checkpoint.deliveryMs)
    assert.ok(following)
    assert.ok(following.deliveryMs > checkpoint.deliveryMs)
    checkpoint = following
    iterations += 1
    assert.ok(iterations < 10)
  }
  assert.equal(checkpoint.deliveryMs, hardEndMs)
})

test('task cuối chạy sớm tạo retry ID mới sau hard end thay vì trùng chính nó', () => {
  const nowMs = Date.parse('2026-08-29T00:00:00.000Z')
  const hardEndMs = nowMs + 10_000
  const finalTask = planOnlineClassroomHardEndTask(hardEndMs, nowMs)
  assert.ok(finalTask)
  assert.equal(finalTask.deliveryMs, hardEndMs)

  const retry = planOnlineClassroomHardEndTask(hardEndMs, hardEndMs - 1, finalTask.deliveryMs)
  assert.ok(retry)
  assert.ok(retry.deliveryMs > finalTask.deliveryMs)
  assert.notEqual(
    onlineClassroomHardEndTaskId('session-hash', hardEndMs, finalTask.deliveryMs),
    onlineClassroomHardEndTaskId('session-hash', hardEndMs, retry.deliveryMs),
  )
})

test('failure metadata dùng backoff hữu hạn và dữ liệu legacy an toàn', () => {
  assert.equal(normalizeOnlineClassroomHardEndFailureCount(undefined), 0)
  assert.equal(normalizeOnlineClassroomHardEndFailureCount(-1), 0)
  assert.equal(normalizeOnlineClassroomHardEndFailureCount(3), 3)
  assert.equal(onlineClassroomHardEndFailureBackoffMs(1), 5_000)
  assert.ok(onlineClassroomHardEndFailureBackoffMs(8) > onlineClassroomHardEndFailureBackoffMs(1))
  assert.equal(onlineClassroomHardEndFailureBackoffMs(99), 15 * 60_000)

  const retry = nextOnlineClassroomHardEndFailureState(0, 10_000)
  assert.deepEqual(retry, { failureCount: 1, quarantined: false, retryAfterMs: 15_000 })
  const quarantine = nextOnlineClassroomHardEndFailureState(11, 10_000)
  assert.deepEqual(quarantine, { failureCount: 12, quarantined: true, retryAfterMs: null })
})

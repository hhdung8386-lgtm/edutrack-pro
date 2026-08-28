const test = require('node:test')
const assert = require('node:assert/strict')

const {
  ONLINE_CLASSROOM_GIFT_MIN_INTERVAL_MS,
  ONLINE_CLASSROOM_GIFT_RATE_WINDOW_MAX,
  decideOnlineClassroomGiftRate,
} = require('../lib/onlineClassroomGift.js')

test('clock rollback không reset hoặc làm mất bộ đếm rate limit', () => {
  const storedNowMs = 10_000
  const current = {
    windowStartedAtMs: storedNowMs,
    sentInWindow: ONLINE_CLASSROOM_GIFT_RATE_WINDOW_MAX,
    lastSentAtMs: storedNowMs,
  }
  const decision = decideOnlineClassroomGiftRate(current, storedNowMs - 5_000)

  assert.equal(decision.allowed, false)
  assert.ok(decision.retryAfterMs >= ONLINE_CLASSROOM_GIFT_MIN_INTERVAL_MS)
  assert.deepEqual(decision.nextState, current)
})

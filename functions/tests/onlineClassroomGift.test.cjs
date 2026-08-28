const test = require('node:test')
const assert = require('node:assert/strict')

const {
  ONLINE_CLASSROOM_GIFT_DISCOVERY_WINDOW_MS,
  ONLINE_CLASSROOM_GIFT_MIN_INTERVAL_MS,
  ONLINE_CLASSROOM_GIFT_RATE_WINDOW_MAX,
  ONLINE_CLASSROOM_GIFT_RATE_WINDOW_MS,
  canSendOnlineClassroomGift,
  createOnlineClassroomGiftEvent,
  decideOnlineClassroomGiftRate,
  isOnlineClassroomGiftClientRequestId,
  isOnlineClassroomGiftEventId,
  isOnlineClassroomGiftType,
  onlineClassroomGiftEventId,
  onlineClassroomGiftRequestFingerprint,
  validateOnlineClassroomGiftEvent,
} = require('../lib/onlineClassroomGift.js')

const nowMs = Date.parse('2026-08-28T08:00:00.000Z')
const eventId = onlineClassroomGiftEventId(
  'session-123',
  'teacher:teacher-123',
  'request-1234567890',
)

test('chỉ Admin và gia sư có quyền gửi quà cosmetic', () => {
  assert.equal(canSendOnlineClassroomGift('admin'), true)
  assert.equal(canSendOnlineClassroomGift('teacher'), true)
  assert.equal(canSendOnlineClassroomGift('student'), false)
  assert.equal(canSendOnlineClassroomGift('teacher_manager'), false)
  assert.equal(canSendOnlineClassroomGift(undefined), false)
})

test('catalog và mã thao tác chỉ nhận schema cố định', () => {
  assert.equal(isOnlineClassroomGiftType('gold-star'), true)
  assert.equal(isOnlineClassroomGiftType('diamond'), false)
  assert.equal(isOnlineClassroomGiftClientRequestId('request-1234567890'), true)
  assert.equal(isOnlineClassroomGiftClientRequestId('short'), false)
  assert.equal(isOnlineClassroomGiftEventId(eventId), true)
  assert.equal(isOnlineClassroomGiftEventId('../gift'), false)
})

test('event id idempotent theo đúng session, actor và client request', () => {
  assert.equal(
    eventId,
    onlineClassroomGiftEventId('session-123', 'teacher:teacher-123', 'request-1234567890'),
  )
  assert.notEqual(
    eventId,
    onlineClassroomGiftEventId('session-123', 'teacher:teacher-other', 'request-1234567890'),
  )
  assert.notEqual(
    eventId,
    onlineClassroomGiftEventId('session-other', 'teacher:teacher-123', 'request-1234567890'),
  )
  assert.equal(onlineClassroomGiftRequestFingerprint('rocket').length, 64)
  assert.notEqual(
    onlineClassroomGiftRequestFingerprint('rocket'),
    onlineClassroomGiftRequestFingerprint('gold-star'),
  )
})

test('rate limit chặn spam nhanh và mở lại đúng cửa sổ', () => {
  const first = decideOnlineClassroomGiftRate(null, nowMs)
  assert.equal(first.allowed, true)
  assert.equal(first.nextState.sentInWindow, 1)

  const tooFast = decideOnlineClassroomGiftRate(first.nextState, nowMs + ONLINE_CLASSROOM_GIFT_MIN_INTERVAL_MS - 1)
  assert.equal(tooFast.allowed, false)
  assert.equal(tooFast.retryAfterMs, 1)
  assert.deepEqual(tooFast.nextState, first.nextState)

  let state = first.nextState
  for (let index = 1; index < ONLINE_CLASSROOM_GIFT_RATE_WINDOW_MAX; index += 1) {
    const decision = decideOnlineClassroomGiftRate(state, nowMs + index * ONLINE_CLASSROOM_GIFT_MIN_INTERVAL_MS)
    assert.equal(decision.allowed, true)
    state = decision.nextState
  }
  const exhausted = decideOnlineClassroomGiftRate(
    state,
    nowMs + ONLINE_CLASSROOM_GIFT_RATE_WINDOW_MAX * ONLINE_CLASSROOM_GIFT_MIN_INTERVAL_MS,
  )
  assert.equal(exhausted.allowed, false)
  assert.ok(exhausted.retryAfterMs > 0)

  const reset = decideOnlineClassroomGiftRate(state, nowMs + ONLINE_CLASSROOM_GIFT_RATE_WINDOW_MS)
  assert.equal(reset.allowed, true)
  assert.equal(reset.nextState.sentInWindow, 1)
})

test('event do backend tạo chỉ chứa nội dung khen thưởng cố định', () => {
  const event = createOnlineClassroomGiftEvent({
    id: eventId,
    giftType: 'champion-cup',
    senderRole: 'teacher',
    senderName: '  Ms. Yến  ',
    recipientName: '  Học viên A  ',
    createdAtMs: nowMs,
  })
  assert.equal(event.senderName, 'Ms. Yến')
  assert.equal(event.recipientName, 'Học viên A')
  assert.equal(event.title, 'Cúp chinh phục')
  assert.equal(event.displayUntilMs, nowMs + ONLINE_CLASSROOM_GIFT_DISCOVERY_WINDOW_MS)
  assert.deepEqual(validateOnlineClassroomGiftEvent(event), event)

  assert.equal(validateOnlineClassroomGiftEvent({ ...event, diamonds: 10 }), null)
  assert.equal(validateOnlineClassroomGiftEvent({ ...event, title: 'Nạp tiền' }), null)
  assert.equal(validateOnlineClassroomGiftEvent({ ...event, senderRole: 'student' }), null)
  assert.equal(validateOnlineClassroomGiftEvent({ ...event, displayUntilMs: event.displayUntilMs + 1 }), null)
})

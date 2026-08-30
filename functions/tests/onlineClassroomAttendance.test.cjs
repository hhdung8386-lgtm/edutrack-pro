const test = require('node:test')
const assert = require('node:assert/strict')
const { createHmac } = require('node:crypto')

const {
  decideOnlineClassroomJaasAttendanceIdempotency,
  isOnlineClassroomAttendancePermanentConflict,
  mergeOnlineClassroomAttendanceSessionHistory,
  normalizeOnlineClassroomAttendanceEffectiveSession,
  onlineClassroomJaasAttendanceEventDocumentId,
  onlineClassroomJaasAttendanceEventFingerprint,
  normalizeOnlineClassroomAttendanceSummary,
  parseOnlineClassroomAttendanceRoomBinding,
  parseOnlineClassroomJaasAttendanceEvent,
  parseOnlineClassroomJaasFqn,
  projectOnlineClassroomAttendanceSummary,
  reduceOnlineClassroomAttendanceSummary,
  resolveOnlineClassroomAttendanceParticipantRole,
  shouldUseOnlineClassroomAttendanceEffectiveSession,
  verifyOnlineClassroomJaasWebhookSignature,
} = require('../lib/onlineClassroomAttendance.js')
const { pseudonymousJaasUserId } = require('../lib/onlineClassroomJaas.js')

const APP_ID = 'vpaas-magic-cookie-96f0941768964ab380ed0fbada7a502f'
const ROOM_ALIAS = '123EnglishPilot0123456789abcdef0123456789abcdef0123456789abcdef'
const FQN = `${APP_ID}/${ROOM_ALIAS}`
const binding = {
  bookingId: 'booking-a',
  sessionKey: 'session-key-a',
  roomName: ROOM_ALIAS,
  teacherId: 'teacher-a',
  studentId: 'student-a',
}

function webhookEvent(eventType, timestamp, data = {}, overrides = {}) {
  return {
    eventType,
    idempotencyKey: `event-${String(timestamp).padStart(8, '0')}-${eventType.toLowerCase()}`,
    sessionId: 'jaas-session-00000001',
    timestamp,
    fqn: FQN,
    appId: APP_ID,
    roomAlias: ROOM_ALIAS,
    data: { isBreakout: false, ...data },
    ...overrides,
  }
}

function signedHeader(secret, timestampSeconds, rawBody) {
  const digest = createHmac('sha256', secret)
    .update(`${timestampSeconds}.`, 'utf8')
    .update(rawBody)
    .digest('base64')
  return `t=${timestampSeconds},v1=${digest}`
}

test('xác minh đúng mẫu HMAC-SHA256 raw body chính thức của JaaS', () => {
  // Sample published at developer.8x8.com/jaas/docs/webhooks-signatures.
  const rawBody = Buffer.from('{"eventType":"PARTICIPANT_JOINED","sessionId":"9a441d60-ceaf-4eba-b0a8-a7d940a76e1b","timestamp":1632490058278,"fqn":"vpaas-magic-cookie-96f0941768964ab380ed0fbada7a502f/sampleappromanticshiftsstripas","idempotencyKey":"9e9e7420-562d-4659-8e22-44b9b22aaa49","customerId":"96f0941768964ab380ed0fbada7a502f","appId":"vpaas-magic-cookie-96f0941768964ab380ed0fbada7a502f","data":{"avatar":"","name":"Test User","id":"auth0|5f903d7a77f3b4006eb8e67d","participantJid":"fc1ea14a-9bca-4218-a563-8c627e803d56@8x8.vc","moderator":true,"email":"test.user@company.com"}}')
  const result = verifyOnlineClassroomJaasWebhookSignature({
    secret: 'whsec_9635df66714a4cf088ee9d0979dd3bf6',
    signatureHeader: 't=1632490060,v1=xlzqEojlh4qb21sQpXYsWgyK8x9HVpz+RQldsv18rV0=',
    rawBody,
    nowMs: 1_632_490_060_000,
  })
  assert.deepEqual(result, { ok: true, timestampSeconds: 1_632_490_060 })
})

test('chữ ký không cho sửa JSON, replay quá hạn hoặc header mơ hồ', () => {
  const secret = 'whsec_test_attendance'
  const timestampSeconds = 1_800_000_000
  const rawBody = Buffer.from('{"eventType":"ROOM_CREATED"}')
  const header = signedHeader(secret, timestampSeconds, rawBody)
  assert.equal(verifyOnlineClassroomJaasWebhookSignature({
    secret,
    signatureHeader: header,
    rawBody,
    nowMs: timestampSeconds * 1000,
  }).ok, true)
  assert.deepEqual(verifyOnlineClassroomJaasWebhookSignature({
    secret,
    signatureHeader: header,
    rawBody: Buffer.from('{"eventType":"ROOM_DESTROYED"}'),
    nowMs: timestampSeconds * 1000,
  }), { ok: false, reason: 'signature-mismatch' })
  assert.deepEqual(verifyOnlineClassroomJaasWebhookSignature({
    secret,
    signatureHeader: header,
    rawBody,
    nowMs: (timestampSeconds + 301) * 1000,
  }), { ok: false, reason: 'signature-timestamp-outside-tolerance' })
  assert.deepEqual(verifyOnlineClassroomJaasWebhookSignature({
    secret,
    signatureHeader: `${header},t=${timestampSeconds}`,
    rawBody,
    nowMs: timestampSeconds * 1000,
  }), { ok: false, reason: 'signature-header-invalid' })
})

test('fqn chỉ nhận đúng AppID và một room alias an toàn', () => {
  assert.deepEqual(parseOnlineClassroomJaasFqn(FQN, APP_ID), {
    ok: true,
    appId: APP_ID,
    roomAlias: ROOM_ALIAS,
    fqn: FQN,
  })
  assert.equal(parseOnlineClassroomJaasFqn(`${FQN}/breakout`, APP_ID).ok, false)
  assert.deepEqual(parseOnlineClassroomJaasFqn(
    `vpaas-magic-cookie-aaaaaaaaaaaaaaaa/${ROOM_ALIAS}`,
    APP_ID,
  ), { ok: false, reason: 'fqn-not-allowed' })
  assert.equal(parseOnlineClassroomJaasFqn(`${APP_ID}/room name`, APP_ID).ok, false)
})

test('parser chỉ giữ dữ liệu history cần thiết và bỏ PII tên/email/avatar', () => {
  const payload = JSON.stringify({
    eventType: 'PARTICIPANT_JOINED_LOBBY',
    idempotencyKey: 'event-request-00000001',
    sessionId: 'jaas-session-00000001',
    timestamp: 1_800_000_000_100,
    fqn: FQN,
    appId: APP_ID,
    customerId: 'customer-private',
    data: {
      id: 'jaas-user-id',
      participantId: 'participant-id',
      participantJid: 'participant@8x8.vc',
      moderator: 'false',
      name: 'Không được lưu',
      email: 'private@example.com',
      avatar: 'https://private.example/avatar.png',
    },
  })
  const parsed = parseOnlineClassroomJaasAttendanceEvent(payload, APP_ID)
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.event.data, {
    id: 'jaas-user-id',
    participantId: 'participant-id',
    participantJid: 'participant@8x8.vc',
    moderator: false,
    isBreakout: false,
  })
  assert.equal(JSON.stringify(parsed).includes('private@example.com'), false)
  assert.deepEqual(parseOnlineClassroomJaasAttendanceEvent(JSON.stringify({
    ...JSON.parse(payload),
    eventType: 'SPEAKER_STATS',
  }), APP_ID), { ok: false, reason: 'unsupported-event', eventType: 'SPEAKER_STATS' })
})

test('mapping room yêu cầu bookingId/sessionKey và đối chiếu hai đầu teacher/student', () => {
  const roomData = {
    bookingId: binding.bookingId,
    sessionKey: binding.sessionKey,
    roomName: binding.roomName,
    teacherId: binding.teacherId,
    studentId: binding.studentId,
  }
  assert.deepEqual(parseOnlineClassroomAttendanceRoomBinding({
    roomDocumentId: binding.sessionKey,
    roomData,
    expectedRoomName: binding.roomName,
    bookingDocumentId: binding.bookingId,
    bookingData: { teacherId: binding.teacherId, studentId: binding.studentId },
  }), { ok: true, binding })
  assert.deepEqual(parseOnlineClassroomAttendanceRoomBinding({
    roomDocumentId: binding.sessionKey,
    roomData: { ...roomData, bookingId: undefined },
    expectedRoomName: binding.roomName,
  }), { ok: false, reason: 'invalid-room-binding' })
  assert.deepEqual(parseOnlineClassroomAttendanceRoomBinding({
    roomDocumentId: binding.sessionKey,
    roomData,
    expectedRoomName: binding.roomName,
    bookingDocumentId: binding.bookingId,
    bookingData: { teacherId: 'teacher-reassigned', studentId: binding.studentId },
  }), { ok: false, reason: 'booking-room-identity-mismatch' })
})

test('nhận diện teacher/student bằng đúng cùng JaaS JWT user id hash', () => {
  const teacherId = pseudonymousJaasUserId(APP_ID, ROOM_ALIAS, `teacher:${binding.teacherId}`)
  const studentId = pseudonymousJaasUserId(APP_ID, ROOM_ALIAS, `student:${binding.studentId}`)
  assert.equal(resolveOnlineClassroomAttendanceParticipantRole(
    webhookEvent('PARTICIPANT_JOINED', 100, { id: teacherId }),
    binding,
  ), 'teacher')
  assert.equal(resolveOnlineClassroomAttendanceParticipantRole(
    webhookEvent('PARTICIPANT_JOINED', 101, { id: studentId }),
    binding,
  ), 'student')
  assert.equal(resolveOnlineClassroomAttendanceParticipantRole(
    webhookEvent('PARTICIPANT_JOINED', 102, { id: 'external-or-admin' }),
    binding,
  ), 'unknown')
})

test('timestamp JaaS giữ trạng thái đúng dù event đến đảo thứ tự', () => {
  let summary = reduceOnlineClassroomAttendanceSummary(
    null,
    webhookEvent('ROOM_DESTROYED', 500),
    'unknown',
  )
  summary = reduceOnlineClassroomAttendanceSummary(
    summary,
    webhookEvent('ROOM_CREATED', 100),
    'unknown',
  )
  summary = reduceOnlineClassroomAttendanceSummary(
    summary,
    webhookEvent('PARTICIPANT_LEFT', 400),
    'teacher',
  )
  summary = reduceOnlineClassroomAttendanceSummary(
    summary,
    webhookEvent('PARTICIPANT_JOINED', 300),
    'teacher',
  )
  summary = reduceOnlineClassroomAttendanceSummary(
    summary,
    webhookEvent('PARTICIPANT_JOINED', 200),
    'teacher',
  )

  assert.equal(summary.firstEventAtMs, 100)
  assert.equal(summary.lastEventAtMs, 500)
  assert.equal(summary.roomCreatedAtMs, 100)
  assert.equal(summary.roomDestroyedAtMs, 500)
  assert.equal(summary.roomOpen, false)
  assert.equal(summary.teacher.firstJoinedAtMs, 200)
  assert.equal(summary.teacher.lastJoinedAtMs, 300)
  assert.equal(summary.teacher.lastLeftAtMs, 400)
  assert.equal(summary.teacher.present, false)
  assert.equal(summary.teacher.presenceStateEventType, 'ROOM_DESTROYED')
})

test('cùng timestamp thì event kết thúc thắng ổn định bất kể thứ tự nhận', () => {
  const joined = webhookEvent('PARTICIPANT_JOINED', 500)
  const left = webhookEvent('PARTICIPANT_LEFT', 500)
  const leftThenJoined = reduceOnlineClassroomAttendanceSummary(
    reduceOnlineClassroomAttendanceSummary(null, left, 'teacher'),
    joined,
    'teacher',
  )
  const joinedThenLeft = reduceOnlineClassroomAttendanceSummary(
    reduceOnlineClassroomAttendanceSummary(null, joined, 'teacher'),
    left,
    'teacher',
  )
  assert.equal(leftThenJoined.teacher.present, false)
  assert.equal(joinedThenLeft.teacher.present, false)

  const created = webhookEvent('ROOM_CREATED', 700)
  const destroyed = webhookEvent('ROOM_DESTROYED', 700)
  const destroyedThenCreated = reduceOnlineClassroomAttendanceSummary(
    reduceOnlineClassroomAttendanceSummary(null, destroyed, 'unknown'),
    created,
    'unknown',
  )
  assert.equal(destroyedThenCreated.roomOpen, false)
})

test('lobby không hồi quy khi event cũ đến trễ và ROOM_DESTROYED đóng mọi presence', () => {
  let summary = reduceOnlineClassroomAttendanceSummary(
    null,
    webhookEvent('PARTICIPANT_JOINED_LOBBY', 100),
    'student',
  )
  summary = reduceOnlineClassroomAttendanceSummary(
    summary,
    webhookEvent('PARTICIPANT_JOINED', 200),
    'student',
  )
  summary = reduceOnlineClassroomAttendanceSummary(
    summary,
    webhookEvent('PARTICIPANT_JOINED_LOBBY', 150),
    'student',
  )
  assert.equal(summary.student.inLobby, false)
  assert.equal(summary.student.present, true)
  summary = reduceOnlineClassroomAttendanceSummary(
    summary,
    webhookEvent('ROOM_DESTROYED', 300),
    'unknown',
  )
  assert.equal(summary.student.inLobby, false)
  assert.equal(summary.student.present, false)
})

test('projection phẳng cho operations tính lại đi trễ từ first join sau event đảo thứ tự', () => {
  const scheduledStart = 1_800_000_000_000
  let summary = reduceOnlineClassroomAttendanceSummary(
    null,
    webhookEvent('PARTICIPANT_JOINED', scheduledStart + 90_000),
    'teacher',
  )
  let projection = projectOnlineClassroomAttendanceSummary(summary, scheduledStart)
  assert.equal(projection.teacherLateSeconds, 90)
  assert.equal(projection.teacherJoinCount, 1)
  assert.equal(projection.status, null)

  summary = reduceOnlineClassroomAttendanceSummary(
    summary,
    webhookEvent('PARTICIPANT_JOINED', scheduledStart - 30_000),
    'teacher',
  )
  projection = projectOnlineClassroomAttendanceSummary(summary, scheduledStart)
  assert.equal(projection.teacherFirstJoinedAtMs, scheduledStart - 30_000)
  assert.equal(projection.teacherLateSeconds, 0)
  assert.equal(projection.teacherJoinCount, 2)

  summary = reduceOnlineClassroomAttendanceSummary(
    summary,
    webhookEvent('ROOM_DESTROYED', scheduledStart + 120_000),
    'unknown',
  )
  assert.equal(projectOnlineClassroomAttendanceSummary(summary, scheduledStart).status, 'ended')
  assert.equal(projectOnlineClassroomAttendanceSummary(null, scheduledStart).teacherLateSeconds, null)
})

test('breakout được lưu/count nhưng không làm sai summary phòng chính', () => {
  let summary = reduceOnlineClassroomAttendanceSummary(
    null,
    webhookEvent('PARTICIPANT_JOINED', 100),
    'teacher',
  )
  summary = reduceOnlineClassroomAttendanceSummary(
    summary,
    webhookEvent('PARTICIPANT_LEFT', 200, { isBreakout: true, breakoutRoomId: 'breakout-a' }),
    'teacher',
  )
  assert.equal(summary.eventCount, 2)
  assert.equal(summary.breakoutEventCount, 1)
  assert.equal(summary.teacher.present, true)
  assert.equal(summary.teacher.leftEventCount, 0)
})

test('idempotency key có doc id ổn định và fingerprint phát hiện nội dung đổi', () => {
  const event = webhookEvent('PARTICIPANT_JOINED', 100)
  const fingerprint = onlineClassroomJaasAttendanceEventFingerprint(event)
  assert.equal(
    onlineClassroomJaasAttendanceEventDocumentId(event.idempotencyKey),
    onlineClassroomJaasAttendanceEventDocumentId(event.idempotencyKey),
  )
  assert.match(onlineClassroomJaasAttendanceEventDocumentId(event.idempotencyKey), /^jaas_[0-9a-f]{64}$/)
  assert.notEqual(
    fingerprint,
    onlineClassroomJaasAttendanceEventFingerprint({ ...event, timestamp: 101 }),
  )
  assert.equal(decideOnlineClassroomJaasAttendanceIdempotency(false, undefined, fingerprint), 'create')
  assert.equal(decideOnlineClassroomJaasAttendanceIdempotency(true, fingerprint, fingerprint), 'duplicate')
  assert.equal(decideOnlineClassroomJaasAttendanceIdempotency(true, 'different', fingerprint), 'conflict')
})

test('summary malformed/legacy được chuẩn hóa fail-safe trước khi reduce', () => {
  const normalized = normalizeOnlineClassroomAttendanceSummary({
    eventCount: -1,
    roomOpen: 'true',
    teacher: { present: true, firstJoinedAtMs: 'bad' },
  })
  assert.equal(normalized.eventCount, 0)
  assert.equal(normalized.roomOpen, false)
  assert.equal(normalized.teacher.present, true)
  assert.equal(normalized.teacher.firstJoinedAtMs, null)
  assert.equal(normalized.student.present, false)
})

test('attendance giữ timing theo từng sessionKey qua nhiều generation pilot', () => {
  const sessionA = {
    sessionKey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    extensionMinutes: 10,
    scheduledStartsAtMs: 1_800_000_000_000,
    scheduledEndsAtMs: 1_800_003_000_000,
    hardEndsAtMs: 1_800_003_600_000,
    timingSource: 'room',
  }
  const sessionB = {
    sessionKey: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    extensionMinutes: 0,
    scheduledStartsAtMs: 1_800_000_000_000,
    scheduledEndsAtMs: 1_800_003_000_000,
    hardEndsAtMs: 1_800_003_000_000,
    timingSource: 'room',
  }
  const history = mergeOnlineClassroomAttendanceSessionHistory(
    { [sessionA.sessionKey]: sessionA, malformed: { extensionMinutes: 99 } },
    sessionB,
  )
  assert.deepEqual(Object.keys(history).sort(), [sessionA.sessionKey, sessionB.sessionKey])
  assert.deepEqual(history[sessionA.sessionKey], sessionA)
  assert.deepEqual(history[sessionB.sessionKey], sessionB)
  assert.equal(normalizeOnlineClassroomAttendanceEffectiveSession({
    ...sessionA,
    hardEndsAtMs: sessionA.scheduledEndsAtMs,
  }), null)
})

test('event cũ generation trước không thay effective session nhưng cùng session được refresh timing', () => {
  const currentSummary = reduceOnlineClassroomAttendanceSummary(
    null,
    webhookEvent('PARTICIPANT_JOINED', 500),
    'teacher',
  )
  assert.equal(shouldUseOnlineClassroomAttendanceEffectiveSession({
    currentSummary,
    currentEffectiveSessionKey: 'new-generation-session',
    incomingSessionKey: 'old-generation-session',
    event: webhookEvent('PARTICIPANT_LEFT', 400),
  }), false)
  assert.equal(shouldUseOnlineClassroomAttendanceEffectiveSession({
    currentSummary,
    currentEffectiveSessionKey: 'same-generation-session',
    incomingSessionKey: 'same-generation-session',
    event: webhookEvent('PARTICIPANT_LEFT', 400),
  }), true)
  assert.equal(shouldUseOnlineClassroomAttendanceEffectiveSession({
    currentSummary,
    currentEffectiveSessionKey: 'old-generation-session',
    incomingSessionKey: 'new-generation-session',
    event: webhookEvent('PARTICIPANT_JOINED', 600),
  }), true)
})

test('mapping conflict vĩnh viễn được phân loại để ACK, lỗi hạ tầng vẫn retry', () => {
  for (const reason of [
    'ambiguous-room-alias',
    'invalid-room-binding',
    'invalid-room-timing',
    'booking-room-identity-mismatch',
    'room-booking-binding-changed',
    'idempotency-key-conflict',
  ]) {
    assert.equal(isOnlineClassroomAttendancePermanentConflict(reason), true)
  }
  assert.equal(isOnlineClassroomAttendancePermanentConflict('firestore-unavailable'), false)
})

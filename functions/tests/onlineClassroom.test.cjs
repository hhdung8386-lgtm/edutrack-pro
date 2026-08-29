const test = require('node:test')
const assert = require('node:assert/strict')

const {
  ONLINE_CLASSROOM_CREDENTIAL_ROTATION_LEASE_MS,
  canAcquireOnlineClassroomCredentialMutation,
  decideOnlineClassroomBoardOperationAppend,
  decideOnlineClassroomBoardSave,
  decideOnlineClassroomScreenAnnotationSessionMutation,
  isInsideOnlineClassroomJoinWindow,
  isSafeOnlineClassroomScreenAnnotationSessionId,
  nextOnlineClassroomAccessGeneration,
  onlineClassroomAccessGeneration,
  onlineClassroomAccessId,
  onlineClassroomBookingBlockReason,
  onlineClassroomCredentialMutationMatches,
  onlineClassroomCredentialRotationFence,
  onlineClassroomJoinWindow,
  onlineClassroomInviteMatches,
  onlineClassroomInvitePredatesGeneration,
  onlineClassroomPilotReminderDeliveryId,
  onlineClassroomSessionKey,
  onlineClassroomStudentJoinUrl,
  onlineClassroomTokenHash,
  parseVietnamBookingTime,
  partitionOnlineClassroomReminderBookings,
  resolveOnlineClassroomTrustedActor,
  sanitizeOnlineClassroomDomain,
  validateOnlineClassroomBoardDraft,
  validateOnlineClassroomBoardOperation,
  validateOnlineClassroomBoardSnapshot,
  validateOnlineClassroomScreenAnnotationSession,
} = require('../lib/onlineClassroom.js')

const confirmed = {
  id: 'booking-a',
  status: 'confirmed',
  teacherId: 'teacher-a',
  studentId: 'student-a',
  subjectId: 'english',
  requestedDate: '2026-08-27',
  requestedStart: '18:00',
  requestedEnd: '18:50',
}

const validStroke = {
  id: 'stroke-test-0001',
  authorRole: 'student',
  createdAt: 1_787_900_000_000,
  kind: 'stroke',
  tool: 'pen',
  color: '#10213a',
  width: 4,
  opacity: 1,
  points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
}

const validText = {
  id: 'text-test-000001',
  authorRole: 'teacher',
  createdAt: 1_787_900_000_001,
  kind: 'text',
  color: '#2563eb',
  fontSize: 22,
  point: { x: 0.25, y: 0.35 },
  text: 'Câu trả lời',
}

const validShape = {
  id: 'shape-test-00001',
  authorRole: 'admin',
  createdAt: 1_787_900_000_002,
  kind: 'shape',
  shape: 'arrow',
  color: '#d97706',
  width: 4,
  opacity: 1,
  start: { x: 0.2, y: 0.3 },
  end: { x: 0.7, y: 0.8 },
}

const validScreenAnnotationSession = {
  sessionId: 'screen-session-00000001',
  active: true,
  boardSnapshot: {
    version: 2,
    studentCanWrite: true,
    operations: [validStroke],
  },
}

const validAuditedScreenAnnotationSession = {
  ...validScreenAnnotationSession,
  startedAtMs: 1_787_900_000_010,
  updatedAtMs: 1_787_900_000_020,
  endedAtMs: null,
  startedByRole: 'teacher',
  startedById: 'teacher-a',
  updatedByRole: 'student',
  updatedById: 'student-a',
}

test('tạo khóa allowlist và session riêng cho từng booking nhưng không lộ booking id', () => {
  assert.equal(onlineClassroomAccessId('teacher', 'abc'), 'teacher_abc')
  assert.equal(onlineClassroomSessionKey(confirmed), onlineClassroomSessionKey({ ...confirmed }))
  assert.notEqual(onlineClassroomSessionKey(confirmed), onlineClassroomSessionKey({ ...confirmed, id: 'booking-b' }))
  assert.notEqual(onlineClassroomSessionKey(confirmed), onlineClassroomSessionKey({ ...confirmed, teacherId: 'teacher-b' }))
  assert.notEqual(onlineClassroomSessionKey(confirmed), onlineClassroomSessionKey({ ...confirmed, requestedStart: '19:00' }))
  assert.notEqual(onlineClassroomSessionKey(confirmed), onlineClassroomSessionKey({ ...confirmed, requestedEnd: '19:50' }))
  assert.notEqual(onlineClassroomSessionKey(confirmed, 1, 1), onlineClassroomSessionKey(confirmed, 2, 1))
  assert.notEqual(onlineClassroomSessionKey(confirmed, 1, 1), onlineClassroomSessionKey(confirmed, 1, 2))
  assert.doesNotMatch(onlineClassroomSessionKey(confirmed), /booking-a/)
})

test('token chỉ xuất hiện trong fragment của magic link', () => {
  const url = onlineClassroomStudentJoinUrl('https://www.123english.edu.vn/', 'booking-a', 'secret-token')
  assert.equal(url, 'https://www.123english.edu.vn/lop-hoc/booking-a#token=secret-token')
  assert.equal(new URL(url).search, '')
  assert.equal(onlineClassroomTokenHash('secret-token').length, 64)
})

test('quyền gia sư chỉ hợp lệ khi UID khớp liên kết chuẩn trên hồ sơ gia sư', () => {
  assert.deepEqual(
    resolveOnlineClassroomTrustedActor('admin-uid', { role: 'admin' }, null),
    { role: 'admin' },
  )
  assert.deepEqual(
    resolveOnlineClassroomTrustedActor(
      'teacher-uid',
      { role: 'teacher', teacherId: 'teacher-a' },
      { loginAccountUid: 'teacher-uid' },
    ),
    { role: 'teacher', teacherId: 'teacher-a' },
  )
  assert.equal(
    resolveOnlineClassroomTrustedActor(
      'attacker-uid',
      { role: 'teacher', teacherId: 'teacher-a' },
      { loginAccountUid: 'teacher-uid' },
    ),
    null,
  )
  assert.equal(
    resolveOnlineClassroomTrustedActor(
      'teacher-uid',
      { role: 'teacher', teacherId: 'teacher-a' },
      {},
    ),
    null,
  )
})

test('token cũ bị vô hiệu khi booking đổi ngày, môn hoặc gia sư', () => {
  const invite = {
    bookingId: 'booking-a',
    sessionKey: 'session-original',
    studentId: 'student-a',
    studentPilotGeneration: 3,
    teacherPilotGeneration: 5,
  }
  assert.equal(onlineClassroomInviteMatches(invite, 'booking-a', 'session-original', 'student-a', 3, 5), true)
  assert.equal(onlineClassroomInviteMatches(invite, 'booking-a', 'session-rescheduled', 'student-a', 3, 5), false)
  assert.equal(onlineClassroomInviteMatches(invite, 'booking-a', 'session-original', 'student-a', 4, 5), false)
  assert.equal(onlineClassroomInviteMatches(invite, 'booking-a', 'session-original', 'student-a', 3, 6), false)
})

test('tắt rồi bật pilot xoay generation nên link cũ không sống lại', () => {
  assert.equal(onlineClassroomAccessGeneration(undefined), 0)
  assert.equal(nextOnlineClassroomAccessGeneration(0, false, true), 1)
  assert.equal(nextOnlineClassroomAccessGeneration(1, true, false), 2)
  assert.equal(nextOnlineClassroomAccessGeneration(2, false, true), 3)
  assert.equal(nextOnlineClassroomAccessGeneration(3, true, true), 3)

  const oldInvite = { studentPilotGeneration: 1, teacherPilotGeneration: 4 }
  assert.equal(onlineClassroomInvitePredatesGeneration(oldInvite, 'student', 2), true)
  assert.equal(onlineClassroomInvitePredatesGeneration(oldInvite, 'teacher', 4), false)
  assert.equal(onlineClassroomInvitePredatesGeneration({}, 'student', 1), true)
})

test('lease/fence mật khẩu chỉ cho một Auth writer và giữ cooldown qua response tail', () => {
  const now = Date.parse('2026-08-28T08:00:00.000Z')
  const nonce = 'credential-rotation-nonce-00000001'
  const active = {
    credentialRotationState: 'rotating',
    credentialRotationNonce: nonce,
    credentialRotationFence: 7,
    credentialRotationLeaseExpiresAt: { toMillis: () => now + ONLINE_CLASSROOM_CREDENTIAL_ROTATION_LEASE_MS },
  }
  assert.equal(canAcquireOnlineClassroomCredentialMutation({}, now), true)
  assert.equal(canAcquireOnlineClassroomCredentialMutation(active, now), false)
  assert.equal(canAcquireOnlineClassroomCredentialMutation({
    ...active,
    credentialRotationState: 'rotation_cooldown',
  }, now), false)
  assert.equal(canAcquireOnlineClassroomCredentialMutation({
    ...active,
    credentialRotationLeaseExpiresAt: { toMillis: () => now },
  }, now), true)
  assert.equal(canAcquireOnlineClassroomCredentialMutation({
    credentialRotationState: 'rotating',
    credentialRotationNonce: nonce,
  }, now), false)
  assert.equal(onlineClassroomCredentialMutationMatches(active, {
    state: 'rotating',
    nonce,
    fence: 7,
  }, now), true)
  assert.equal(onlineClassroomCredentialMutationMatches(active, {
    state: 'rotating',
    nonce,
    fence: 8,
  }, now), false)
  assert.equal(onlineClassroomCredentialMutationMatches({
    ...active,
    credentialRotationState: 'rotation_cooldown',
  }, {
    state: 'rotating',
    nonce,
    fence: 7,
  }, now), false)
  assert.equal(onlineClassroomCredentialRotationFence(undefined), 0)
  assert.equal(onlineClassroomCredentialRotationFence(7), 7)
})

test('chỉ booking 1 kèm 1 đã xác nhận và chưa điểm danh được mở', () => {
  assert.equal(onlineClassroomBookingBlockReason(confirmed), null)
  assert.equal(onlineClassroomBookingBlockReason({ ...confirmed, status: 'pending' }), 'BOOKING_NOT_CONFIRMED')
  assert.equal(onlineClassroomBookingBlockReason({ ...confirmed, lessonId: 'lesson-a' }), 'BOOKING_ALREADY_COMPLETED')
  assert.equal(onlineClassroomBookingBlockReason({ ...confirmed, groupClassId: 'group-a' }), 'GROUP_CLASS_NOT_SUPPORTED')
})

test('cửa sổ pilot mở từ 12 giờ trước đến 6 giờ sau buổi học', () => {
  assert.equal(isInsideOnlineClassroomJoinWindow(confirmed, Date.parse('2026-08-26T22:59:00Z')), false)
  assert.equal(isInsideOnlineClassroomJoinWindow(confirmed, Date.parse('2026-08-26T23:00:00Z')), true)
  assert.equal(isInsideOnlineClassroomJoinWindow(confirmed, Date.parse('2026-08-27T17:49:00Z')), true)
  assert.equal(isInsideOnlineClassroomJoinWindow(confirmed, Date.parse('2026-08-27T17:51:00Z')), false)
})

test('không tự sửa ngày giờ booking sai thành một lịch hợp lệ khác', () => {
  assert.equal(parseVietnamBookingTime('2026-02-30', '18:00'), null)
  assert.equal(parseVietnamBookingTime('2026-08-27', '24:30')?.toISOString(), '2026-08-27T17:30:00.000Z')
  assert.equal(parseVietnamBookingTime('2026-08-27', '25:00')?.toISOString(), '2026-08-27T18:00:00.000Z')
  assert.equal(parseVietnamBookingTime('2026-08-27', '25:59')?.toISOString(), '2026-08-27T18:59:00.000Z')
  assert.equal(parseVietnamBookingTime('2026-08-27', '24:00')?.toISOString(), '2026-08-27T17:00:00.000Z')
  assert.equal(parseVietnamBookingTime('2026-08-27', '24:60'), null)
  assert.equal(parseVietnamBookingTime('2026-08-27', '25:99'), null)
  assert.equal(parseVietnamBookingTime('2026-08-27', '26:00'), null)
  assert.equal(onlineClassroomJoinWindow({
    ...confirmed,
    requestedStart: '18:50',
    requestedEnd: '18:00',
  }), null)
})

test('chặn domain sai và snapshot bảng quá lớn hoặc sai schema', () => {
  assert.equal(sanitizeOnlineClassroomDomain('https://meet.jit.si/'), 'meet.jit.si')
  assert.equal(sanitizeOnlineClassroomDomain('javascript:alert(1)'), 'meet.jit.si')
  assert.deepEqual(validateOnlineClassroomBoardSnapshot({ version: 2, studentCanWrite: true, operations: [validStroke] }), {
    version: 2,
    generation: 0,
    studentCanWrite: true,
    operations: [validStroke],
  })
  assert.equal(validateOnlineClassroomBoardSnapshot({ version: 1, studentCanWrite: true, operations: new Array(1501).fill({}) }), null)
  assert.equal(validateOnlineClassroomBoardSnapshot({ version: -1, studentCanWrite: true, operations: [] }), null)
  assert.equal(validateOnlineClassroomBoardSnapshot({ version: 1, studentCanWrite: true, operations: [validStroke, validStroke] }), null)
  assert.equal(validateOnlineClassroomBoardSnapshot({ version: 1, studentCanWrite: true, operations: [{ id: 'legacy' }] }), null)
})

test('phiên chú thích màn hình nhận dữ liệu legacy và audit server hợp lệ', () => {
  const normalizedLegacySession = {
    ...validScreenAnnotationSession,
    boardSnapshot: {
      ...validScreenAnnotationSession.boardSnapshot,
      generation: 0,
    },
  }
  assert.equal(isSafeOnlineClassroomScreenAnnotationSessionId(validScreenAnnotationSession.sessionId), true)
  assert.equal(isSafeOnlineClassroomScreenAnnotationSessionId('short'), false)
  assert.deepEqual(
    validateOnlineClassroomScreenAnnotationSession(validScreenAnnotationSession),
    normalizedLegacySession,
  )
  assert.deepEqual(
    validateOnlineClassroomScreenAnnotationSession(validAuditedScreenAnnotationSession),
    { ...validAuditedScreenAnnotationSession, boardSnapshot: normalizedLegacySession.boardSnapshot },
  )
  const validEndedSession = {
    ...validAuditedScreenAnnotationSession,
    active: false,
    updatedAtMs: 1_787_900_000_040,
    endedAtMs: 1_787_900_000_040,
    updatedByRole: 'teacher',
    updatedById: 'teacher-a',
  }
  assert.deepEqual(
    validateOnlineClassroomScreenAnnotationSession(validEndedSession),
    { ...validEndedSession, boardSnapshot: normalizedLegacySession.boardSnapshot },
  )
  const partiallyAuditedLegacySession = {
    ...validScreenAnnotationSession,
    updatedAtMs: 1_787_900_000_030,
    updatedByRole: 'student',
    updatedById: 'student-a',
  }
  assert.deepEqual(
    validateOnlineClassroomScreenAnnotationSession(partiallyAuditedLegacySession),
    { ...partiallyAuditedLegacySession, boardSnapshot: normalizedLegacySession.boardSnapshot },
  )
  assert.equal(validateOnlineClassroomScreenAnnotationSession(undefined), null)
  assert.equal(validateOnlineClassroomScreenAnnotationSession(null), null)
  assert.equal(validateOnlineClassroomScreenAnnotationSession({}), null)
  assert.equal(validateOnlineClassroomScreenAnnotationSession({
    ...validScreenAnnotationSession,
    legacyBoardSnapshot: validScreenAnnotationSession.boardSnapshot,
  }), null)
  assert.equal(validateOnlineClassroomScreenAnnotationSession({
    ...validScreenAnnotationSession,
    active: 'true',
  }), null)
  assert.equal(validateOnlineClassroomScreenAnnotationSession({
    ...validAuditedScreenAnnotationSession,
    updatedAtMs: validAuditedScreenAnnotationSession.startedAtMs - 1,
  }), null)
  assert.equal(validateOnlineClassroomScreenAnnotationSession({
    ...validAuditedScreenAnnotationSession,
    endedAtMs: validAuditedScreenAnnotationSession.updatedAtMs + 1,
  }), null)
  assert.equal(validateOnlineClassroomScreenAnnotationSession({
    ...validScreenAnnotationSession,
    updatedByRole: 'student',
  }), null)
  assert.equal(validateOnlineClassroomScreenAnnotationSession({
    ...validScreenAnnotationSession,
    updatedAtMs: 1_787_900_000_040,
  }), null)
  assert.equal(validateOnlineClassroomScreenAnnotationSession({
    ...validScreenAnnotationSession,
    updatedAtMs: 1_787_900_000_040,
    updatedByRole: 'student',
    updatedById: 'student/unsafe',
  }), null)
  assert.equal(validateOnlineClassroomScreenAnnotationSession({
    ...validScreenAnnotationSession,
    boardSnapshot: { version: 2, studentCanWrite: true, operations: [{ id: 'legacy' }] },
  }), null)
})

test('mutation chú thích chỉ nhận đúng session đang active', () => {
  assert.equal(
    decideOnlineClassroomScreenAnnotationSessionMutation(validScreenAnnotationSession, validScreenAnnotationSession.sessionId),
    'allowed',
  )
  assert.equal(
    decideOnlineClassroomScreenAnnotationSessionMutation(
      { ...validScreenAnnotationSession, active: false },
      validScreenAnnotationSession.sessionId,
    ),
    'inactive',
  )
  assert.equal(
    decideOnlineClassroomScreenAnnotationSessionMutation(validScreenAnnotationSession, 'screen-session-00000002'),
    'session-mismatch',
  )
  assert.equal(
    decideOnlineClassroomScreenAnnotationSessionMutation(null, validScreenAnnotationSession.sessionId),
    'missing',
  )
})

test('operation chú thích tái sử dụng quyết định lock, version và role server-authoritative', () => {
  const appended = decideOnlineClassroomBoardOperationAppend(
    validScreenAnnotationSession.boardSnapshot,
    { ...validText, authorRole: 'admin' },
    'student',
  )
  assert.equal(appended.decision, 'append')
  assert.equal(appended.boardSnapshot.version, validScreenAnnotationSession.boardSnapshot.version + 1)
  assert.equal(appended.operation.authorRole, 'student')

  const duplicate = decideOnlineClassroomBoardOperationAppend(
    validScreenAnnotationSession.boardSnapshot,
    validStroke,
    'student',
  )
  assert.equal(duplicate.decision, 'duplicate')
  assert.equal(duplicate.boardSnapshot.version, validScreenAnnotationSession.boardSnapshot.version)

  const locked = decideOnlineClassroomBoardOperationAppend(
    { ...validScreenAnnotationSession.boardSnapshot, studentCanWrite: false },
    validText,
    'student',
  )
  assert.equal(locked.decision, 'locked')
})

test('không để request lưu bảng cũ ghi đè snapshot mới hơn', () => {
  const current = { version: 3, studentCanWrite: true, operations: [validStroke] }
  const sameDraft = { studentCanWrite: true, operations: [validStroke] }
  assert.equal(decideOnlineClassroomBoardSave(current, 3, sameDraft), 'noop')
  assert.equal(decideOnlineClassroomBoardSave(current, 3, {
    generation: 1,
    studentCanWrite: true,
    operations: [validText],
  }), 'write')
  assert.equal(decideOnlineClassroomBoardSave(current, 2, sameDraft), 'conflict')
  assert.equal(decideOnlineClassroomBoardSave(current, 4, sameDraft), 'conflict')
  assert.equal(decideOnlineClassroomBoardSave(null, 0, { studentCanWrite: true, operations: [] }), 'write')
})

test('kiểm tra sâu schema operation và không nhận dữ liệu thừa', () => {
  assert.deepEqual(validateOnlineClassroomBoardOperation(validStroke), validStroke)
  assert.deepEqual(validateOnlineClassroomBoardOperation(validShape), validShape)
  assert.deepEqual(validateOnlineClassroomBoardOperation({ ...validText, text: '  Câu trả lời  ' }), validText)
  assert.equal(validateOnlineClassroomBoardOperation({ ...validStroke, id: 'short' }), null)
  assert.equal(validateOnlineClassroomBoardOperation({ ...validStroke, color: 'red' }), null)
  assert.equal(validateOnlineClassroomBoardOperation({ ...validStroke, points: [{ x: -0.1, y: 0.2 }] }), null)
  assert.equal(validateOnlineClassroomBoardOperation({ ...validStroke, unexpected: 'data' }), null)
  assert.equal(validateOnlineClassroomBoardOperation({ ...validStroke, points: new Array(801).fill({ x: 0.1, y: 0.2 }) }), null)
  assert.deepEqual(validateOnlineClassroomBoardDraft({ studentCanWrite: true, operations: [validStroke] }), {
    generation: 0,
    studentCanWrite: true,
    operations: [validStroke],
  })
  assert.equal(validateOnlineClassroomBoardDraft({ studentCanWrite: true, operations: [{ id: 'legacy' }] }), null)
})

test('append operation ép vai trò từ backend và tăng đúng một version', () => {
  const current = { version: 7, studentCanWrite: true, operations: [] }
  const result = decideOnlineClassroomBoardOperationAppend(current, validStroke, 'teacher')
  assert.equal(result.decision, 'append')
  assert.equal(result.boardSnapshot.version, 8)
  assert.equal(result.boardSnapshot.operations.length, 1)
  assert.equal(result.boardSnapshot.operations[0].authorRole, 'teacher')
  assert.equal(current.version, 7)
  assert.equal(current.operations.length, 0)

  const forgedRole = decideOnlineClassroomBoardOperationAppend(current, validText, 'student')
  assert.equal(forgedRole.boardSnapshot.operations[0].authorRole, 'student')
})

test('append tuần tự từ gia sư và học viên giữ đủ hai nét đúng một lần', () => {
  const empty = { version: 0, generation: 0, studentCanWrite: true, operations: [] }
  const teacherAppend = decideOnlineClassroomBoardOperationAppend(empty, validStroke, 'teacher', 0)
  assert.equal(teacherAppend.decision, 'append')

  const studentAppend = decideOnlineClassroomBoardOperationAppend(
    teacherAppend.boardSnapshot,
    validText,
    'student',
    0,
  )
  assert.equal(studentAppend.decision, 'append')
  assert.deepEqual(studentAppend.boardSnapshot.operations.map((operation) => operation.id), [validStroke.id, validText.id])
  assert.deepEqual(studentAppend.boardSnapshot.operations.map((operation) => operation.authorRole), ['teacher', 'student'])

  const retry = decideOnlineClassroomBoardOperationAppend(
    studentAppend.boardSnapshot,
    validText,
    'student',
    0,
  )
  assert.equal(retry.decision, 'duplicate')
  assert.equal(retry.boardSnapshot.operations.length, 2)
})

test('không cho thao tác gửi trễ hồi sinh sau khi quản lý đã xóa bảng', () => {
  const cleared = { version: 9, generation: 3, studentCanWrite: true, operations: [] }
  const stale = decideOnlineClassroomBoardOperationAppend(cleared, validStroke, 'student', 2)
  assert.equal(stale.decision, 'stale-generation')
  assert.equal(stale.boardSnapshot.version, 9)
  assert.equal(stale.boardSnapshot.generation, 3)
  assert.deepEqual(stale.boardSnapshot.operations, [])

  const current = decideOnlineClassroomBoardOperationAppend(cleared, validStroke, 'student', 3)
  assert.equal(current.decision, 'append')
  assert.equal(current.boardSnapshot.generation, 3)
  assert.equal(current.boardSnapshot.operations.length, 1)
})

test('save bảng chỉ được tăng generation đúng một bước khi nội dung thực sự thay đổi', () => {
  const current = { version: 4, generation: 7, studentCanWrite: true, operations: [validStroke] }
  assert.equal(decideOnlineClassroomBoardSave(current, 4, {
    generation: 8,
    studentCanWrite: true,
    operations: [],
  }), 'write')
  assert.equal(decideOnlineClassroomBoardSave(current, 4, {
    generation: 8,
    studentCanWrite: true,
    operations: [validStroke],
  }), 'conflict')
  assert.equal(decideOnlineClassroomBoardSave(current, 4, {
    generation: 9,
    studentCanWrite: true,
    operations: [],
  }), 'conflict')
  assert.equal(decideOnlineClassroomBoardSave(current, 4, {
    generation: 7,
    studentCanWrite: true,
    operations: [],
  }), 'conflict')
  assert.equal(decideOnlineClassroomBoardSave(current, 4, {
    generation: 8,
    studentCanWrite: false,
    operations: [validStroke, validText],
  }), 'conflict')
})

test('append student bị chặn khi khóa nhưng manager vẫn ghi được', () => {
  const locked = { version: 3, studentCanWrite: false, operations: [] }
  assert.equal(decideOnlineClassroomBoardOperationAppend(locked, validStroke, 'student').decision, 'locked')
  assert.equal(decideOnlineClassroomBoardOperationAppend(locked, validStroke, 'teacher').decision, 'append')
  assert.equal(decideOnlineClassroomBoardOperationAppend(locked, validStroke, 'admin').decision, 'append')
})

test('append operation idempotent và phát hiện cùng id khác nội dung', () => {
  const storedStroke = { ...validStroke, authorRole: 'student' }
  const current = { version: 4, studentCanWrite: false, operations: [storedStroke] }
  const duplicate = decideOnlineClassroomBoardOperationAppend(current, validStroke, 'student')
  assert.equal(duplicate.decision, 'duplicate')
  assert.equal(duplicate.boardSnapshot.version, 4)
  assert.equal(duplicate.boardSnapshot.operations.length, 1)

  const conflict = decideOnlineClassroomBoardOperationAppend(
    current,
    { ...validStroke, points: [...validStroke.points, { x: 0.5, y: 0.6 }] },
    'student',
  )
  assert.equal(conflict.decision, 'conflict')
  assert.equal(conflict.boardSnapshot.version, 4)
})

test('append từ chối khi đạt giới hạn số operation', () => {
  const operations = Array.from({ length: 1_500 }, (_, index) => ({
    ...validStroke,
    id: `stroke-limit-${String(index).padStart(4, '0')}`,
    points: [{ x: 0.1, y: 0.2 }],
  }))
  const current = { version: 10, studentCanWrite: true, operations }
  assert.ok(validateOnlineClassroomBoardSnapshot(current))
  assert.equal(
    decideOnlineClassroomBoardOperationAppend(current, { ...validStroke, id: 'stroke-limit-next' }, 'student').decision,
    'max-operations',
  )
})

test('append từ chối khi snapshot mới vượt giới hạn byte', () => {
  const denseStroke = {
    ...validStroke,
    points: Array.from({ length: 800 }, (_, index) => ({
      x: (index % 997) / 997,
      y: ((index * 17) % 991) / 991,
    })),
  }
  const operations = []
  let nextIndex = 0
  while (nextIndex < 1_500) {
    const operation = { ...denseStroke, id: `stroke-dense-${String(nextIndex).padStart(4, '0')}` }
    const candidate = { version: nextIndex, studentCanWrite: true, operations: [...operations, operation] }
    if (!validateOnlineClassroomBoardSnapshot(candidate)) break
    operations.push(operation)
    nextIndex += 1
  }
  const current = { version: nextIndex, studentCanWrite: true, operations }
  assert.ok(operations.length > 0 && operations.length < 1_500)
  assert.ok(validateOnlineClassroomBoardSnapshot(current))
  const overflow = { ...denseStroke, id: 'stroke-dense-overflow' }
  assert.equal(decideOnlineClassroomBoardOperationAppend(current, overflow, 'student').decision, 'max-bytes')
})

test('reminder pilot chỉ dùng allowlist học viên và khóa riêng theo từng session', () => {
  const second = { ...confirmed, id: 'booking-b', requestedStart: '20:00', requestedEnd: '20:25' }
  const enabled = new Set([
    onlineClassroomAccessId('student', 'student-a'),
  ])
  const partitioned = partitionOnlineClassroomReminderBookings([confirmed, second], enabled)
  assert.equal(partitioned.pilot.length, 2)
  assert.equal(partitioned.legacy.length, 0)
  assert.notEqual(
    onlineClassroomPilotReminderDeliveryId(confirmed, '30m'),
    onlineClassroomPilotReminderDeliveryId(second, '30m'),
  )
  assert.equal(partitionOnlineClassroomReminderBookings([confirmed], new Set()).legacy.length, 1)
  assert.equal(partitionOnlineClassroomReminderBookings([
    confirmed,
  ], new Set([onlineClassroomAccessId('teacher', 'teacher-a')])).legacy.length, 1)
  assert.equal(partitionOnlineClassroomReminderBookings([
    { ...confirmed, teacherId: undefined },
    { ...confirmed, id: 'group-booking', groupClassId: 'group-a' },
    { ...confirmed, id: 'attended-booking', lessonId: 'lesson-a' },
  ], enabled).legacy.length, 3)
})

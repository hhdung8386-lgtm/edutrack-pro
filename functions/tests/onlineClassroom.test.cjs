const test = require('node:test')
const assert = require('node:assert/strict')

const {
  decideOnlineClassroomBoardSave,
  isInsideOnlineClassroomJoinWindow,
  nextOnlineClassroomAccessGeneration,
  onlineClassroomAccessGeneration,
  onlineClassroomAccessId,
  onlineClassroomBookingBlockReason,
  onlineClassroomJoinWindow,
  onlineClassroomInviteMatches,
  onlineClassroomInvitePredatesGeneration,
  onlineClassroomPilotReminderDeliveryId,
  onlineClassroomSessionKey,
  onlineClassroomStudentJoinUrl,
  onlineClassroomTokenHash,
  parseVietnamBookingTime,
  partitionOnlineClassroomReminderBookings,
  sanitizeOnlineClassroomDomain,
  validateOnlineClassroomBoardSnapshot,
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
  assert.deepEqual(validateOnlineClassroomBoardSnapshot({ version: 2, studentCanWrite: true, operations: [{ id: 'a' }] }), {
    version: 2,
    studentCanWrite: true,
    operations: [{ id: 'a' }],
  })
  assert.equal(validateOnlineClassroomBoardSnapshot({ version: 1, studentCanWrite: true, operations: new Array(1501).fill({}) }), null)
  assert.equal(validateOnlineClassroomBoardSnapshot({ version: -1, studentCanWrite: true, operations: [] }), null)
})

test('không để request lưu bảng cũ ghi đè snapshot mới hơn', () => {
  const current = { version: 3, studentCanWrite: true, operations: [{ id: 'new' }] }
  const sameDraft = { studentCanWrite: true, operations: [{ id: 'new' }] }
  assert.equal(decideOnlineClassroomBoardSave(current, 3, sameDraft), 'noop')
  assert.equal(decideOnlineClassroomBoardSave(current, 3, {
    studentCanWrite: true,
    operations: [{ id: 'different' }],
  }), 'write')
  assert.equal(decideOnlineClassroomBoardSave(current, 2, sameDraft), 'conflict')
  assert.equal(decideOnlineClassroomBoardSave(current, 4, sameDraft), 'conflict')
  assert.equal(decideOnlineClassroomBoardSave(null, 0, { studentCanWrite: true, operations: [] }), 'write')
})

test('reminder pilot dùng allowlist private và khóa riêng theo từng session', () => {
  const second = { ...confirmed, id: 'booking-b', requestedStart: '20:00', requestedEnd: '20:25' }
  const enabled = new Set([
    onlineClassroomAccessId('student', 'student-a'),
    onlineClassroomAccessId('teacher', 'teacher-a'),
  ])
  const partitioned = partitionOnlineClassroomReminderBookings([confirmed, second], enabled)
  assert.equal(partitioned.pilot.length, 2)
  assert.equal(partitioned.legacy.length, 0)
  assert.notEqual(
    onlineClassroomPilotReminderDeliveryId(confirmed, '30m'),
    onlineClassroomPilotReminderDeliveryId(second, '30m'),
  )
  assert.equal(partitionOnlineClassroomReminderBookings([confirmed], new Set()).legacy.length, 1)
})

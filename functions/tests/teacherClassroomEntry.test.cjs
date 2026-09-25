const assert = require('node:assert/strict')
const test = require('node:test')

const {
  TeacherClassroomEntryValidationError,
  bookingWindowMs,
  classroomEntryLateMinutes,
  decideTeacherClassroomEntry,
  normalizeTeacherClassroomEntryRequest,
} = require('../lib/teacherClassroomEntry.js')

// 2026-09-20 19:00 giờ Việt Nam = 12:00 UTC.
const START = Date.UTC(2026, 8, 20, 12, 0)
const MINUTE = 60_000

function booking(overrides = {}) {
  return {
    status: 'confirmed',
    teacherId: 'teacher-a',
    studentId: 'student-a',
    requestedDate: '2026-09-20',
    requestedStart: '19:00',
    requestedEnd: '19:25',
    requestedMinutes: 25,
    ...overrides,
  }
}

function ts(ms) {
  return { toMillis: () => ms }
}

test('chỉ nhận mã ca hợp lệ', () => {
  assert.deepEqual(normalizeTeacherClassroomEntryRequest({ bookingId: ' abc_123 ' }), { bookingId: 'abc_123' })
  for (const value of [null, {}, { bookingId: '' }, { bookingId: 'a/b' }, { bookingId: 'x'.repeat(161) }]) {
    assert.throws(() => normalizeTeacherClassroomEntryRequest(value), TeacherClassroomEntryValidationError)
  }
})

test('khung giờ ca theo giờ Việt Nam, kể cả ca qua nửa đêm và thiếu giờ kết thúc', () => {
  assert.deepEqual(bookingWindowMs(booking()), { startMs: START, endMs: START + 25 * MINUTE })
  const overnight = bookingWindowMs(booking({ requestedStart: '23:45', requestedEnd: '00:10' }))
  assert.equal(overnight.endMs - overnight.startMs, 25 * MINUTE)
  const noEnd = bookingWindowMs(booking({ requestedEnd: '', requestedMinutes: 50 }))
  assert.equal(noEnd.endMs - noEnd.startMs, 50 * MINUTE)
  assert.equal(bookingWindowMs(booking({ requestedDate: '2026-02-30' })), null)
  assert.equal(bookingWindowMs(booking({ requestedStart: '7pm' })), null)
})

test('phút trễ: dưới 1 phút là đúng giờ, âm là vào sớm', () => {
  assert.equal(classroomEntryLateMinutes(START, START), 0)
  assert.equal(classroomEntryLateMinutes(START + 59_000, START), 0)
  assert.equal(classroomEntryLateMinutes(START + 61_000, START), 1)
  assert.equal(classroomEntryLateMinutes(START + 7 * MINUTE + 5_000, START), 7)
  assert.equal(classroomEntryLateMinutes(START - 30_000, START), 0)
  assert.equal(classroomEntryLateMinutes(START - 2 * MINUTE - 1, START), -2)
})

test('lần bấm đầu trong khung giờ được ghi làm giờ vào lớp', () => {
  const decision = decideTeacherClassroomEntry(booking(), 'teacher-a', START + 3 * MINUTE)
  assert.deepEqual(decision, { action: 'record', first: true, lateMinutes: 3, startMs: START, firstAtMs: START + 3 * MINUTE })
  const early = decideTeacherClassroomEntry(booking(), 'teacher-a', START - 5 * MINUTE)
  assert.equal(early.action, 'record')
  assert.equal(early.lateMinutes, -5)
})

test('lần bấm sau giữ nguyên giờ vào lớp đầu tiên', () => {
  const existing = booking({
    teacherClassroomEntryFirstAt: ts(START - 2 * MINUTE),
    teacherClassroomEntryLastAt: ts(START - 2 * MINUTE),
    teacherClassroomEntryLateMinutes: -2,
  })
  const decision = decideTeacherClassroomEntry(existing, 'teacher-a', START + 10 * MINUTE)
  assert.deepEqual(decision, { action: 'record', first: false, lateMinutes: -2, startMs: START, firstAtMs: START - 2 * MINUTE })
})

test('bấm đúp trong 10 giây không ghi thêm', () => {
  const existing = booking({
    teacherClassroomEntryFirstAt: ts(START),
    teacherClassroomEntryLastAt: ts(START),
    teacherClassroomEntryLateMinutes: 0,
  })
  assert.equal(decideTeacherClassroomEntry(existing, 'teacher-a', START + 5_000).reason, 'REPEATED_CLICK')
  assert.equal(decideTeacherClassroomEntry(existing, 'teacher-a', START + 11_000).action, 'record')
})

test('bấm quá sớm hoặc sau khi hết ca thì bỏ qua, không ghi', () => {
  const tooEarly = decideTeacherClassroomEntry(booking(), 'teacher-a', START - 61 * MINUTE)
  assert.equal(tooEarly.action, 'skip')
  assert.equal(tooEarly.reason, 'TOO_EARLY')
  assert.equal(tooEarly.opensAtMs, START - 60 * MINUTE)
  assert.equal(decideTeacherClassroomEntry(booking(), 'teacher-a', START - 60 * MINUTE).action, 'record')
  assert.equal(decideTeacherClassroomEntry(booking(), 'teacher-a', START + 25 * MINUTE).action, 'record')
  assert.equal(decideTeacherClassroomEntry(booking(), 'teacher-a', START + 25 * MINUTE + 1).reason, 'CLASS_ENDED')
})

test('chặn ca của gia sư khác, ca không còn hiệu lực và ca thiếu giờ', () => {
  assert.deepEqual(decideTeacherClassroomEntry(booking(), 'teacher-b', START), { action: 'reject', reason: 'BOOKING_TEACHER_MISMATCH' })
  for (const status of ['pending', 'rejected', 'released', undefined]) {
    assert.equal(decideTeacherClassroomEntry(booking({ status }), 'teacher-a', START).reason, 'BOOKING_NOT_ACTIVE')
  }
  assert.equal(decideTeacherClassroomEntry(booking({ status: 'completed' }), 'teacher-a', START).action, 'record')
  assert.equal(decideTeacherClassroomEntry(booking({ requestedDate: '' }), 'teacher-a', START).reason, 'BOOKING_TIME_INVALID')
})

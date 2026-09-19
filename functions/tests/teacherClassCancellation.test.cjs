const assert = require('node:assert/strict')
const test = require('node:test')

const {
  TeacherClassCancellationValidationError,
  bookingStartMs,
  normalizeTeacherClassCancellationRequest,
  teacherCancellationRequestBlocker,
  teacherCancellationWithdrawBlocker,
} = require('../lib/teacherClassCancellation.js')

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

// 2026-09-20 19:00 giờ VN = 12:00 UTC
const START_MS = Date.UTC(2026, 8, 20, 12, 0)

test('request input needs a safe booking id and a real reason', () => {
  assert.deepEqual(
    normalizeTeacherClassCancellationRequest({ bookingId: ' b-1 ', reason: '  Bận việc gia đình  ' }),
    { bookingId: 'b-1', action: 'request', reason: 'Bận việc gia đình' },
  )
  assert.throws(
    () => normalizeTeacherClassCancellationRequest({ bookingId: 'b/1', reason: 'Bận việc gia đình' }),
    (error) => error instanceof TeacherClassCancellationValidationError && error.reason === 'BOOKING_ID_INVALID',
  )
  assert.throws(
    () => normalizeTeacherClassCancellationRequest({ bookingId: 'b-1', reason: ' ốm ' }),
    (error) => error.reason === 'CANCELLATION_REASON_REQUIRED',
  )
  assert.throws(
    () => normalizeTeacherClassCancellationRequest({ bookingId: 'b-1', reason: 'x'.repeat(501) }),
    (error) => error.reason === 'CANCELLATION_REASON_TOO_LONG',
  )
  assert.throws(
    () => normalizeTeacherClassCancellationRequest({ bookingId: 'b-1', action: 'approve', reason: 'Bận việc gia đình' }),
    (error) => error.reason === 'CANCELLATION_ACTION_INVALID',
  )
  assert.deepEqual(
    normalizeTeacherClassCancellationRequest({ bookingId: 'b-1', action: 'withdraw' }),
    { bookingId: 'b-1', action: 'withdraw', reason: '' },
  )
})

test('class start is read in Vietnam time and malformed dates fail closed', () => {
  assert.equal(bookingStartMs(booking()), START_MS)
  assert.equal(bookingStartMs(booking({ requestedDate: '2026-02-30' })), null)
  assert.equal(bookingStartMs(booking({ requestedStart: '7:00' })), null)
  assert.equal(bookingStartMs(booking({ requestedDate: undefined })), null)
})

test('only an own, confirmed, unattended, future class can be requested', () => {
  const before = START_MS - 60_000
  assert.equal(teacherCancellationRequestBlocker(booking(), 'teacher-a', before), '')
  assert.equal(teacherCancellationRequestBlocker(booking(), 'teacher-b', before), 'BOOKING_TEACHER_MISMATCH')
  assert.equal(teacherCancellationRequestBlocker(booking({ status: 'pending' }), 'teacher-a', before), 'BOOKING_NOT_CONFIRMED')
  assert.equal(teacherCancellationRequestBlocker(booking({ status: 'released' }), 'teacher-a', before), 'BOOKING_NOT_CONFIRMED')
  assert.equal(teacherCancellationRequestBlocker(booking({ lessonId: 'lesson-1' }), 'teacher-a', before), 'BOOKING_ALREADY_ATTENDED')
  assert.equal(
    teacherCancellationRequestBlocker(booking({ teacherCancellationStatus: 'pending' }), 'teacher-a', before),
    'CANCELLATION_ALREADY_PENDING',
  )
  assert.equal(teacherCancellationRequestBlocker(booking(), 'teacher-a', START_MS), 'BOOKING_ALREADY_STARTED')
  assert.equal(teacherCancellationRequestBlocker(booking({ requestedDate: '' }), 'teacher-a', before), 'BOOKING_TIME_INVALID')
  // Bị từ chối trước đó vẫn được xin lại.
  assert.equal(
    teacherCancellationRequestBlocker(booking({ teacherCancellationStatus: 'rejected' }), 'teacher-a', before),
    '',
  )
})

test('withdraw only works on the own pending request', () => {
  assert.equal(teacherCancellationWithdrawBlocker(booking({ teacherCancellationStatus: 'pending' }), 'teacher-a'), '')
  assert.equal(
    teacherCancellationWithdrawBlocker(booking({ teacherCancellationStatus: 'pending' }), 'teacher-b'),
    'BOOKING_TEACHER_MISMATCH',
  )
  assert.equal(
    teacherCancellationWithdrawBlocker(booking({ teacherCancellationStatus: 'approved' }), 'teacher-a'),
    'CANCELLATION_NOT_PENDING',
  )
  assert.equal(teacherCancellationWithdrawBlocker(booking(), 'teacher-a'), 'CANCELLATION_NOT_PENDING')
})

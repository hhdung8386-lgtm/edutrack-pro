import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findConsecutiveAttendanceBookings,
  isBookingAttended,
  isBookingCancellable,
  selectLessonBookingMatches,
  validateExplicitLessonBookings,
  type LessonBookingReference,
} from '../src/lib/bookingLogic.ts'
import type { BookingRequest } from '../src/types/index.ts'

function booking(id: string, start: string, overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    id,
    status: 'confirmed',
    teacherId: 'teacher-1',
    teacherCode: 'T1',
    teacherName: 'Teacher',
    studentId: 'student-1',
    studentCode: 'S1',
    studentName: 'Student',
    subjectId: 'subject-1',
    subjectName: 'English',
    requestedDay: 'mon',
    requestedDate: '2026-08-10',
    requestedStart: start,
    requestedEnd: start,
    requestedMinutes: 25,
    createdAt: {} as BookingRequest['createdAt'],
    ...overrides,
  }
}

function lesson(minutes: number, overrides: Partial<LessonBookingReference> = {}): LessonBookingReference {
  return {
    id: 'lesson-1',
    studentId: 'student-1',
    teacherId: 'teacher-1',
    subjectId: 'subject-1',
    date: '2026-08-10',
    minutes,
    ...overrides,
  }
}

test('auto-selects the complete adjacent 50-minute booking when either 25-minute cell is opened', () => {
  const slots = [booking('b1', '20:00'), booking('b2', '20:30')]
  assert.deepEqual(findConsecutiveAttendanceBookings(slots, slots[0]).map((item) => item.id), ['b1', 'b2'])
  assert.deepEqual(findConsecutiveAttendanceBookings(slots, slots[1]).map((item) => item.id), ['b1', 'b2'])
})

test('does not merge a separate time block or another student into attendance', () => {
  const current = booking('b1', '20:00')
  const slots = [
    current,
    booking('b2', '20:30'),
    booking('later', '22:00'),
    booking('other-student', '21:00', { studentId: 'student-2' }),
  ]
  assert.deepEqual(findConsecutiveAttendanceBookings(slots, current).map((item) => item.id), ['b1', 'b2'])
})

test('matches two 25-minute holds to one 50-minute lesson', () => {
  const matches = [booking('b1', '20:00'), booking('b2', '20:30')]
  assert.deepEqual(selectLessonBookingMatches(matches, lesson(50)).map((item) => item.id), ['b1', 'b2'])
  assert.equal(validateExplicitLessonBookings(matches, lesson(50)), true)
})

test('fails closed when same-day holds cannot be proven to equal the lesson', () => {
  const matches = [booking('b1', '20:00'), booking('b2', '20:30'), booking('b3', '22:00')]
  assert.throws(() => selectLessonBookingMatches(matches, lesson(50)), /BOOKING_MATCH_AMBIGUOUS/)
  assert.equal(validateExplicitLessonBookings(matches.slice(0, 1), lesson(50)), false)
  assert.equal(validateExplicitLessonBookings([
    booking('wrong-teacher', '20:00', { teacherId: 'teacher-2', requestedMinutes: 50 }),
  ], lesson(50)), false)
})

test('ignores released bookings when using the legacy fallback matcher', () => {
  const active = booking('active', '20:00', { requestedMinutes: 50 })
  const released = booking('released', '20:30', { requestedMinutes: 50, status: 'released' })
  assert.deepEqual(selectLessonBookingMatches([released, active], lesson(50)).map((item) => item.id), ['active'])
})

test('matches one scheduled booking to a zero-minute excused absence when the legacy booking reference is missing', () => {
  const scheduled = booking('scheduled', '20:00')
  const absentLesson = lesson(0, { isZeroMinuteExcusedAbsence: true })

  assert.deepEqual(selectLessonBookingMatches([scheduled], absentLesson).map((item) => item.id), ['scheduled'])
})

test('fails closed for non-excused or ambiguous zero-minute attendance', () => {
  assert.throws(() => selectLessonBookingMatches([booking('scheduled', '20:00')], lesson(0)), /BOOKING_MATCH_AMBIGUOUS/)
  assert.throws(
    () => selectLessonBookingMatches([
      booking('first', '20:00'),
      booking('second', '20:30'),
    ], lesson(0, { isZeroMinuteExcusedAbsence: true })),
    /BOOKING_MATCH_AMBIGUOUS/,
  )
})

test('distinguishes scheduled bookings from attended and cancellable bookings', () => {
  const scheduled = booking('scheduled', '20:00')
  const pending = booking('pending', '20:30', { status: 'pending' })
  const attended = booking('attended', '21:00', { lessonId: 'lesson-1' })
  const completed = booking('completed', '21:30', { status: 'completed' })

  assert.equal(isBookingAttended(scheduled), false)
  assert.equal(isBookingCancellable(scheduled), true)
  assert.equal(isBookingCancellable(pending), true)
  assert.equal(isBookingAttended(attended), true)
  assert.equal(isBookingCancellable(attended), false)
  assert.equal(isBookingAttended(completed), true)
  assert.equal(isBookingCancellable(completed), false)
})

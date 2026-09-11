import assert from 'node:assert/strict'
import test from 'node:test'
import {
  approvedLinkedBookingHoldToRelease,
  bookingsToReopenOnLessonReject,
  canSettleApprovedLinkedBooking,
  canUnlinkStaleLessonFromBooking,
  classifyLinkedBookingHold,
  isLinkedBookingHold,
} from '../src/lib/linkedBookingHolds.ts'
import type { BookingRequest, Lesson } from '../src/types/index.ts'

function booking(overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    id: 'booking-1',
    status: 'confirmed',
    teacherId: 'teacher-1',
    teacherName: 'Janice',
    studentId: 'student-1',
    studentCode: 'HSF24YF5',
    studentName: 'Phan Ngọc Hiệu',
    subjectId: 'subject-1',
    requestedDate: '2026-09-01',
    requestedStart: '18:00',
    requestedEnd: '18:25',
    requestedMinutes: 25,
    requestedPoints: 25,
    lessonId: 'lesson-1',
    ...overrides,
  } as BookingRequest
}

function lesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson-1',
    studentId: 'student-1',
    teacherId: 'teacher-1',
    subjectId: 'subject-1',
    date: '2026-09-01',
    minutes: 25,
    status: 'pending',
    bookingRequestId: 'booking-1',
    ...overrides,
  } as Lesson
}

test('only active bookings with a lesson pointer are linked holds', () => {
  assert.equal(isLinkedBookingHold(booking()), true)
  assert.equal(isLinkedBookingHold(booking({ lessonId: undefined })), false)
  assert.equal(isLinkedBookingHold(booking({ status: 'completed' })), false)
  assert.equal(isLinkedBookingHold(booking({ status: 'released' })), false)
})

test('classifies each lesson state', () => {
  assert.equal(classifyLinkedBookingHold(booking(), lesson()), 'awaiting_approval')
  assert.equal(classifyLinkedBookingHold(booking(), lesson({ status: 'approved' })), 'lesson_approved_unsettled')
  assert.equal(classifyLinkedBookingHold(booking(), lesson({ status: 'rejected' })), 'lesson_rejected')
  assert.equal(classifyLinkedBookingHold(booking(), lesson({ status: 'cancelled' })), 'lesson_cancelled')
  assert.equal(classifyLinkedBookingHold(booking(), null), 'lesson_missing')
  assert.equal(classifyLinkedBookingHold(booking(), lesson({ studentId: 'student-2' })), 'link_mismatch')
  assert.equal(classifyLinkedBookingHold(booking(), lesson({ id: 'lesson-2' })), 'link_mismatch')
})

test('unlink is allowed only for dead lessons and never for pending/approved/mismatch', () => {
  assert.equal(canUnlinkStaleLessonFromBooking(booking(), lesson({ status: 'rejected' })), true)
  assert.equal(canUnlinkStaleLessonFromBooking(booking(), lesson({ status: 'cancelled' })), true)
  assert.equal(canUnlinkStaleLessonFromBooking(booking(), null), true)
  assert.equal(canUnlinkStaleLessonFromBooking(booking(), lesson()), false)
  assert.equal(canUnlinkStaleLessonFromBooking(booking(), lesson({ status: 'approved' })), false)
  assert.equal(canUnlinkStaleLessonFromBooking(booking(), lesson({ status: 'rejected', teacherId: 'x' })), false)
  assert.equal(canUnlinkStaleLessonFromBooking(booking({ status: 'released' }), lesson({ status: 'rejected' })), false)
  assert.equal(canUnlinkStaleLessonFromBooking(
    booking(),
    lesson({ status: 'rejected', bookingSubjectReconciliation: { kind: 'prelinked_subject_mismatch' } as Lesson['bookingSubjectReconciliation'] }),
  ), false)
})

test('a mismatched pointer can be unlinked only when that lesson is settled and does not own the booking', () => {
  const otherPupilLesson = { bookingRequestId: 'other-booking', studentId: 'student-2' }
  assert.equal(canUnlinkStaleLessonFromBooking(booking(), lesson({ ...otherPupilLesson, status: 'approved' })), true)
  assert.equal(canUnlinkStaleLessonFromBooking(booking(), lesson({ ...otherPupilLesson, status: 'pending' })), false)
  assert.equal(canUnlinkStaleLessonFromBooking(booking(), lesson({ studentId: 'student-2', status: 'approved' })), false)
})

test('an approved lesson whose booking never closed can be settled without a second hold release', () => {
  const approved = lesson({ status: 'approved' })
  assert.equal(canSettleApprovedLinkedBooking(booking(), approved), true)
  assert.equal(canSettleApprovedLinkedBooking(booking(), lesson()), false)
  assert.equal(canSettleApprovedLinkedBooking(booking({ status: 'completed' }), approved), false)
  assert.equal(canSettleApprovedLinkedBooking(booking(), null), false)
  assert.equal(canSettleApprovedLinkedBooking(
    booking(),
    lesson({ status: 'approved', bookingSubjectReconciliation: { kind: 'prelinked_subject_mismatch' } as Lesson['bookingSubjectReconciliation'] }),
  ), false)

  // Approval consumed exactly this booking's hold already: close it, release nothing.
  assert.equal(approvedLinkedBookingHoldToRelease(booking(), lesson({ status: 'approved', bookingHoldConsumed: true })), 0)
  // Approval never released this row (not referenced or hold not consumed): release its points once.
  assert.equal(approvedLinkedBookingHoldToRelease(booking(), lesson({ status: 'approved', bookingHoldConsumed: false })), 25)
  assert.equal(approvedLinkedBookingHoldToRelease(
    booking({ id: 'booking-2' }),
    lesson({ status: 'approved', bookingHoldConsumed: true }),
  ), 25)
})

test('reject reopens only active bookings pointing at the rejected lesson', () => {
  const target = lesson()
  const rows = [
    booking({ id: 'a' }),
    booking({ id: 'b', lessonId: 'other-lesson' }),
    booking({ id: 'c', status: 'completed' }),
    booking({ id: 'd', studentId: 'student-2' }),
    booking({ id: 'e', status: 'pending' }),
  ]
  assert.deepEqual(bookingsToReopenOnLessonReject(target, rows).map((row) => row.id), ['a', 'e'])
})

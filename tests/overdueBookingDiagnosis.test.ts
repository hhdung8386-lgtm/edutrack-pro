import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canManuallyReleaseDiagnosedOverdueBookingHold,
  canReleaseDiagnosedOverdueBookingHold,
  diagnoseOverdueBookings,
} from '../src/lib/overdueBookingDiagnosis.ts'
import type { BookingRequest, Lesson } from '../src/types/index.ts'

function booking(overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    id: 'booking-1',
    status: 'confirmed',
    teacherId: 'teacher-janice',
    teacherCode: 'JANICE',
    teacherName: 'Janice',
    studentId: 'student-1',
    studentCode: 'HSDH2UPP',
    studentName: 'Hương Ân',
    subjectId: 'subject-1',
    subjectName: 'Tiếng Anh 1 Kỹ Năng - Level 1',
    requestedDay: 'mon',
    requestedDate: '2026-08-10',
    requestedStart: '20:00',
    requestedEnd: '20:25',
    requestedMinutes: 25,
    createdAt: {} as BookingRequest['createdAt'],
    ...overrides,
  }
}

function lesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson-1',
    studentId: 'student-1',
    studentCode: 'HSDH2UPP',
    studentName: 'Hương Ân',
    teacherId: 'teacher-janice',
    teacherCode: 'JANICE',
    teacherName: 'Janice',
    subjectId: 'subject-1',
    subjectName: 'Tiếng Anh 1 Kỹ Năng - Level 1',
    date: '2026-08-10',
    minutes: 25,
    comment: '',
    homework: '',
    imageURLs: [],
    status: 'approved',
    sessionsBeforeApproval: 1,
    sessionsAfterApproval: 0,
    createdAt: {} as Lesson['createdAt'],
    updatedAt: {} as Lesson['updatedAt'],
    ...overrides,
  }
}

test('manual release covers another tutor or a settled ambiguous same-tutor lesson only', () => {
  const today = '2026-08-16'
  const [otherTeacher] = diagnoseOverdueBookings(
    [booking()],
    [lesson({ teacherId: 'teacher-mai', teacherName: 'Mai Hoàng', status: 'pending' })],
    today,
  )
  assert.equal(otherTeacher.diagnosis, 'other_teacher_lesson')
  assert.equal(canReleaseDiagnosedOverdueBookingHold(otherTeacher), false)
  assert.equal(canManuallyReleaseDiagnosedOverdueBookingHold(otherTeacher), true)

  const [ambiguousSettled] = diagnoseOverdueBookings([booking()], [lesson({ minutes: 50 })], today)
  assert.equal(ambiguousSettled.diagnosis, 'ambiguous_lesson')
  assert.equal(canManuallyReleaseDiagnosedOverdueBookingHold(ambiguousSettled), true)

  // A same-tutor lesson still waiting for approval may yet consume this booking.
  const [ambiguousPending] = diagnoseOverdueBookings([booking()], [lesson({ minutes: 50, status: 'pending' })], today)
  assert.equal(ambiguousPending.diagnosis, 'ambiguous_lesson')
  assert.equal(canManuallyReleaseDiagnosedOverdueBookingHold(ambiguousPending), false)

  const [pendingExplicit] = diagnoseOverdueBookings(
    [booking()],
    [lesson({ status: 'pending', bookingRequestId: 'booking-1' })],
    today,
  )
  assert.equal(pendingExplicit.diagnosis, 'pending_lesson')
  assert.equal(canManuallyReleaseDiagnosedOverdueBookingHold(pendingExplicit), false)
})

test('does not match a lesson from another teacher on the same student and date', () => {
  const result = diagnoseOverdueBookings(
    [booking()],
    [lesson({ teacherId: 'teacher-mai', teacherName: 'Mai Hoàng' })],
    '2026-08-16',
  )[0]

  assert.equal(result.diagnosis, 'other_teacher_lesson')
  assert.equal(result.matchedLesson, null)
  assert.equal(result.canLink, false)
})

test('allows an explicit same-teacher booking reference even for a combined duration', () => {
  const result = diagnoseOverdueBookings(
    [booking()],
    [lesson({ minutes: 50, bookingRequestIds: ['booking-1', 'booking-2'] })],
    '2026-08-16',
  )[0]

  assert.equal(result.diagnosis, 'approved_lesson')
  assert.equal(result.matchKind, 'explicit')
  assert.equal(result.canLink, true)
})

test('allows one unique same-teacher lesson only when duration also matches', () => {
  const result = diagnoseOverdueBookings([booking()], [lesson()], '2026-08-16')[0]

  assert.equal(result.diagnosis, 'approved_lesson')
  assert.equal(result.matchKind, 'unique')
  assert.equal(result.canLink, true)
  assert.equal(result.daysOverdue, 6)
})

test('does not offer the ordinary overdue-link repair for a reconciled lesson', () => {
  const result = diagnoseOverdueBookings(
    [booking()],
    [lesson({
      bookingRequestId: 'booking-1',
      bookingSubjectReconciliation: {
        kind: 'prelinked_subject_mismatch',
        bookingIds: ['booking-1'],
        bookingSubjectId: 'legacy-subject',
        reportedSubjectId: 'subject-1',
        settlementSubjectId: 'subject-1',
        settlementSubjectName: 'Tiếng Anh 1 Kỹ Năng - Level 1',
        reconciledAt: {} as Lesson['createdAt'],
      },
    })],
    '2026-08-16',
  )[0]

  assert.equal(result.diagnosis, 'approved_lesson')
  assert.equal(result.matchKind, 'explicit')
  assert.equal(result.canLink, false)
})

test('only permits overdue-hold release for no-lesson or ordinary rejected attendance', () => {
  const noLesson = diagnoseOverdueBookings([booking()], [], '2026-08-16')[0]
  const rejected = diagnoseOverdueBookings(
    [booking()],
    [lesson({ status: 'rejected', bookingRequestId: 'booking-1' })],
    '2026-08-16',
  )[0]
  const approved = diagnoseOverdueBookings(
    [booking()],
    [lesson({ bookingRequestId: 'booking-1' })],
    '2026-08-16',
  )[0]

  assert.equal(canReleaseDiagnosedOverdueBookingHold(noLesson), true)
  assert.equal(canReleaseDiagnosedOverdueBookingHold(rejected), true)
  assert.equal(canReleaseDiagnosedOverdueBookingHold(approved), false)
})

test('never permits overdue-hold release from a reconciled attendance record', () => {
  const result = diagnoseOverdueBookings(
    [booking()],
    [lesson({
      status: 'rejected',
      bookingRequestId: 'booking-1',
      bookingSubjectReconciliation: {
        kind: 'prelinked_subject_mismatch',
        bookingIds: ['booking-1'],
        bookingSubjectId: 'legacy-subject',
        reportedSubjectId: 'subject-1',
        settlementSubjectId: 'subject-1',
        settlementSubjectName: 'Tiếng Anh 1 Kỹ Năng - Level 1',
        reconciledAt: {} as Lesson['createdAt'],
      },
    })],
    '2026-08-16',
  )[0]

  assert.equal(result.diagnosis, 'rejected_lesson')
  assert.equal(canReleaseDiagnosedOverdueBookingHold(result), false)
})

test('fails closed when a same-teacher lesson has a different duration', () => {
  const result = diagnoseOverdueBookings(
    [booking()],
    [lesson({ minutes: 50 })],
    '2026-08-16',
  )[0]

  assert.equal(result.diagnosis, 'ambiguous_lesson')
  assert.equal(result.canLink, false)
})

test('fails closed when multiple same-teacher bookings or lessons are possible', () => {
  const result = diagnoseOverdueBookings(
    [booking(), booking({ id: 'booking-2', requestedStart: '20:30', requestedEnd: '20:55' })],
    [lesson(), lesson({ id: 'lesson-2' })],
    '2026-08-16',
  )

  assert.equal(result[0].diagnosis, 'ambiguous_lesson')
  assert.equal(result[1].diagnosis, 'ambiguous_lesson')
})

test('flags an explicit reference to a different teacher as a conflict', () => {
  const result = diagnoseOverdueBookings(
    [booking()],
    [lesson({ teacherId: 'teacher-mai', bookingRequestId: 'booking-1' })],
    '2026-08-16',
  )[0]

  assert.equal(result.diagnosis, 'conflicting_link')
  assert.equal(result.canLink, false)
})

test('ignores cancelled attendance records', () => {
  const result = diagnoseOverdueBookings(
    [booking()],
    [lesson({ status: 'cancelled' })],
    '2026-08-16',
  )[0]

  assert.equal(result.diagnosis, 'no_lesson')
  assert.equal(result.canLink, false)
})

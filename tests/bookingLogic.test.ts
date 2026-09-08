import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RECONCILIATION_MANUAL_ROLLBACK_REQUIRED,
  assertAutomaticReconciliationRollbackAllowed,
  findConsecutiveAttendanceBookings,
  getPrelinkedSubjectMismatchCandidate,
  isBookingAttended,
  isBookingCancellable,
  matchesLessonBookingSubject,
  recoverLegacySingleBookingReference,
  requiresIndividualSubjectReconciliation,
  selectLegacyExcusedAbsenceBookingByScheduleCheck,
  selectLessonBookingMatches,
  selectUniqueContiguousBookingSet,
  validateExplicitLessonBookings,
  validatePrelinkedSubjectMismatchForApproval,
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

test('does not merge disjoint same-day bookings merely because their minutes add up', () => {
  assert.throws(
    () => selectLessonBookingMatches([
      booking('morning', '08:00'),
      booking('evening', '20:00'),
    ], lesson(50)),
    /BOOKING_MATCH_AMBIGUOUS/,
  )
})

test('reports an explicit booking subject mismatch instead of treating it as an unbooked lesson', () => {
  assert.throws(
    () => selectLessonBookingMatches([
      booking('other-subject', '20:00', { requestedMinutes: 50, subjectId: 'subject-2' }),
    ], lesson(50)),
    /BOOKING_SUBJECT_MISMATCH/,
  )
  assert.deepEqual(
    selectLessonBookingMatches([
      booking('released-other-subject', '20:00', {
        requestedMinutes: 50,
        subjectId: 'subject-2',
        status: 'released',
      }),
    ], lesson(50)),
    [],
  )
})

test('ignores released bookings when using the legacy fallback matcher', () => {
  const active = booking('active', '20:00', { requestedMinutes: 50 })
  const released = booking('released', '20:30', { requestedMinutes: 50, status: 'released' })
  assert.deepEqual(selectLessonBookingMatches([released, active], lesson(50)).map((item) => item.id), ['active'])
})

test('recovers one legacy 25-minute ID only when its full contiguous block proves a 50-minute lesson', () => {
  const first = booking('b1', '20:00', { lessonId: 'lesson-1' })
  const second = booking('b2', '20:30')

  assert.deepEqual(
    recoverLegacySingleBookingReference([first, second], [first], lesson(50)).map((item) => item.id),
    ['b1', 'b2'],
  )
})

test('does not guess a partial legacy link inside a longer contiguous block or another lesson', () => {
  const first = booking('b1', '20:00', { lessonId: 'lesson-1' })
  const second = booking('b2', '20:30')
  const third = booking('b3', '21:00')

  assert.deepEqual(
    recoverLegacySingleBookingReference([first, second, third], [first], lesson(50)),
    [],
  )
  assert.deepEqual(
    recoverLegacySingleBookingReference([first, booking('other', '20:30', { lessonId: 'other-lesson' })], [first], lesson(50)),
    [],
  )
})

test('requires one whole contiguous block instead of choosing between multiple possible attendance groups', () => {
  const morning = [booking('morning-a', '08:00'), booking('morning-b', '08:30')]
  const evening = [booking('evening-a', '20:00'), booking('evening-b', '20:30')]
  assert.deepEqual(selectUniqueContiguousBookingSet(morning, 50).map((item) => item.id), ['morning-a', 'morning-b'])
  assert.deepEqual(selectUniqueContiguousBookingSet([...morning, ...evening], 50), [])
  assert.deepEqual(selectUniqueContiguousBookingSet([...morning, booking('extra', '09:00')], 50), [])
})

test('does not split an adjacent booking from a longer stored block', () => {
  assert.deepEqual(
    selectUniqueContiguousBookingSet([
      booking('fifty', '20:00', { requestedMinutes: 50 }),
      booking('next', '21:00'),
    ], 50),
    [],
  )
})

test('requires explicit multi-booking references to form one contiguous group', () => {
  assert.equal(validateExplicitLessonBookings([
    booking('morning', '08:00'),
    booking('evening', '20:00'),
  ], lesson(50)), false)
  assert.equal(validateExplicitLessonBookings([
    booking('first', '20:00'),
    booking('second', '20:30'),
  ], lesson(50)), true)
})

test('keeps a uniquely matching legacy single booking even when its display start is absent', () => {
  const legacy = booking('legacy', '', { requestedMinutes: 50, requestedEnd: '' })
  assert.deepEqual(selectUniqueContiguousBookingSet([legacy], 50).map((item) => item.id), ['legacy'])
})

test('keeps legacy bookings eligible but never groups two explicit different subjects', () => {
  assert.equal(matchesLessonBookingSubject(booking('english', '20:00'), 'subject-1'), true)
  assert.equal(matchesLessonBookingSubject(booking('math', '20:00', { subjectId: 'subject-2' }), 'subject-1'), false)
  assert.equal(matchesLessonBookingSubject(booking('legacy', '20:00', { subjectId: undefined }), 'subject-1'), true)
})

test('matches one scheduled booking to a zero-minute excused absence when a legacy booking reference is missing', () => {
  const scheduled = booking('scheduled', '20:00')
  const absentLesson = lesson(0, { isZeroMinuteExcusedAbsence: true })

  assert.deepEqual(selectLessonBookingMatches([scheduled], absentLesson).map((item) => item.id), ['scheduled'])
})

test('uses the saved schedule snapshot to recover exactly one 0-minute legacy absence from two slots', () => {
  const first = booking('first', '20:00', { requestedEnd: '20:25' })
  const second = booking('second', '20:30', { requestedEnd: '20:55' })
  const absentLesson = lesson(0, {
    isZeroMinuteExcusedAbsence: true,
    scheduleCheck: { bookingStart: '20:00', bookingEnd: '20:25' },
  })

  assert.deepEqual(
    selectLegacyExcusedAbsenceBookingByScheduleCheck([first, second], absentLesson).map((item) => item.id),
    ['first'],
  )
})

test('does not recover a 0-minute absence when its saved schedule snapshot does not prove one booking', () => {
  const first = booking('first', '20:00', { requestedEnd: '20:25' })
  const second = booking('second', '20:30', { requestedEnd: '20:55' })

  assert.deepEqual(
    selectLegacyExcusedAbsenceBookingByScheduleCheck([first, second], lesson(0, {
      isZeroMinuteExcusedAbsence: true,
      scheduleCheck: { bookingStart: '20:00', bookingEnd: '20:55' },
    })),
    [],
  )
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

test('allows settlement only to the canonical lesson package for an exact prelinked legacy subject group', () => {
  const bookings = [
    booking('b1', '19:00', {
      requestedEnd: '19:25',
      lessonId: 'lesson-1',
      subjectId: 'legacy-l3',
      subjectName: 'VN-1S-L3',
    }),
    booking('b2', '19:30', {
      requestedEnd: '19:55',
      lessonId: 'lesson-1',
      subjectId: 'legacy-l3',
      subjectName: 'VN-1S-L3',
    }),
  ]
  const currentLesson = lesson(50, {
    subjectId: 'current-l2',
    subjectName: 'VN-1S-L2',
    bookingRequestIds: ['b1', 'b2'],
  })
  const candidate = getPrelinkedSubjectMismatchCandidate(bookings, currentLesson)
  assert.deepEqual(candidate, {
    bookingIds: ['b1', 'b2'],
    bookingSubjectId: 'legacy-l3',
    bookingSubjectName: 'VN-1S-L3',
    bookingStart: '19:00',
    bookingEnd: '19:55',
    totalMinutes: 50,
  })
  assert.equal(validatePrelinkedSubjectMismatchForApproval(bookings, currentLesson, {
    kind: 'prelinked_subject_mismatch',
    bookingIds: ['b1', 'b2'],
    bookingSubjectId: 'legacy-l3',
    bookingSubjectName: 'VN-1S-L3',
    reportedSubjectId: 'current-l2',
    reportedSubjectName: 'VN-1S-L2',
    settlementSubjectId: 'current-l2',
    settlementSubjectName: 'VN-1S-L2',
    reason: 'Đã xác nhận lịch cũ phải hạch toán sang gói VN-1S-L2.',
    confirmed: true,
  }), true)
})

test('rejects a third-package settlement for an otherwise exact prelinked subject mismatch', () => {
  const bookings = [booking('legacy-booking', '19:00', {
    requestedEnd: '19:50',
    requestedMinutes: 50,
    lessonId: 'lesson-1',
    subjectId: 'legacy-l3',
    subjectName: 'VN-1S-L3',
  })]
  const currentLesson = lesson(50, {
    subjectId: 'current-l2',
    subjectName: 'VN-1S-L2',
    bookingRequestId: 'legacy-booking',
  })

  assert.equal(validatePrelinkedSubjectMismatchForApproval(bookings, currentLesson, {
    kind: 'prelinked_subject_mismatch',
    bookingIds: ['legacy-booking'],
    bookingSubjectId: 'legacy-l3',
    bookingSubjectName: 'VN-1S-L3',
    reportedSubjectId: 'current-l2',
    reportedSubjectName: 'VN-1S-L2',
    settlementSubjectId: 'third-package-l1',
    settlementSubjectName: 'VN-1S-L1',
    reason: 'Đã đối chiếu lịch cũ nhưng không được hạch toán sang gói môn thứ ba.',
    confirmed: true,
  }), false)
})

test('fails closed when a subject reconciliation is not exact, contiguous, active and confirmed', () => {
  const validBookings = [
    booking('b1', '19:00', { requestedEnd: '19:25', lessonId: 'lesson-1', subjectId: 'legacy-l3' }),
    booking('b2', '19:30', { requestedEnd: '19:55', lessonId: 'lesson-1', subjectId: 'legacy-l3' }),
  ]
  const currentLesson = lesson(50, { bookingRequestIds: ['b1', 'b2'] })
  const draft = {
    kind: 'prelinked_subject_mismatch' as const,
    bookingIds: ['b1', 'b2'],
    bookingSubjectId: 'legacy-l3',
    reportedSubjectId: 'subject-1',
    settlementSubjectId: 'current-l2',
    settlementSubjectName: 'VN-1S-L2',
    reason: 'Đã đối chiếu với giáo vụ và chọn đúng gói hiện tại.',
    confirmed: true,
  }

  assert.equal(validatePrelinkedSubjectMismatchForApproval(validBookings, currentLesson, { ...draft, confirmed: false }), false)
  assert.equal(validatePrelinkedSubjectMismatchForApproval(validBookings, currentLesson, { ...draft, reason: 'ngắn' }), false)
  assert.equal(validatePrelinkedSubjectMismatchForApproval(validBookings, currentLesson, { ...draft, bookingIds: ['b1'] }), false)
  assert.equal(validatePrelinkedSubjectMismatchForApproval([
    validBookings[0],
    booking('b2', '21:00', { requestedEnd: '21:25', lessonId: 'lesson-1', subjectId: 'legacy-l3' }),
  ], currentLesson, draft), false)
  assert.equal(validatePrelinkedSubjectMismatchForApproval([
    validBookings[0],
    { ...validBookings[1], status: 'released' },
  ], currentLesson, draft), false)
  assert.equal(validatePrelinkedSubjectMismatchForApproval([
    validBookings[0],
    { ...validBookings[1], lessonId: 'another-lesson' },
  ], currentLesson, draft), false)
  assert.equal(validatePrelinkedSubjectMismatchForApproval([
    { ...validBookings[0], groupClassId: 'group-1' },
    { ...validBookings[1], groupClassId: 'group-1' },
  ], currentLesson, draft), false)
})

test('a stored subject reconciliation is excluded from bulk and automatic rollback handling', () => {
  const reconciledLesson = lesson(50, {
    subjectId: 'current-l2',
    bookingSubjectReconciliation: {
      kind: 'prelinked_subject_mismatch',
      bookingIds: ['b1', 'b2'],
      bookingSubjectId: 'legacy-l3',
      reportedSubjectId: 'legacy-l3',
      settlementSubjectId: 'current-l2',
      settlementSubjectName: 'VN-1S-L2',
      reconciledAt: {} as never,
    },
  })

  assert.equal(requiresIndividualSubjectReconciliation(reconciledLesson), true)
  assert.equal(requiresIndividualSubjectReconciliation(lesson(50)), false)
  assert.throws(
    () => assertAutomaticReconciliationRollbackAllowed(reconciledLesson),
    { message: RECONCILIATION_MANUAL_ROLLBACK_REQUIRED },
  )
  assert.doesNotThrow(() => assertAutomaticReconciliationRollbackAllowed(lesson(50)))
  const automaticBulkTargets = [reconciledLesson, lesson(50, { id: 'ordinary-lesson' })]
    .filter((item) => !requiresIndividualSubjectReconciliation(item))
  assert.deepEqual(automaticBulkTargets.map((item) => item.id), ['ordinary-lesson'])
})

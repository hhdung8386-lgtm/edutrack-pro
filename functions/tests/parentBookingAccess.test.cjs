const assert = require('node:assert/strict')
const test = require('node:test')

const {
  PARENT_BOOKING_ACCESS_MAX_BUSY_DAYS,
  PARENT_BOOKING_ACCESS_MAX_TEACHERS,
  PARENT_BOOKING_CANCELLATION_WINDOW_MS,
  ParentBookingAccessValidationError,
  assertParentCancellationAllowed,
  normalizeParentBookingAccessRequest,
  normalizeParentBookingCancellationRequest,
  parentBookingResponse,
  parentBusySlotResponse,
  parentCancellationPoints,
  parentCancellationResponse,
  vietnamBookingStartMillis,
} = require('../lib/parentBookingAccess.js')

function cancellationRequest(overrides = {}) {
  return normalizeParentBookingCancellationRequest({
    studentId: 'student-a',
    studentCode: 'HS12AB34',
    bookingId: 'booking-a',
    reason: 'Đổi lịch học',
    ...overrides,
  })
}

function confirmedBooking(overrides = {}) {
  return {
    id: 'booking-a',
    status: 'confirmed',
    teacherId: 'teacher-a',
    studentId: 'student-a',
    studentCode: 'HS12AB34',
    requestedDate: '2026-09-09',
    requestedStart: '19:00',
    requestedEnd: '19:50',
    requestedMinutes: 50,
    requestedPoints: 50,
    ...overrides,
  }
}

test('parent access input canonicalizes identity, deduplicates tutors and rejects over-broad requests', () => {
  assert.deepEqual(normalizeParentBookingAccessRequest({
    studentId: ' student-a ',
    studentCode: ' hs12ab34 ',
    teacherIds: ['teacher-a', 'teacher-a', 'teacher-b'],
  }), {
    studentId: 'student-a',
    studentCode: 'HS12AB34',
    teacherIds: ['teacher-a', 'teacher-b'],
  })

  assert.throws(
    () => normalizeParentBookingAccessRequest({
      studentId: 'student-a',
      studentCode: 'HS12AB34',
      teacherIds: Array.from({ length: PARENT_BOOKING_ACCESS_MAX_TEACHERS + 1 }, (_, index) => `teacher-${index}`),
    }),
    (error) => error instanceof ParentBookingAccessValidationError
      && error.reason === 'PARENT_BOOKING_TEACHER_LIMIT',
  )
  assert.throws(
    () => normalizeParentBookingAccessRequest({ studentId: '../student', studentCode: 'HS12AB34', teacherIds: [] }),
    (error) => error instanceof ParentBookingAccessValidationError
      && error.reason === 'PARENT_BOOKING_STUDENT_INVALID',
  )
  assert.throws(
    () => normalizeParentBookingAccessRequest({ studentId: 'student-a', studentCode: 'public-code', teacherIds: [] }),
    (error) => error instanceof ParentBookingAccessValidationError
      && error.reason === 'PARENT_BOOKING_STUDENT_INVALID',
  )
})

test('parent busy-window input accepts real bounded dates and rejects partial or oversized ranges', () => {
  assert.deepEqual(normalizeParentBookingAccessRequest({
    studentId: 'student-a',
    studentCode: 'HS12AB34',
    teacherIds: ['teacher-a'],
    busyFromDate: '2026-09-08',
    busyToDate: '2026-09-14',
  }), {
    studentId: 'student-a',
    studentCode: 'HS12AB34',
    teacherIds: ['teacher-a'],
    busyFromDate: '2026-09-08',
    busyToDate: '2026-09-14',
  })

  for (const input of [
    { busyFromDate: '2026-09-08' },
    { busyFromDate: '2026-02-30', busyToDate: '2026-03-01' },
    { busyFromDate: '2026-09-10', busyToDate: '2026-09-09' },
    { busyFromDate: '2026-09-01', busyToDate: `2026-09-${String(PARENT_BOOKING_ACCESS_MAX_BUSY_DAYS + 1).padStart(2, '0')}` },
  ]) {
    assert.throws(
      () => normalizeParentBookingAccessRequest({
        studentId: 'student-a',
        studentCode: 'HS12AB34',
        teacherIds: ['teacher-a'],
        ...input,
      }),
      (error) => error instanceof ParentBookingAccessValidationError
        && error.reason === 'PARENT_BOOKING_DATE_WINDOW_INVALID',
    )
  }
})

test('parent cancellation input is bounded and never accepts unsafe document ids', () => {
  const normalized = cancellationRequest({ reason: `  ${'x'.repeat(600)}  ` })
  assert.equal(normalized.reason.length, 500)
  assert.equal(normalized.studentCode, 'HS12AB34')

  assert.throws(
    () => cancellationRequest({ bookingId: 'booking/a' }),
    (error) => error instanceof ParentBookingAccessValidationError
      && error.reason === 'PARENT_BOOKING_ID_INVALID',
  )
})

test('parent booking payload is allow-listed and timestamp values are converted to milliseconds', () => {
  const response = parentBookingResponse('booking-a', {
    status: 'confirmed',
    teacherId: 'teacher-a',
    teacherCode: 'Nicole',
    teacherName: 'Private legal name',
    teacherPhotoURL: 'https://example.test/nicole.jpg',
    studentId: 'student-a',
    studentCode: 'HS12AB34',
    studentName: 'Học viên A',
    requestedDate: '2026-09-09',
    requestedStart: '19:00',
    requestedEnd: '19:50',
    requestedMinutes: 50,
    requestedPoints: 50,
    createdAt: { toMillis: () => 1_789_000_000_000 },
    confirmedAt: new Date('2026-09-08T00:00:00.000Z'),
    payrollAmount: 41_667,
    guardianEmail: 'private@example.test',
    internalNote: 'do not expose',
  })

  assert.equal(response.teacherName, 'Nicole')
  assert.equal(response.createdAtMs, 1_789_000_000_000)
  assert.equal(response.confirmedAtMs, Date.parse('2026-09-08T00:00:00.000Z'))
  assert.equal(response.requestedPoints, 50)
  assert.equal(Object.hasOwn(response, 'payrollAmount'), false)
  assert.equal(Object.hasOwn(response, 'guardianEmail'), false)
  assert.equal(Object.hasOwn(response, 'internalNote'), false)
})

test('busy-slot and cancellation payloads disclose only scheduling and ownership fields', () => {
  const busy = parentBusySlotResponse('busy-a', {
    status: 'confirmed',
    teacherId: 'teacher-a',
    requestedDate: '2026-09-09',
    requestedStart: '19:00',
    requestedEnd: '19:50',
    requestedMinutes: 50,
    studentId: 'student-secret',
    studentName: 'Do not expose',
    note: 'Do not expose',
    classroomURL: 'https://secret.example.test',
    requestedPoints: 50,
  })
  assert.deepEqual(Object.keys(busy).sort(), [
    'id', 'requestedDate', 'requestedEnd', 'requestedMinutes', 'requestedStart', 'status', 'teacherId',
  ])

  const cancellation = parentCancellationResponse('cancel-a', {
    bookingId: 'booking-a',
    studentId: 'student-a',
    studentCode: 'HS12AB34',
    studentName: 'Học viên A',
    status: 'resolved',
    requestedAt: { seconds: 1_789_000_000 },
    reviewedAt: { _seconds: 1_789_000_100 },
    adminNote: 'private',
  })
  assert.equal(cancellation.requestedAtMs, 1_789_000_000_000)
  assert.equal(cancellation.resolvedAtMs, 1_789_000_100_000)
  assert.equal(Object.hasOwn(cancellation, 'adminNote'), false)
})

test('Vietnam booking start validates real calendar values and uses UTC+7', () => {
  assert.equal(
    vietnamBookingStartMillis({ requestedDate: '2026-09-09', requestedStart: '19:00' }),
    Date.parse('2026-09-09T12:00:00.000Z'),
  )
  assert.equal(vietnamBookingStartMillis({ requestedDate: '2026-02-30', requestedStart: '19:00' }), null)
  assert.equal(vietnamBookingStartMillis({ requestedDate: '2026-09-09', requestedStart: '24:00' }), null)
})

test('cancellation point calculation prefers the immutable booking snapshot and fails closed on invalid fallback', () => {
  assert.equal(parentCancellationPoints({ requestedPoints: 70, requestedMinutes: 50 }, { pointsPer25Minutes: 35 }), 70)
  assert.equal(parentCancellationPoints({ requestedMinutes: 50 }, { pointsPer25Minutes: 35 }), 70)
  assert.equal(parentCancellationPoints({ requestedMinutes: 50 }, { pointsPer25Minutes: 0 }), null)
})

test('confirmed parent cancellation enforces ownership, held points and the one-hour boundary', () => {
  const request = cancellationRequest()
  const booking = confirmedBooking()
  const startsAtMs = vietnamBookingStartMillis(booking)
  assert.ok(startsAtMs !== null)

  assert.deepEqual(assertParentCancellationAllowed(
    booking,
    { code: 'HS12AB34', reservedMinutes: 75 },
    { pointsPer25Minutes: 25 },
    request,
    startsAtMs - PARENT_BOOKING_CANCELLATION_WINDOW_MS,
  ), { heldPoints: 50, currentHeld: 75 })

  assert.throws(
    () => assertParentCancellationAllowed(
      booking,
      { code: 'HS12AB34', reservedMinutes: 75 },
      { pointsPer25Minutes: 25 },
      request,
      startsAtMs - PARENT_BOOKING_CANCELLATION_WINDOW_MS + 1,
    ),
    (error) => error instanceof ParentBookingAccessValidationError
      && error.reason === 'CANCELLATION_WINDOW_CLOSED',
  )
  assert.throws(
    () => assertParentCancellationAllowed(
      booking,
      { code: 'HS12AB34', reservedMinutes: 25 },
      { pointsPer25Minutes: 25 },
      request,
      startsAtMs - PARENT_BOOKING_CANCELLATION_WINDOW_MS,
    ),
    (error) => error instanceof ParentBookingAccessValidationError
      && error.reason === 'INVALID_HELD_POINTS',
  )
})

test('pending parent cancellation requires proof that the booking already holds points', () => {
  const request = cancellationRequest()
  const pendingBooking = confirmedBooking({ status: 'pending' })
  const student = { code: 'HS12AB34', reservedMinutes: 100 }
  const teacher = { pointsPer25Minutes: 25 }
  const nowMs = Date.parse('2026-09-08T00:00:00.000Z')

  assert.throws(
    () => assertParentCancellationAllowed(pendingBooking, student, teacher, request, nowMs),
    (error) => error instanceof ParentBookingAccessValidationError
      && error.reason === 'INVALID_HELD_POINTS',
  )

  assert.deepEqual(assertParentCancellationAllowed(
    { ...pendingBooking, heldImmediately: true },
    student,
    teacher,
    request,
    nowMs,
  ), { heldPoints: 50, currentHeld: 100 })
})

test('parent cancellation rejects processed, cross-student, group and unresolved-rebook bookings', () => {
  const request = cancellationRequest()
  const student = { code: 'HS12AB34', reservedMinutes: 100 }
  const teacher = { pointsPer25Minutes: 25 }
  const nowMs = Date.parse('2026-09-08T00:00:00.000Z')
  const cases = [
    [confirmedBooking({ lessonId: 'lesson-a' }), student, 'BOOKING_ALREADY_PROCESSED'],
    [confirmedBooking({ studentId: 'student-b' }), student, 'STUDENT_MISMATCH'],
    [confirmedBooking({ groupClassId: 'group-a' }), student, 'GROUP_BOOKING_MANAGED'],
    [confirmedBooking(), { ...student, pendingRebookBookingId: 'booking-old' }, 'REBOOK_REQUIRED'],
  ]

  for (const [booking, studentRow, reason] of cases) {
    assert.throws(
      () => assertParentCancellationAllowed(booking, studentRow, teacher, request, nowMs),
      (error) => error instanceof ParentBookingAccessValidationError && error.reason === reason,
    )
  }
})

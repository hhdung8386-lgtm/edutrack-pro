const test = require('node:test')
const assert = require('node:assert/strict')

const {
  ParentProfileBookingValidationError,
  assertParentProfileBookingRequestFuture,
  decideParentProfileBookingHold,
  effectiveParentBookingHolds,
  normalizeParentProfileBookingRequest,
  parentBookingPoints,
  parentProfileBookingConflictReason,
  parentProfileBookingFingerprint,
  parentProfileBookingQuota,
  parentProfileBookingRequestDocumentId,
  parentProfileReusableRebookPoints,
  teacherAvailabilityCoversParentBooking,
} = require('../lib/parentProfileBooking.js')

function request(overrides = {}) {
  return normalizeParentProfileBookingRequest({
    studentId: 'student-a',
    studentCode: 'HS123456',
    teacherId: 'teacher-a',
    subjectId: 'subject-a',
    requestedDay: 'wed',
    requestedDate: '2026-09-09',
    requestedWeekStart: '2026-09-07',
    requestedStart: '19:00',
    requestedMinutes: 50,
    clientRequestId: 'parent-booking-request-0001',
    ...overrides,
  })
}

test('normalizes one exact Vietnam-calendar slot and enforces future bounds separately for retry recovery', () => {
  const normalized = request()
  assert.equal(normalized.requestedEnd, '19:50')
  assert.doesNotThrow(() => assertParentProfileBookingRequestFuture(normalized, Date.parse('2026-09-08T00:00:00Z')))
  assert.throws(
    () => assertParentProfileBookingRequestFuture(normalized, normalized.startsAtMs),
    (error) => error instanceof ParentProfileBookingValidationError && error.reason === 'PARENT_BOOKING_SLOT_PAST',
  )
  assert.throws(
    () => request({ requestedDay: 'thu' }),
    (error) => error instanceof ParentProfileBookingValidationError && error.reason === 'PARENT_BOOKING_CALENDAR_INVALID',
  )
})

test('idempotency identifiers are stable and the fingerprint covers every booking selection field', () => {
  const first = request()
  const reorderedInput = request()
  assert.equal(parentProfileBookingFingerprint(first), parentProfileBookingFingerprint(reorderedInput))
  assert.notEqual(parentProfileBookingFingerprint(first), parentProfileBookingFingerprint(request({ requestedStart: '19:30' })))
  assert.equal(
    parentProfileBookingRequestDocumentId('student-a', 'request-123456789'),
    parentProfileBookingRequestDocumentId('student-a', 'request-123456789'),
  )
  assert.notEqual(
    parentProfileBookingRequestDocumentId('student-a', 'request-123456789'),
    parentProfileBookingRequestDocumentId('student-b', 'request-123456789'),
  )
})

test('weekly availability must explicitly cover the whole slot and honors the selected week override', () => {
  const normalized = request()
  const availability = {
    slots: {
      wed: { available: true, timeRanges: [{ start: '18:00', end: '21:00' }] },
    },
    weekOverrides: {
      '2026-09-07': {
        slots: {
          wed: { available: true, timeRanges: [{ start: '19:00', end: '19:50' }] },
        },
      },
    },
  }
  assert.equal(teacherAvailabilityCoversParentBooking(availability, normalized), true)
  assert.equal(teacherAvailabilityCoversParentBooking({
    ...availability,
    weekOverrides: {
      '2026-09-07': { slots: { wed: { available: false, timeRanges: [{ start: '18:00', end: '21:00' }] } } },
    },
  }, normalized), false)
  assert.equal(teacherAvailabilityCoversParentBooking({
    slots: { wed: { available: true, timeRanges: [{ start: '19:10', end: '21:00' }] } },
  }, normalized), false)
})

test('quota requires the selected subject id to identify exactly one package row', () => {
  const quota = parentProfileBookingQuota({
    subjects: [
      { subjectId: 'subject-a', subjectName: 'VN-1S-L2', totalMinutes: 300, usedMinutes: 100 },
      { subjectId: 'subject-b', subjectName: 'Other', totalMinutes: 500, usedMinutes: 0 },
    ],
  }, 'subject-a')
  assert.deepEqual(quota, {
    subjectId: 'subject-a',
    subjectName: 'VN-1S-L2',
    subjectRemainingPoints: 200,
    totalRemainingPoints: 700,
  })
  assert.equal(parentProfileBookingQuota({
    subjects: [
      { subjectId: 'subject-a', totalMinutes: 300, usedMinutes: 100 },
      { subjectId: 'subject-a', totalMinutes: 200, usedMinutes: 50 },
    ],
  }, 'subject-a'), null)
  assert.equal(parentBookingPoints(50, 35), 70)
})

test('hold accounting ignores the selected teacher other students and group-class member rows', () => {
  const holds = effectiveParentBookingHolds({ reservedMinutes: 80 }, [
    { id: 'own', status: 'confirmed', studentId: 'student-a', subjectId: 'subject-a', requestedMinutes: 50, pointsPer25Minutes: 25 },
    { id: 'group', status: 'pending', studentId: 'group-a', groupClassMemberIds: ['student-a'], subjectId: 'subject-a', requestedMinutes: 25, pointsPer25Minutes: 25 },
    { id: 'other-student', status: 'confirmed', studentId: 'student-b', teacherId: 'teacher-a', subjectId: 'subject-a', requestedMinutes: 100, pointsPer25Minutes: 60 },
    { id: 'declined', status: 'pending', teacherResponse: 'declined', studentId: 'student-a', subjectId: 'subject-a', requestedMinutes: 100, pointsPer25Minutes: 60 },
    { id: 'orphan-rebook', status: 'released', selfServiceCancelled: true, pendingRebook: true, studentId: 'student-a', subjectId: 'subject-a', rebookHoldPoints: 30 },
  ], 'subject-a', 'student-a')
  assert.deepEqual(holds, {
    storedHeldPoints: 80,
    activeHeldPoints: 80,
    subjectHeldPoints: 80,
    effectiveHeldPoints: 80,
  })
})

test('hold decision backs the whole subject booking while reusing only global rebook hold', () => {
  assert.deepEqual(decideParentProfileBookingHold({
    subjectRemainingPoints: 100,
    totalRemainingPoints: 300,
    subjectHeldPoints: 70,
    effectiveHeldPoints: 70,
    requestedPoints: 50,
    reusablePoints: 70,
    subjectReusablePoints: 70,
  }), { ok: true, additionalHeldPoints: -20, heldAfterRequest: 50 })
  assert.deepEqual(decideParentProfileBookingHold({
    subjectRemainingPoints: 40,
    totalRemainingPoints: 300,
    subjectHeldPoints: 70,
    effectiveHeldPoints: 70,
    requestedPoints: 50,
    reusablePoints: 70,
    subjectReusablePoints: 70,
  }), { ok: false, reason: 'subject-quota' })
  assert.deepEqual(decideParentProfileBookingHold({
    subjectRemainingPoints: 200,
    totalRemainingPoints: 100,
    subjectHeldPoints: 0,
    effectiveHeldPoints: 90,
    requestedPoints: 50,
    reusablePoints: 0,
    subjectReusablePoints: 0,
  }), { ok: false, reason: 'global-quota' })
  assert.deepEqual(decideParentProfileBookingHold({
    subjectRemainingPoints: 100,
    totalRemainingPoints: 300,
    subjectHeldPoints: 70,
    effectiveHeldPoints: 100,
    requestedPoints: 50,
    reusablePoints: 50,
    subjectReusablePoints: 70,
  }), { ok: false, reason: 'invalid-hold' })
  assert.deepEqual(decideParentProfileBookingHold({
    subjectRemainingPoints: 100,
    totalRemainingPoints: 300,
    subjectHeldPoints: 80,
    effectiveHeldPoints: 80,
    requestedPoints: 50,
    reusablePoints: 0,
    subjectReusablePoints: 0,
  }), { ok: false, reason: 'subject-quota' })
})

test('only the exact referenced same-subject pending rebook hold is reusable', () => {
  const normalized = request()
  const oldBooking = {
    id: 'old-booking',
    status: 'released',
    selfServiceCancelled: true,
    pendingRebook: true,
    studentId: normalized.studentId,
    studentCode: normalized.studentCode,
    subjectId: normalized.subjectId,
    rebookHoldPoints: 50,
  }
  assert.equal(parentProfileReusableRebookPoints({
    booking: oldBooking,
    request: normalized,
    pendingRebookPoints: 50,
    effectiveHeldPoints: 50,
  }), 50)
  assert.equal(parentProfileReusableRebookPoints({
    booking: { ...oldBooking, subjectId: 'another-subject' },
    request: normalized,
    pendingRebookPoints: 50,
    effectiveHeldPoints: 50,
  }), null)
  assert.equal(parentProfileReusableRebookPoints({
    booking: { ...oldBooking, pendingRebook: false },
    request: normalized,
    pendingRebookPoints: 50,
    effectiveHeldPoints: 50,
  }), null)
})

test('conflicts are detected for either participant across midnight and corrupt nearby rows fail closed', () => {
  const normalized = request({ requestedStart: '23:30', requestedMinutes: 50 })
  assert.equal(parentProfileBookingConflictReason(normalized, [{
    id: 'teacher-conflict',
    status: 'confirmed',
    teacherId: 'teacher-a',
    studentId: 'student-b',
    requestedDate: '2026-09-10',
    requestedStart: '00:00',
    requestedEnd: '00:20',
    requestedMinutes: 20,
  }]), 'teacher')
  assert.equal(parentProfileBookingConflictReason(normalized, [{
    id: 'student-conflict',
    status: 'pending',
    teacherId: 'teacher-b',
    studentId: 'student-a',
    requestedDate: '2026-09-09',
    requestedStart: '24:00',
    requestedEnd: '24:30',
    requestedMinutes: 30,
  }]), 'student')
  assert.equal(parentProfileBookingConflictReason(normalized, [{
    id: 'corrupt',
    status: 'confirmed',
    teacherId: 'teacher-a',
    requestedDate: '2026-09-09',
    requestedStart: 'bad',
  }]), 'invalid-existing-booking')
})

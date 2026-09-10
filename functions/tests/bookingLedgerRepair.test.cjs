const test = require('node:test')
const assert = require('node:assert/strict')

const {
  approvedBookingSettlementIds,
  isApprovedBookingSettlementCandidate,
} = require('../lib/bookingLedgerRepair.js')

function booking(overrides = {}) {
  return {
    id: 'booking-1',
    status: 'confirmed',
    lessonId: 'lesson-1',
    studentId: 'student-1',
    studentCode: 'HS123456',
    teacherId: 'teacher-1',
    requestedDate: '2026-09-09',
    subjectId: 'subject-1',
    ...overrides,
  }
}

function lesson(overrides = {}) {
  return {
    id: 'lesson-1',
    status: 'approved',
    studentId: 'student-1',
    studentCode: 'HS123456',
    teacherId: 'teacher-1',
    date: '2026-09-09',
    subjectId: 'subject-1',
    ...overrides,
  }
}

test('settles only active bookings with an exact approved lesson identity', () => {
  assert.equal(isApprovedBookingSettlementCandidate(booking(), lesson()), true)
  assert.equal(isApprovedBookingSettlementCandidate(booking({ status: 'completed' }), lesson()), false)
  assert.equal(isApprovedBookingSettlementCandidate(booking(), lesson({ status: 'pending' })), false)
  assert.equal(isApprovedBookingSettlementCandidate(booking(), lesson({ teacherId: 'teacher-2' })), false)
  assert.equal(isApprovedBookingSettlementCandidate(booking(), lesson({ subjectId: 'subject-2' })), false)
  assert.equal(isApprovedBookingSettlementCandidate(booking(), lesson({ subjectId: 'subject-2', bookingRequestId: 'other-booking' })), false)
  assert.equal(isApprovedBookingSettlementCandidate(booking(), lesson({ subjectId: 'subject-2', bookingRequestId: 'booking-1' })), true)
  assert.equal(isApprovedBookingSettlementCandidate(booking(), lesson({ studentId: 'student-2' })), false)
})

test('settles every verified booking row linked to a combined approved lesson', () => {
  assert.deepEqual(
    approvedBookingSettlementIds([
      booking({ id: 'booking-1' }),
      booking({ id: 'booking-2' }),
      booking({ id: 'pending-1', status: 'pending' }),
    ], [lesson()]),
    ['booking-1', 'booking-2', 'pending-1'],
  )
})

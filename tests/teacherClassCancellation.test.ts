import assert from 'node:assert/strict'
import test from 'node:test'
import {
  lateCancellationPenaltyPayrollId,
  lateTeacherCancellationPenaltyApplies,
} from '../src/lib/teacherClassCancellationPolicy.ts'

const booking = { requestedDate: '2026-09-20', requestedStart: '19:00' }
const startMs = Date.UTC(2026, 8, 20, 12, 0)

test('late cancellation starts strictly below the one-hour notice boundary', () => {
  assert.equal(lateTeacherCancellationPenaltyApplies(booking, startMs - 60 * 60 * 1000), false)
  assert.equal(lateTeacherCancellationPenaltyApplies(booking, startMs - 59 * 60 * 1000), true)
  assert.equal(lateTeacherCancellationPenaltyApplies(booking, startMs), false)
})

test('late cancellation payroll id is deterministic per booking', () => {
  assert.equal(lateCancellationPenaltyPayrollId('booking-123'), 'teacher-cancellation-booking-123')
})

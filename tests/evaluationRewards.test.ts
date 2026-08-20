import test from 'node:test'
import assert from 'node:assert/strict'

import {
  evaluationBasePayrollId,
  evaluationRegistrationPayrollId,
  isValidRegistrationRewardVnd,
  normalizeRegistrationRewardVnd,
} from '../src/lib/evaluationRewards.ts'
import { selectTopRewardStudents } from '../src/lib/rewards.ts'

test('normalizes Vietnamese currency input before validation', () => {
  assert.equal(normalizeRegistrationRewardVnd('40.000 đ'), 40_000)
  assert.equal(normalizeRegistrationRewardVnd('1,250,000'), 1_250_000)
  assert.equal(normalizeRegistrationRewardVnd(''), 0)
})

test('accepts only a safe configured registration reward range', () => {
  assert.equal(isValidRegistrationRewardVnd(999), false)
  assert.equal(isValidRegistrationRewardVnd(1_000), true)
  assert.equal(isValidRegistrationRewardVnd(100_000_000), true)
  assert.equal(isValidRegistrationRewardVnd(100_000_001), false)
  assert.equal(isValidRegistrationRewardVnd(10_000.5), false)
})

test('base and registration payroll ids are deterministic and separate', () => {
  assert.equal(evaluationBasePayrollId('eval-123'), 'evaluation-base-eval-123')
  assert.equal(evaluationRegistrationPayrollId('eval-123'), 'evaluation-registration-eval-123')
  assert.notEqual(evaluationBasePayrollId('eval-123'), evaluationRegistrationPayrollId('eval-123'))
})

test('student leaderboard shows only the three active students with the most total stars', () => {
  const students = [
    { id: 'student-b', rewardPoints: 25, status: 'active' },
    { id: 'student-reserved', rewardPoints: 999, status: 'reserved' },
    { id: 'student-zero', rewardPoints: 0, status: 'active' },
    { id: 'student-d', rewardPoints: 10, status: 'active' },
    { id: 'student-a', rewardPoints: 40, status: 'active' },
    { id: 'student-c', rewardPoints: 15, status: 'active' },
  ]

  assert.deepEqual(
    selectTopRewardStudents(students).map((student) => student.id),
    ['student-a', 'student-b', 'student-c'],
  )
})

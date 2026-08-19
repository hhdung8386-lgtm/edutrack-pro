import test from 'node:test'
import assert from 'node:assert/strict'

import {
  bookingParticipantStudentIds,
  bookingParticipantsOverlap,
  canStudentManageBooking,
  isGroupClass,
  normalizeGroupClassIds,
} from '../src/lib/groupClasses.ts'

test('legacy students remain one-to-one without a migration', () => {
  assert.equal(isGroupClass({}), false)
  assert.equal(isGroupClass({ recordType: 'individual' }), false)
  assert.equal(isGroupClass({ recordType: 'group_class' }), true)
})

test('group booking participants include the class record and every unique member', () => {
  assert.deepEqual(bookingParticipantStudentIds({
    studentId: 'class-1',
    groupClassMemberIds: ['student-1', 'student-2', 'student-1'],
  }), ['class-1', 'student-1', 'student-2'])
})

test('detects schedule overlap between one-to-one and group membership', () => {
  assert.equal(bookingParticipantsOverlap(
    { studentId: 'student-1' },
    { studentId: 'class-1', groupClassMemberIds: ['student-1', 'student-2'] },
  ), true)
  assert.equal(bookingParticipantsOverlap(
    { studentId: 'student-3' },
    { studentId: 'class-1', groupClassMemberIds: ['student-1', 'student-2'] },
  ), false)
})

test('an enrolled account can view but cannot manage a group booking', () => {
  assert.equal(canStudentManageBooking({ studentId: 'student-1' }, 'student-1'), true)
  assert.equal(canStudentManageBooking({ studentId: 'class-1', groupClassId: 'class-1' }, 'student-1'), false)
  assert.equal(canStudentManageBooking({ studentId: 'class-1', groupClassId: 'class-1' }, 'class-1'), false)
})

test('normalizes legacy and duplicated group membership ids', () => {
  assert.deepEqual(normalizeGroupClassIds(undefined), [])
  assert.deepEqual(normalizeGroupClassIds(['class-1', '', 'class-1', 42, 'class-2']), ['class-1', 'class-2'])
})

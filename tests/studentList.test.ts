import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseStoredStudentListLimit,
  studentListLimitStorageKey,
} from '../src/lib/studentList.ts'

test('new student-list sessions load the complete collection by default', () => {
  assert.equal(parseStoredStudentListLimit(null), 0)
  assert.equal(parseStoredStudentListLimit(''), 0)
})

test('an explicit safe display limit remains supported', () => {
  assert.equal(parseStoredStudentListLimit('200'), 200)
  assert.equal(parseStoredStudentListLimit('1000'), 1000)
  assert.equal(parseStoredStudentListLimit('-1'), 0)
  assert.equal(parseStoredStudentListLimit('invalid'), 0)
})

test('versioned key does not inherit the withdrawn aggregate-page limit', () => {
  assert.equal(studentListLimitStorageKey('students_fixed'), 'students_fixed_limitVal_full-list-v1')
  assert.equal(studentListLimitStorageKey('students_flexible'), 'students_flexible_limitVal_full-list-v1')
  assert.equal(studentListLimitStorageKey('students_offline'), 'students_offline_limitVal_full-list-v1')
})

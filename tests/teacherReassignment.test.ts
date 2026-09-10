import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildTeacherReassignmentPatch,
  TEACHER_REASSIGNMENT_ERRORS,
  validateTeacherReassignment,
} from '../src/lib/teacherReassignment.ts'

const booking = {
  status: 'confirmed' as const,
  teacherId: 'holly',
  requestedDate: '2026-09-10',
  requestedStart: '08:00',
  requestedEnd: '08:25',
  requestedMinutes: 25 as const,
}

const emily = {
  id: 'emily',
  code: 'EMILY',
  name: 'Emily',
  status: 'active' as const,
  photoURL: 'https://example.com/emily.jpg',
}

test('reassignment changes only teacher ownership metadata', () => {
  assert.deepEqual(buildTeacherReassignmentPatch(emily), {
    teacherId: 'emily',
    teacherCode: 'EMILY',
    teacherName: 'Emily',
    teacherPhotoURL: 'https://example.com/emily.jpg',
    teacherResponse: 'accepted',
  })
})

test('confirmed and unlinked bookings can be reassigned to an active teacher', () => {
  assert.doesNotThrow(() => validateTeacherReassignment(booking, emily))
})

test('reassignment refuses attended, non-confirmed, inactive, and same-teacher bookings', () => {
  assert.throws(
    () => validateTeacherReassignment({ ...booking, lessonId: 'lesson-1' }, emily),
    new RegExp(TEACHER_REASSIGNMENT_ERRORS.BOOKING_ALREADY_ATTENDED),
  )
  assert.throws(
    () => validateTeacherReassignment({ ...booking, status: 'pending' }, emily),
    new RegExp(TEACHER_REASSIGNMENT_ERRORS.BOOKING_NOT_ACTIVE),
  )
  assert.throws(
    () => validateTeacherReassignment(booking, { ...emily, status: 'resigned' }),
    new RegExp(TEACHER_REASSIGNMENT_ERRORS.TARGET_NOT_ACTIVE),
  )
  assert.throws(
    () => validateTeacherReassignment(booking, { ...emily, id: 'holly' }),
    new RegExp(TEACHER_REASSIGNMENT_ERRORS.SAME_TEACHER),
  )
})

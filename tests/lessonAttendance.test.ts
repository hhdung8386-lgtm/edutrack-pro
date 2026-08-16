import assert from 'node:assert/strict'
import test from 'node:test'
import { getCompletedLearningSessionUnits, isCompletedLearningLesson } from '../src/lib/lessonAttendance.ts'

test('counts approved present attendance in 25-minute session units', () => {
  assert.equal(isCompletedLearningLesson({ status: 'approved', attendanceStatus: 'present', minutes: 25 }), true)
  assert.equal(isCompletedLearningLesson({ status: 'approved', attendanceStatus: 'present', minutes: 50 }), true)
  assert.equal(getCompletedLearningSessionUnits({ status: 'approved', attendanceStatus: 'present', minutes: 25 }), 1)
  assert.equal(getCompletedLearningSessionUnits({ status: 'approved', attendanceStatus: 'present', minutes: 50 }), 2)
})

test('does not count zero-minute or absent attendances as learned sessions', () => {
  assert.equal(isCompletedLearningLesson({ status: 'approved', attendanceStatus: 'present', minutes: 0 }), false)
  assert.equal(isCompletedLearningLesson({ status: 'approved', attendanceStatus: 'with_permission', minutes: 0 }), false)
  assert.equal(isCompletedLearningLesson({ status: 'approved', attendanceStatus: 'without_permission', minutes: 25 }), false)
  assert.equal(getCompletedLearningSessionUnits({ status: 'approved', attendanceStatus: 'without_permission', minutes: 25 }), 0)
})

test('does not count pending, rejected, or cancelled attendances', () => {
  assert.equal(isCompletedLearningLesson({ status: 'pending', attendanceStatus: 'present', minutes: 25 }), false)
  assert.equal(isCompletedLearningLesson({ status: 'rejected', attendanceStatus: 'present', minutes: 25 }), false)
  assert.equal(isCompletedLearningLesson({ status: 'cancelled', attendanceStatus: 'present', minutes: 25 }), false)
})

test('keeps legacy public lessons compatible without treating legacy absences as learned', () => {
  assert.equal(isCompletedLearningLesson({ status: 'approved', minutes: 25, book: 'Lesson 1A' }), true)
  assert.equal(isCompletedLearningLesson({ status: 'approved', minutes: 25, book: 'Học viên vắng' }), false)
  assert.equal(isCompletedLearningLesson({ status: 'approved', minutes: 25, comment: 'Học viên vắng không phép — gia sư đã chờ.' }), false)
  assert.equal(isCompletedLearningLesson({ status: 'approved', minutes: 25, absenceFollowUpOf: 'lesson-parent' }), false)
})

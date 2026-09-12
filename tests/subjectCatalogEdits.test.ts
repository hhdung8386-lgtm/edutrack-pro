import assert from 'node:assert/strict'
import test from 'node:test'
import { formatSubjectPriceInput, parseSubjectPriceInput } from '../src/lib/subjectPriceInput.ts'
import { normalizeSubjectTeacherNote, SUBJECT_TEACHER_NOTE_MAX_LENGTH } from '../src/lib/subjectTeacherNote.ts'
import { courseDeletionBlock, studentFieldsAfterCourseRemoval } from '../src/lib/courseDeletion.ts'

test('VND price keeps up to two decimals so existing 833.33 subjects can be saved', () => {
  assert.equal(parseSubjectPriceInput('833.33', 'VND'), 833.33)
  assert.equal(parseSubjectPriceInput(formatSubjectPriceInput(833.33), 'VND'), 833.33)
  assert.equal(parseSubjectPriceInput('20 833.33', 'VND'), 20833.33)
  assert.equal(parseSubjectPriceInput('2 500', 'VND'), 2500)
})

test('legacy VND thousand separators still mean thousands, not decimals', () => {
  assert.equal(parseSubjectPriceInput('2.500', 'VND'), 2500)
  assert.equal(parseSubjectPriceInput('2,500', 'VND'), 2500)
  assert.equal(parseSubjectPriceInput('1.250.000', 'VND'), 1250000)
})

test('ambiguous or malformed prices are rejected instead of guessed', () => {
  assert.ok(Number.isNaN(parseSubjectPriceInput('833,33', 'VND')))
  assert.ok(Number.isNaN(parseSubjectPriceInput('abc', 'VND')))
  assert.ok(Number.isNaN(parseSubjectPriceInput('1,5', 'PHP')))
  assert.equal(parseSubjectPriceInput('', 'VND'), 0)
})

test('foreign currencies keep dot decimals', () => {
  assert.equal(parseSubjectPriceInput('2.416', 'PHP'), 2.416)
  assert.equal(parseSubjectPriceInput('1,250.5', 'USD'), 1250.5)
  assert.equal(formatSubjectPriceInput(2500), '2 500')
})

test('subject note is optional, trimmed and capped', () => {
  assert.equal(normalizeSubjectTeacherNote(undefined), '')
  assert.equal(normalizeSubjectTeacherNote(42), '')
  assert.equal(normalizeSubjectTeacherNote('  Giáo trình Cambridge\r\nLevel A1  '), 'Giáo trình Cambridge\nLevel A1')
  assert.equal(normalizeSubjectTeacherNote('x'.repeat(2000)).length, SUBJECT_TEACHER_NOTE_MAX_LENGTH)
})

test('rejected or cancelled lessons do not lock course deletion', () => {
  const lessons = [
    { subjectId: 'ph-old', status: 'rejected' },
    { subjectId: 'ph-old', status: 'cancelled' },
    { subjectId: 'tutor-a', status: 'approved' },
  ]
  assert.equal(courseDeletionBlock('ph-old', lessons, []), null)
})

test('approved, pending, status-less lessons and held bookings keep the course', () => {
  assert.equal(courseDeletionBlock('a', [{ subjectId: 'a', status: 'approved' }], []), 'counted-lessons')
  assert.equal(courseDeletionBlock('a', [{ subjectId: 'a', status: 'pending' }], []), 'counted-lessons')
  assert.equal(courseDeletionBlock('a', [{ subjectId: 'a' }], []), 'counted-lessons')
  assert.equal(courseDeletionBlock('a', [], [{ subjectId: 'a' }]), 'held-bookings')
  assert.equal(courseDeletionBlock('a', [], [{ subjectId: 'b' }]), null)
})

test('student totals are rebuilt from the remaining courses only', () => {
  const subjects = [
    { subjectId: 'tutor-a', subjectName: 'TUTOR A', minutesPerSession: 25, totalSessions: 148, usedSessions: 119, remainingSessions: 29, totalMinutes: 3700, usedMinutes: 2975, remainingMinutes: 725 },
    { subjectId: 'ph-old', subjectName: 'Giáo Viên Philippines', minutesPerSession: 25, totalSessions: 14, usedSessions: 0, remainingSessions: 14, totalMinutes: 350, usedMinutes: 0, remainingMinutes: 350 },
    { subjectId: 'ph-l3', subjectName: 'PH-SINGLE-1S-L3', minutesPerSession: 25, totalSessions: 38, usedSessions: 14, remainingSessions: 24, totalMinutes: 950, usedMinutes: 350, remainingMinutes: 600 },
  ]
  const next = studentFieldsAfterCourseRemoval(subjects, 'ph-old', 'active')
  assert.deepEqual(next.subjects.map((subject) => subject.subjectId), ['tutor-a', 'ph-l3'])
  assert.equal(next.totalMinutes, 4650)
  assert.equal(next.usedMinutes, 3325)
  assert.equal(next.remainingMinutes, 1325)
  assert.equal(next.totalMinutes - next.usedMinutes, next.remainingMinutes)
  assert.equal(next.subjectId, 'tutor-a')
  assert.equal(next.status, 'active')
})

test('course removal never reactivates a reserved or inactive student', () => {
  const subjects = [{ subjectId: 'a', remainingMinutes: 100 }, { subjectId: 'b', remainingMinutes: 50 }]
  assert.equal(studentFieldsAfterCourseRemoval(subjects, 'b', 'reserved').status, 'reserved')
  assert.equal(studentFieldsAfterCourseRemoval(subjects, 'b', 'inactive').status, 'inactive')
  const onlyCourse = studentFieldsAfterCourseRemoval([{ subjectId: 'a', remainingMinutes: 100 }], 'a', 'active')
  assert.equal(onlyCourse.status, 'expired')
  assert.equal(onlyCourse.subjectId, '')
})

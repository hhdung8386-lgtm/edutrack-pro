import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getStudentMinuteSummaryCore,
  getStudentSubjectMinuteFunds,
  resolveStudentSubjectFund,
} from '../src/lib/studentQuotaCore.ts'

test('an exhausted old course never consumes the balance of another course', () => {
  const student = {
    subjects: [
      { subjectId: 'old', totalMinutes: 1125, usedMinutes: 1775 },
      { subjectId: 'new', totalMinutes: 925, usedMinutes: 50 },
    ],
  }
  assert.deepEqual(getStudentMinuteSummaryCore(student), {
    totalMinutes: 2050,
    usedMinutes: 1825,
    remainingMinutes: 875,
  })
})

test('keeps each subject balance independent and resolves only exact packages', () => {
  const student = {
    subjects: [
      { subjectId: 'english-a', totalSessions: 4, usedSessions: 4, minutesPerSession: 25 },
      { subjectId: 'english-b', totalSessions: 8, usedSessions: 2, minutesPerSession: 25 },
    ],
  }
  assert.deepEqual(
    getStudentSubjectMinuteFunds(student).map(({ subjectId, remainingMinutes }) => ({ subjectId, remainingMinutes })),
    [
      { subjectId: 'english-a', remainingMinutes: 0 },
      { subjectId: 'english-b', remainingMinutes: 150 },
    ],
  )
  assert.equal(resolveStudentSubjectFund(student, 'english-a')?.remainingMinutes, 0)
  assert.equal(resolveStudentSubjectFund(student, 'missing'), undefined)
})

test('supports one legacy package when old bookings have no subject id', () => {
  const student = { subjectId: 'legacy', totalSessions: 10, usedSessions: 3, minutesPerSession: 25 }
  assert.equal(resolveStudentSubjectFund(student)?.remainingMinutes, 175)
  assert.equal(resolveStudentSubjectFund(student, 'old-course'), undefined)
  assert.equal(getStudentMinuteSummaryCore(student).remainingMinutes, 175)
})

const assert = require('node:assert/strict')
const test = require('node:test')
const { absenceMinutes, laterSameDayAbsenceBookings } = require('../lib/adminAbsencePolicy.js')

const current = {
  id: 'first', status: 'confirmed', studentId: 's1', studentCode: 'HS1',
  subjectId: 'english', requestedDate: '2026-09-28', requestedStart: '09:00',
}

test('same-day absence takes later unmarked slots of the same class in time order', () => {
  const slot = (id, requestedStart, changes = {}) => ({ ...current, id, requestedStart, ...changes })
  const selected = laterSameDayAbsenceBookings(current, [
    slot('other-subject', '10:00', { subjectId: 'math' }),
    slot('later', '10:00'),
    slot('already-marked', '10:30', { lessonId: 'lesson' }),
    slot('earlier', '08:30'),
    slot('group', '11:00', { groupClassId: 'group' }),
    slot('other-student', '11:30', { studentId: 's2' }),
    slot('next-day', '09:00', { requestedDate: '2026-09-29' }),
    slot('middle', '09:30'),
  ])
  assert.deepEqual(selected.map((item) => item.id), ['middle', 'later'])
})

test('only the first unexcused slot can charge 25 minutes; excused slots charge none', () => {
  assert.deepEqual([0, 1, 2].map((index) => absenceMinutes('without_permission', index)), [25, 0, 0])
  assert.deepEqual([0, 1, 2].map((index) => absenceMinutes('with_permission', index)), [0, 0, 0])
})

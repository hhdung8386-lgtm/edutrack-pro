import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classHuntSlotTimes,
  describeClassHuntTeacherRequirements,
  planClassHuntSlotSessions,
} from '../src/lib/classHuntSchedule.ts'

// 09:00 on Tuesday, 01 September 2026 in Vietnam (UTC+7).
const NOW_MS = Date.UTC(2026, 8, 1, 2, 0, 0)

test('weekly slot preview mirrors the server plan: one 25-minute lesson per cell in date order', () => {
  const sessions = planClassHuntSlotSessions({
    startDate: '2026-09-01',
    weeklySlots: [
      { day: 'fri', start: '20:30' },
      { day: 'mon', start: '19:30' },
      { day: 'wed', start: '15:00' },
      { day: 'mon', start: '19:00' },
    ],
    limit: 6,
    nowMs: NOW_MS,
  })
  assert.deepEqual(sessions.map((session) => `${session.date} ${session.start}-${session.end}`), [
    '2026-09-02 15:00-15:25',
    '2026-09-04 20:30-20:55',
    '2026-09-07 19:00-19:25',
    '2026-09-07 19:30-19:55',
    '2026-09-09 15:00-15:25',
    '2026-09-11 20:30-20:55',
  ])
  assert.ok(sessions.every((session) => session.minutes === 25))
})

test('weekly slot preview skips a passed slot today and stops at the one-year horizon', () => {
  const today = planClassHuntSlotSessions({
    startDate: '2026-09-01',
    weeklySlots: [{ day: 'tue', start: '08:30' }, { day: 'tue', start: '10:00' }],
    limit: 2,
    nowMs: NOW_MS,
  })
  assert.deepEqual(today.map((session) => `${session.date} ${session.start}`), ['2026-09-01 10:00', '2026-09-08 08:30'])

  const capped = planClassHuntSlotSessions({ startDate: '2026-09-01', weeklySlots: [{ day: 'mon', start: '19:00' }], limit: 120, nowMs: NOW_MS })
  assert.ok(capped.length < 120)
  assert.equal(planClassHuntSlotSessions({ startDate: '2026-08-31', weeklySlots: [{ day: 'mon', start: '19:00' }], limit: 3, nowMs: NOW_MS }).length, 0)
})

test('slot grid rows are half-hourly and every slot ends before midnight', () => {
  const times = classHuntSlotTimes()
  assert.equal(times[0], '06:00')
  assert.equal(times.at(-1), '23:30')
  assert.ok(times.includes('15:00'))
})

test('teacher requirement summary is empty when nothing is required', () => {
  assert.equal(describeClassHuntTeacherRequirements({ teacherTypes: ['vn', 'ph', 'native'], gender: 'any' }), '')
  assert.equal(describeClassHuntTeacherRequirements({ teacherTypes: ['native'], gender: 'female' }), 'Giáo viên bản ngữ · Giáo viên nữ')
})

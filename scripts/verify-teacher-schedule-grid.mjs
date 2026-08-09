import assert from 'node:assert/strict'

import {
  buildTeacherScheduleBookingIndex,
  teacherScheduleCellKey,
} from '../src/lib/teacherScheduleGrid.ts'

const historical = Array.from({ length: 5_000 }, (_, index) => ({
  id: `old-${index}`,
  status: 'confirmed',
  displayDate: '2025-01-01',
  displayStart: '08:00',
  displayEnd: '08:25',
  requestedMinutes: 25,
}))
const firstCurrent = {
  id: 'current-first',
  status: 'confirmed',
  displayDate: '2026-08-09',
  displayStart: '20:00',
  displayEnd: '20:50',
  requestedMinutes: 50,
}
const duplicateLegacy = {
  ...firstCurrent,
  id: 'current-duplicate',
}
const inactive = {
  id: 'cancelled',
  status: 'cancelled',
  displayDate: '2026-08-09',
  displayStart: '21:00',
  displayEnd: '21:25',
  requestedMinutes: 25,
}

const index = buildTeacherScheduleBookingIndex(
  [...historical, firstCurrent, duplicateLegacy, inactive],
  ['2026-08-09'],
  ['19:30', '20:00', '20:30', '21:00'],
)

assert.equal(index.size, 2, 'only visible active overlapping cells are indexed')
assert.equal(index.get(teacherScheduleCellKey('2026-08-09', '20:00'))?.id, 'current-first')
assert.equal(index.get(teacherScheduleCellKey('2026-08-09', '20:30'))?.id, 'current-first')
assert.equal(index.has(teacherScheduleCellKey('2026-08-09', '21:00')), false)

console.log('teacher schedule grid regression checks passed')

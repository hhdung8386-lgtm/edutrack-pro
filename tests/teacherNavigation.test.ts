import assert from 'node:assert/strict'
import test from 'node:test'
import {
  selectTeacherMobilePrimaryItems,
  TEACHER_MOBILE_PRIMARY_PATHS,
} from '../src/components/layout/teacherNavigation.ts'

test('teacher mobile primary navigation exposes evaluations without overcrowding the bar', () => {
  assert.equal(TEACHER_MOBILE_PRIMARY_PATHS.length, 5)
  assert.ok(TEACHER_MOBILE_PRIMARY_PATHS.includes('/teacher/evaluations'))
})

test('teacher mobile primary navigation preserves the intended order and ignores missing routes', () => {
  const items = [
    { to: '/teacher/evaluations', label: 'Đánh giá' },
    { to: '/teacher/schedules', label: 'Lịch' },
    { to: '/teacher/profile', label: 'Hồ sơ' },
    { to: '/teacher/attendance', label: 'Điểm danh' },
  ]

  assert.deepEqual(
    selectTeacherMobilePrimaryItems(items).map((item) => item.to),
    ['/teacher/schedules', '/teacher/evaluations', '/teacher/attendance'],
  )
})

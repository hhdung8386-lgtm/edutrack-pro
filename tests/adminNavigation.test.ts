import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getVisibleAdminNavigation,
  isAdminNavGroupActive,
} from '../src/components/layout/adminNavigation.ts'

function visiblePaths(role: string) {
  return getVisibleAdminNavigation(role).flatMap((group) => group.items.map((item) => item.to))
}

test('admin navigation preserves both legacy one-to-one student pages and group classes', () => {
  const groups = getVisibleAdminNavigation('admin')
  const studentGroup = groups.find((group) => group.id === 'students')
  const paths = visiblePaths('admin')

  assert.equal(studentGroup?.label, 'Học viên')
  assert.ok(paths.includes('/admin/students/fixed'))
  assert.ok(paths.includes('/admin/students/flexible'))
  assert.ok(paths.includes('/admin/students/group'))
})

test('student manager can access all student class types', () => {
  const paths = visiblePaths('student_manager')

  assert.ok(paths.includes('/admin/students/fixed'))
  assert.ok(paths.includes('/admin/students/flexible'))
  assert.ok(paths.includes('/admin/students/group'))
})

test('teacher manager cannot access individual or group student management', () => {
  const paths = visiblePaths('teacher_manager')

  assert.equal(paths.some((path) => path.startsWith('/admin/students')), false)
})

test('fixed, flexible and group routes remain inside the original student menu', () => {
  const groups = getVisibleAdminNavigation('admin')
  const studentGroup = groups.find((group) => group.id === 'students')

  assert.ok(studentGroup)
  assert.equal(isAdminNavGroupActive(studentGroup, '/admin/students/fixed'), true)
  assert.equal(isAdminNavGroupActive(studentGroup, '/admin/students/flexible'), true)
  assert.equal(isAdminNavGroupActive(studentGroup, '/admin/students/group'), true)
})

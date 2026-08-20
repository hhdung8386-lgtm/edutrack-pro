import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getVisibleAdminNavigation,
  isAdminNavGroupActive,
} from '../src/components/layout/adminNavigation.ts'

function visiblePaths(role: string, accessScope?: string) {
  return getVisibleAdminNavigation(role, accessScope).flatMap((group) => group.items.map((item) => item.to))
}

test('group classes is a direct top-level item beside the student group', () => {
  const groups = getVisibleAdminNavigation('admin')
  const studentGroup = groups.find((group) => group.id === 'students')
  const groupClasses = groups.find((group) => group.id === 'group-classes')
  const paths = visiblePaths('admin')

  assert.equal(studentGroup?.label, 'Học viên')
  assert.deepEqual(studentGroup?.items.map((item) => item.to), [
    '/admin/students/fixed',
    '/admin/students/flexible',
  ])
  assert.equal(groupClasses?.label, 'Lớp nhóm')
  assert.equal(groupClasses?.directTo, '/admin/students/group')
  assert.equal(groups.indexOf(groupClasses!), groups.indexOf(studentGroup!) + 1)
  assert.ok(paths.includes('/admin/students/fixed'))
  assert.ok(paths.includes('/admin/students/flexible'))
  assert.ok(paths.includes('/admin/students/group'))
  assert.equal(paths.filter((path) => path === '/admin/students/group').length, 1)
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

test('student and group-class routes activate only their own top-level item', () => {
  const groups = getVisibleAdminNavigation('admin')
  const studentGroup = groups.find((group) => group.id === 'students')
  const groupClasses = groups.find((group) => group.id === 'group-classes')

  assert.ok(studentGroup)
  assert.ok(groupClasses)
  assert.equal(isAdminNavGroupActive(studentGroup, '/admin/students'), true)
  assert.equal(isAdminNavGroupActive(studentGroup, '/admin/students/fixed'), true)
  assert.equal(isAdminNavGroupActive(studentGroup, '/admin/students/flexible'), true)
  assert.equal(isAdminNavGroupActive(studentGroup, '/admin/students/group'), false)
  assert.equal(isAdminNavGroupActive(groupClasses, '/admin/students/group'), true)
  assert.equal(isAdminNavGroupActive(groupClasses, '/admin/students/fixed'), false)
})

test('evaluation and alert routes move from students to accounting exactly once', () => {
  const groups = getVisibleAdminNavigation('admin')
  const studentGroup = groups.find((group) => group.id === 'students')
  const accountingGroup = groups.find((group) => group.id === 'accounting')
  const movedPaths = ['/admin/evaluations', '/admin/student-alerts']
  const allPaths = groups.flatMap((group) => group.items.map((item) => item.to))

  assert.ok(studentGroup)
  assert.ok(accountingGroup)
  for (const path of movedPaths) {
    assert.equal(studentGroup.items.some((item) => item.to === path), false)
    assert.equal(accountingGroup.items.some((item) => item.to === path), true)
    assert.equal(allPaths.filter((itemPath) => itemPath === path).length, 1)
  }
})

test('evaluation and alert routes activate accounting without activating students', () => {
  const groups = getVisibleAdminNavigation('admin')
  const studentGroup = groups.find((group) => group.id === 'students')
  const accountingGroup = groups.find((group) => group.id === 'accounting')

  assert.ok(studentGroup)
  assert.ok(accountingGroup)
  assert.equal(isAdminNavGroupActive(accountingGroup, '/admin/evaluations'), true)
  assert.equal(isAdminNavGroupActive(accountingGroup, '/admin/student-alerts'), true)
  assert.equal(isAdminNavGroupActive(studentGroup, '/admin/evaluations'), false)
  assert.equal(isAdminNavGroupActive(studentGroup, '/admin/student-alerts'), false)
})

test('moving accounting items preserves existing role visibility', () => {
  const adminPaths = visiblePaths('admin')
  const studentManagerPaths = visiblePaths('student_manager')
  const teacherManagerPaths = visiblePaths('teacher_manager')
  const bookingAssistantPaths = visiblePaths('student_manager', 'booking_only')

  for (const paths of [adminPaths, studentManagerPaths]) {
    assert.ok(paths.includes('/admin/evaluations'))
    assert.ok(paths.includes('/admin/student-alerts'))
  }
  assert.ok(teacherManagerPaths.includes('/admin/evaluations'))
  assert.equal(teacherManagerPaths.includes('/admin/student-alerts'), false)
  assert.equal(bookingAssistantPaths.includes('/admin/evaluations'), false)
  assert.equal(bookingAssistantPaths.includes('/admin/student-alerts'), false)
})

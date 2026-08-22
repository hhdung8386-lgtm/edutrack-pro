import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getVisibleAdminNavigation,
  isAdminNavGroupActive,
} from '../src/components/layout/adminNavigation.ts'

function visiblePaths(role: string, accessScope?: string) {
  return getVisibleAdminNavigation(role, accessScope).flatMap((group) => group.items.map((item) => item.to))
}

test('online classes contain individual students and group classes, with offline classes beside them', () => {
  const groups = getVisibleAdminNavigation('admin')
  const studentGroup = groups.find((group) => group.id === 'students')
  const offlineClasses = groups.find((group) => group.id === 'offline-classes')
  const paths = visiblePaths('admin')

  assert.equal(studentGroup?.label, 'Lớp online')
  assert.deepEqual(studentGroup?.items.map((item) => item.to), [
    '/admin/students/fixed',
    '/admin/students/flexible',
    '/admin/students/group',
  ])
  assert.equal(offlineClasses?.label, 'Lớp offline')
  assert.equal(offlineClasses?.directTo, undefined)
  assert.deepEqual(offlineClasses?.items.map((item) => item.to), [
    '/admin/offline-classes',
    '/admin/offline-classes/groups',
  ])
  assert.equal(groups.indexOf(offlineClasses!), groups.indexOf(studentGroup!) + 1)
  assert.ok(paths.includes('/admin/students/fixed'))
  assert.ok(paths.includes('/admin/students/flexible'))
  assert.ok(paths.includes('/admin/students/group'))
  assert.ok(paths.includes('/admin/offline-classes'))
  assert.ok(paths.includes('/admin/offline-classes/groups'))
  assert.equal(paths.filter((path) => path === '/admin/students/group').length, 1)
})

test('student manager can access all student class types', () => {
  const paths = visiblePaths('student_manager')

  assert.ok(paths.includes('/admin/students/fixed'))
  assert.ok(paths.includes('/admin/students/flexible'))
  assert.ok(paths.includes('/admin/students/group'))
  assert.ok(paths.includes('/admin/offline-classes'))
  assert.ok(paths.includes('/admin/offline-classes/groups'))
})

test('teacher manager cannot access online or offline student class management', () => {
  const paths = visiblePaths('teacher_manager')

  assert.equal(paths.some((path) => path.startsWith('/admin/students')), false)
  assert.equal(paths.includes('/admin/offline-classes'), false)
  assert.equal(paths.includes('/admin/offline-classes/groups'), false)
})

test('online and offline class routes activate only their own top-level item', () => {
  const groups = getVisibleAdminNavigation('admin')
  const studentGroup = groups.find((group) => group.id === 'students')
  const offlineClasses = groups.find((group) => group.id === 'offline-classes')

  assert.ok(studentGroup)
  assert.ok(offlineClasses)
  assert.equal(isAdminNavGroupActive(studentGroup, '/admin/students'), true)
  assert.equal(isAdminNavGroupActive(studentGroup, '/admin/students/fixed'), true)
  assert.equal(isAdminNavGroupActive(studentGroup, '/admin/students/flexible'), true)
  assert.equal(isAdminNavGroupActive(studentGroup, '/admin/students/group'), true)
  assert.equal(isAdminNavGroupActive(studentGroup, '/admin/offline-classes'), false)
  assert.equal(isAdminNavGroupActive(offlineClasses, '/admin/offline-classes'), true)
  assert.equal(isAdminNavGroupActive(offlineClasses, '/admin/offline-classes/groups'), true)
  assert.equal(isAdminNavGroupActive(offlineClasses, '/admin/students/group'), false)
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

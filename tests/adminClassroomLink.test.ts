import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeClassroomUrl, resolveAdminClassroomLink } from '../src/lib/adminClassroomLink.ts'
import { ONLINE_CLASSROOM_PILOT_ACTIVE, classroomPilotEnabledFor } from '../src/lib/classroomPilotSwitch.ts'

const booking = { id: 'b1', status: 'confirmed' }
const base = { booking, studentsLoaded: true, pilotWindowOpen: true, pilotRoute: '/lop-hoc/b1' }

test('classroom urls are normalized to safe http(s) links', () => {
  assert.equal(normalizeClassroomUrl('https://zoom.us/j/123?pwd=x'), 'https://zoom.us/j/123?pwd=x')
  assert.equal(normalizeClassroomUrl('  meet.google.com/abc-defg-hij '), 'https://meet.google.com/abc-defg-hij')
  assert.equal(normalizeClassroomUrl('javascript:alert(1)'), '')
  assert.equal(normalizeClassroomUrl('ghi chú lớp'), '')
  assert.equal(normalizeClassroomUrl('Link học cố định: https://meet.google.com/yjs-gocz-ysz'), 'https://meet.google.com/yjs-gocz-ysz')
  assert.equal(normalizeClassroomUrl(': https://meet.google.com/gpf-evwq-tfw'), 'https://meet.google.com/gpf-evwq-tfw')
  assert.equal(normalizeClassroomUrl(''), '')
  assert.equal(normalizeClassroomUrl(undefined), '')
})

test('pilot is switched off: pilot students use their own classroom link', () => {
  assert.equal(ONLINE_CLASSROOM_PILOT_ACTIVE, false)
  const student = { onlineClassroomPilotEnabled: true, classroomURL: 'https://zoom.us/j/1' }
  assert.equal(classroomPilotEnabledFor(true), false)
  assert.deepEqual(resolveAdminClassroomLink({ ...base, student }), { kind: 'external', href: 'https://zoom.us/j/1' })
  assert.deepEqual(resolveAdminClassroomLink({ ...base, student, pilotWindowOpen: false }), { kind: 'external', href: 'https://zoom.us/j/1' })
  assert.deepEqual(resolveAdminClassroomLink({ ...base, student: { onlineClassroomPilotEnabled: true } }), { kind: 'none' })
})

test('pending, group or attended bookings of pilot students use the legacy link', () => {
  const student = { onlineClassroomPilotEnabled: true, classroomURL: 'https://zoom.us/j/1' }
  for (const b of [
    { ...booking, status: 'pending' },
    { ...booking, groupClassId: 'g1' },
    { ...booking, lessonId: 'l1' },
  ]) {
    assert.deepEqual(resolveAdminClassroomLink({ ...base, booking: b, student }), { kind: 'external', href: 'https://zoom.us/j/1' })
  }
})

test('student link wins over booking link; nothing when neither exists', () => {
  assert.deepEqual(
    resolveAdminClassroomLink({ ...base, booking: { ...booking, classroomURL: 'https://b.example.com' }, student: { classroomURL: 'https://s.example.com' } }),
    { kind: 'external', href: 'https://s.example.com/' },
  )
  assert.deepEqual(
    resolveAdminClassroomLink({ ...base, booking: { ...booking, classroomURL: 'https://b.example.com/x' }, student: undefined }),
    { kind: 'external', href: 'https://b.example.com/x' },
  )
  assert.deepEqual(resolveAdminClassroomLink({ ...base, student: {} }), { kind: 'none' })
})

test('fails closed while student profiles are still loading', () => {
  assert.deepEqual(
    resolveAdminClassroomLink({ ...base, studentsLoaded: false, student: undefined, booking: { ...booking, classroomURL: 'https://b.example.com' } }),
    { kind: 'loading' },
  )
})

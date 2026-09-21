const test = require('node:test')
const assert = require('node:assert/strict')
const {
  buildTeacherScheduleEmail,
  groupTeacherScheduleDays,
  isActiveTeachingBooking,
  isTeacherReminderEmail,
  splitTeachingBlocks,
} = require('../lib/teacherScheduleEmail.js')

const base = { status: 'confirmed', teacherId: 't1', studentCode: 'HS001', subjectName: 'IELTS', requestedDate: '2026-09-22' }

test('chỉ nhận email thật, bỏ email đăng nhập nội bộ', () => {
  assert.equal(isTeacherReminderEmail('gv@gmail.com'), true)
  assert.equal(isTeacherReminderEmail('TINA@edutrackpro.app'), false)
  assert.equal(isTeacherReminderEmail('abc'), false)
  assert.equal(isTeacherReminderEmail(undefined), false)
})

test('bỏ ca đã điểm danh, đã huỷ hoặc thiếu giờ', () => {
  assert.equal(isActiveTeachingBooking({ id: 'a', ...base, requestedStart: '19:00' }), true)
  assert.equal(isActiveTeachingBooking({ id: 'b', ...base, requestedStart: '19:00', lessonId: 'L1' }), false)
  assert.equal(isActiveTeachingBooking({ id: 'c', ...base, requestedStart: '19:00', status: 'released' }), false)
  assert.equal(isActiveTeachingBooking({ id: 'd', ...base, requestedStart: '' }), false)
})

test('gom theo gia sư/ngày và tách cụm dạy liền nhau', () => {
  const bookings = [
    { id: '3', ...base, requestedStart: '21:00', requestedEnd: '21:25' },
    { id: '1', ...base, requestedStart: '19:00', requestedEnd: '19:25' },
    { id: '2', ...base, requestedStart: '19:30', requestedEnd: '19:55' },
    { id: '4', ...base, teacherId: 't2', requestedStart: '08:00', requestedEnd: '08:25' },
  ]
  const days = groupTeacherScheduleDays(bookings)
  assert.equal(days.length, 2)
  const t1 = days.find((day) => day.teacherId === 't1')
  assert.deepEqual(t1.bookings.map((b) => b.id), ['1', '2', '3'])
  const blocks = splitTeachingBlocks(t1.bookings)
  assert.deepEqual(blocks.map((b) => [b.start, b.bookings.length]), [['19:00', 2], ['21:00', 1]])
})

test('email hiển thị ca, giờ địa phương và escape HTML', () => {
  const email = buildTeacherScheduleEmail(
    { code: 'Tina<script>', timezoneOffset: 8 },
    [{ date: '2026-09-22', bookings: [{ id: '1', ...base, requestedStart: '19:00', requestedEnd: '19:25' }] }],
    'digest',
  )
  assert.match(email.subject, /22\/09\/2026/)
  assert.match(email.text, /19:00–19:25/)
  assert.match(email.text, /your time: 20:00/)
  assert.ok(!email.html.includes('<script>'))
  assert.throws(() => buildTeacherScheduleEmail({}, [], 'manual'))
})

const assert = require('node:assert/strict')
const test = require('node:test')
const { groupReminderDays, groupReminderSessions } = require('../lib/reminderSessions.js')

const base = {
  studentId: 'student-1',
  teacherId: 'teacher-1',
  subjectId: 'subject-1',
  requestedDate: '2026-08-12',
  requestedMinutes: 25,
}

test('gộp bốn ô 25 phút liền nhau thành một cụm bắt đầu từ ô sớm nhất', () => {
  const sessions = groupReminderSessions([
    { ...base, id: 'd', requestedStart: '21:30', requestedEnd: '21:55' },
    { ...base, id: 'b', requestedStart: '20:30', requestedEnd: '20:55' },
    { ...base, id: 'a', requestedStart: '20:00', requestedEnd: '20:25' },
    { ...base, id: 'c', requestedStart: '21:00', requestedEnd: '21:25' },
  ])

  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].sessionStart, '20:00')
  assert.equal(sessions[0].sessionEnd, '21:55')
  assert.deepEqual(sessions[0].bookings.map((booking) => booking.id), ['a', 'b', 'c', 'd'])
})

test('không gộp hai cụm có khoảng trống', () => {
  const sessions = groupReminderSessions([
    { ...base, id: 'a', requestedStart: '15:00', requestedEnd: '15:25' },
    { ...base, id: 'b', requestedStart: '16:00', requestedEnd: '16:25' },
  ])

  assert.deepEqual(sessions.map((session) => session.sessionStart), ['15:00', '16:00'])
})

test('không gộp lịch khác học viên, gia sư hoặc môn', () => {
  const sessions = groupReminderSessions([
    { ...base, id: 'a', requestedStart: '15:00', requestedEnd: '15:25' },
    { ...base, id: 'b', studentId: 'student-2', requestedStart: '15:30', requestedEnd: '15:55' },
    { ...base, id: 'c', teacherId: 'teacher-2', requestedStart: '15:30', requestedEnd: '15:55' },
    { ...base, id: 'd', subjectId: 'subject-2', requestedStart: '15:30', requestedEnd: '15:55' },
  ])

  assert.equal(sessions.length, 4)
})

test('gộp bản ghi trùng đúng một ô thay vì tạo thêm email', () => {
  const sessions = groupReminderSessions([
    { ...base, id: 'a', requestedStart: '15:00', requestedEnd: '15:25' },
    { ...base, id: 'duplicate', requestedStart: '15:00', requestedEnd: '15:25' },
  ])

  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].bookings.length, 2)
  assert.equal(sessions[0].sessionStart, '15:00')
})

test('hỗ trợ bước lưới của ca 50 phút', () => {
  const sessions = groupReminderSessions([
    { ...base, id: 'a', requestedMinutes: 50, requestedStart: '15:00', requestedEnd: '15:50' },
    { ...base, id: 'b', requestedMinutes: 50, requestedStart: '16:00', requestedEnd: '16:50' },
  ])

  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].sessionEnd, '16:50')
})

test('gộp mọi ca cùng học viên và cùng ngày dù khác giờ, gia sư hoặc môn', () => {
  const days = groupReminderDays([
    { ...base, id: 'a', requestedStart: '14:00', requestedEnd: '14:25' },
    { ...base, id: 'b', teacherId: 'teacher-2', subjectId: 'subject-2', requestedStart: '19:30', requestedEnd: '19:55' },
  ])

  assert.equal(days.length, 1)
  assert.equal(days[0].dayStart, '14:00')
  assert.equal(days[0].dayEnd, '19:55')
  assert.deepEqual(days[0].bookings.map((booking) => booking.id), ['a', 'b'])
})

test('không gộp lịch khác học viên hoặc khác ngày vào email chung', () => {
  const days = groupReminderDays([
    { ...base, id: 'a', requestedStart: '14:00', requestedEnd: '14:25' },
    { ...base, id: 'b', studentId: 'student-2', requestedStart: '14:30', requestedEnd: '14:55' },
    { ...base, id: 'c', requestedDate: '2026-08-13', requestedStart: '14:30', requestedEnd: '14:55' },
  ])

  assert.equal(days.length, 3)
})

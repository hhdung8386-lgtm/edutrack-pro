const test = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')

const {
  onlineClassroomPilotReminderDeliveryId,
} = require('../lib/onlineClassroom.js')

const booking = {
  id: 'booking-a',
  studentId: 'student-a',
  teacherId: 'teacher-a',
  requestedDate: '2026-08-28',
  requestedStart: '19:00',
}

test('delivery id cũ giữ nguyên khi worker chưa truyền generation', () => {
  const legacyBusinessKey = [
    booking.id,
    booking.studentId,
    booking.teacherId,
    booking.requestedDate,
    booking.requestedStart,
    '30m',
  ].join('|')
  const expected = `pilot_${createHash('sha256').update(legacyBusinessKey, 'utf8').digest('hex').slice(0, 32)}_30m`
  assert.equal(onlineClassroomPilotReminderDeliveryId(booking, '30m'), expected)
})

test('delivery id đổi khi generation học viên hoặc gia sư đổi', () => {
  const original = onlineClassroomPilotReminderDeliveryId(booking, '30m', 3, 7)
  assert.notEqual(original, onlineClassroomPilotReminderDeliveryId(booking, '30m', 4, 7))
  assert.notEqual(original, onlineClassroomPilotReminderDeliveryId(booking, '30m', 3, 8))
})

test('delivery id chuẩn hóa generation lỗi về 0', () => {
  assert.equal(
    onlineClassroomPilotReminderDeliveryId(booking, '2h', Number.NaN, -2),
    onlineClassroomPilotReminderDeliveryId(booking, '2h', 0, 0),
  )
})

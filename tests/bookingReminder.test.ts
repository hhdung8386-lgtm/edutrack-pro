import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBookingReminderMessage, formatReminderDate, formatReminderTimes } from '../src/lib/bookingReminder.ts'

test('date label uses the real weekday', () => {
  assert.equal(formatReminderDate('2026-09-26'), 'Thứ 7, 26/09/2026')
  assert.equal(formatReminderDate('2026-09-27'), 'Chủ nhật, 27/09/2026')
  assert.equal(formatReminderDate('2026-10-01'), 'Thứ 5, 01/10/2026')
})

test('same-day sessions are merged in time order', () => {
  assert.equal(formatReminderTimes([{ start: '08:00', end: '08:25' }]), '08:00 - 08:25')
  assert.equal(
    formatReminderTimes([{ start: '20:30', end: '20:55' }, { start: '20:00', end: '20:25' }]),
    '20:00 - 20:25 và 20:30 - 20:55',
  )
  assert.equal(
    formatReminderTimes([{ start: '09:00', end: '09:25' }, { start: '08:00', end: '08:25' }, { start: '08:30', end: '08:55' }]),
    '08:00 - 08:25, 08:30 - 08:55 và 09:00 - 09:25',
  )
  assert.equal(formatReminderTimes([{ start: '19:00', end: '19:25' }, { start: '19:00', end: '19:25' }]), '19:00 - 19:25')
})

test('message follows the center template exactly', () => {
  const text = buildBookingReminderMessage({
    studentName: 'Ánh Như ',
    studentCode: 'HS0K4ZR5',
    date: '2026-09-26',
    sessions: [{ start: '20:30', end: '20:55' }, { start: '20:00', end: '20:25' }],
    classroomLink: 'https://meet.google.com/abc-defg-hij',
  })
  assert.equal(text, [
    '[NHẮC LỊCH HỌC TỰ ĐỘNG]',
    '',
    'Kính gửi Quý học viên, Ánh Như HS0K4ZR5',
    'Lớp học tiếp theo sẽ diễn ra vào Thứ 7, 26/09/2026 lúc 20:00 - 20:25 và 20:30 - 20:55',
    '',
    'Link vào lớp: https://meet.google.com/abc-defg-hij',
    '',
    'Quý học viên vui lòng xem trước bài và hoàn thành bài tập (nếu có).',
    '',
    '----------------------',
    '\u{1D40B}\u{1D42E}\u031B\u{1D42E} \u{1D432}\u0301: Nếu cần huỷ lớp, Quý học viên vui lòng thông báo cho trung tâm ít nhất 1 tiếng trước giờ học để không bị trừ buổi và sắp xếp học bù trong vòng 7 ngày để duy trì tiến độ học tập.',
    '',
    'Chúc Quý học viên một ngày học tập hiệu quả!',
  ].join('\n'))
  assert.doesNotMatch(text, /\[(Tên|Mã HV|Ngày|Giờ|Link)\]|undefined/)
})

test('message cannot be created without a classroom link', () => {
  assert.throws(() => buildBookingReminderMessage({
    studentName: 'Ánh Như',
    date: '2026-09-26',
    sessions: [{ start: '20:00', end: '20:25' }],
    classroomLink: '   ',
  }), /REMINDER_CLASSROOM_LINK_REQUIRED/)
})

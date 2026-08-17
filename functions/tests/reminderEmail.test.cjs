const assert = require('node:assert/strict')
const test = require('node:test')
const { buildReminderEmail } = require('../lib/reminderEmail.js')

const student = {
  code: 'HSABC123',
  classroomURL: 'https://meet.google.com/student-room',
  subjects: [
    { subjectId: 'english', subjectName: 'Tiếng Anh', curriculumLink: 'https://curriculum.example/english' },
    { subjectId: 'ielts', subjectName: 'IELTS', curriculumLink: 'https://curriculum.example/ielts' },
  ],
}

test('một email liệt kê đủ từng slot trong ngày theo đúng giờ', () => {
  const email = buildReminderEmail([
    {
      id: 'a', studentId: 'student-1', studentCode: 'HSABC123', requestedDate: '2026-08-14',
      requestedStart: '14:00', requestedEnd: '14:25', teacherName: 'Gia sư A', subjectId: 'english', subjectName: 'Tiếng Anh',
      classroomURL: 'https://meet.google.com/room-a',
    },
    {
      id: 'b', studentId: 'student-1', studentCode: 'HSABC123', requestedDate: '2026-08-14',
      requestedStart: '14:30', requestedEnd: '15:00', teacherName: 'Gia sư B', subjectId: 'ielts', subjectName: 'IELTS',
      classroomURL: 'https://meet.google.com/room-b',
    },
  ], student, 'trước khoảng 12 giờ')

  assert.match(email.text, /Thời gian: 14:00–14:25; 14:30–15:00/)
  assert.match(email.text, /Gia sư: Gia sư A; Gia sư B/)
  assert.match(email.html, /14:00–14:25/)
  assert.match(email.html, /14:30–15:00/)
  assert.doesNotMatch(email.html, /Phòng học ca/)
  assert.match(email.html, /https:\/\/meet\.google\.com\/student-room/)
  assert.doesNotMatch(email.html, /https:\/\/meet\.google\.com\/room-a/)
  assert.doesNotMatch(email.html, /https:\/\/meet\.google\.com\/room-b/)
  assert.match(email.html, /https:\/\/curriculum\.example\/english/)
  assert.match(email.html, /https:\/\/curriculum\.example\/ielts/)
  assert.equal((email.html.match(/class="email-action"/g) || []).length, 3)
})

test('ưu tiên nickname tiếng Anh của gia sư trong nội dung email', () => {
  const email = buildReminderEmail([
    {
      id: 'nickname', studentId: 'student-1', studentCode: 'HSABC123', requestedDate: '2026-08-14',
      requestedStart: '14:00', requestedEnd: '14:25', teacherCode: 'Mirabelle', teacherName: 'Trần Đỗ Thúy Mai',
      subjectId: 'english', subjectName: 'Tiếng Anh',
    },
  ], student, 'trước khoảng 12 giờ')

  assert.match(email.text, /Gia sư: Mirabelle/)
  assert.match(email.html, />Mirabelle</)
  assert.doesNotMatch(email.text, /Trần Đỗ Thúy Mai/)
  assert.doesNotMatch(email.html, /Trần Đỗ Thúy Mai/)
})

test('không dùng mã GV legacy làm tên gia sư', () => {
  const email = buildReminderEmail([
    {
      id: 'legacy', studentId: 'student-1', studentCode: 'HSABC123', requestedDate: '2026-08-14',
      requestedStart: '14:00', requestedEnd: '14:25', teacherCode: 'GVABC123', teacherName: 'Nguyễn Dung Trọng Tín',
      subjectId: 'english', subjectName: 'Tiếng Anh',
    },
  ], student, 'trước khoảng 30 phút')

  assert.match(email.text, /Gia sư: Nguyễn Dung Trọng Tín/)
  assert.doesNotMatch(email.text, /Gia sư: GVABC123/)
})

test('loại bản ghi trùng cùng slot khỏi nội dung nhưng vẫn giữ slot khác', () => {
  const duplicate = {
    studentId: 'student-1', studentCode: 'HSABC123', requestedDate: '2026-08-14',
    requestedStart: '14:00', requestedEnd: '14:25', teacherName: 'Gia sư A', subjectId: 'english', subjectName: 'Tiếng Anh',
    classroomURL: 'https://meet.google.com/room-a',
  }
  const email = buildReminderEmail([{ ...duplicate, id: 'a' }, { ...duplicate, id: 'duplicate' }], student, 'trước khoảng 30 phút')
  assert.equal((email.html.match(/14:00–14:25/g) || []).length, 2)
  assert.doesNotMatch(email.html, /Ca 2/)
})

test('không tạo email rỗng', () => {
  assert.throws(() => buildReminderEmail([], student, 'trước khoảng 30 phút'), /without bookings/)
})

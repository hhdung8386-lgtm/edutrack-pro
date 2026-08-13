const assert = require('node:assert/strict')
const test = require('node:test')
const { aggregateTeacherRanking } = require('../lib/teacherRanking.js')

test('chỉ cộng buổi đã duyệt trong đúng tháng và xếp hạng theo phút', () => {
  const rows = aggregateTeacherRanking([
    { teacherId: 'a', teacherCode: 'GVA', teacherName: 'An', date: '2026-08-01', minutes: 25, status: 'approved' },
    { teacherId: 'a', teacherCode: 'GVA', teacherName: 'An', date: '2026-08-31', minutes: 50, status: 'approved' },
    { teacherId: 'b', teacherCode: 'GVB', teacherName: 'Bình', date: '2026-08-15', minutes: 50, status: 'approved' },
    { teacherId: 'b', teacherCode: 'GVB', teacherName: 'Bình', date: '2026-07-31', minutes: 500, status: 'approved' },
    { teacherId: 'c', teacherCode: 'GVC', teacherName: 'Chi', date: '2026-08-15', minutes: 100, status: 'pending' },
  ], '2026-08')

  assert.deepEqual(rows.map((row) => [row.teacherId, row.minutes, row.lessons]), [
    ['a', 75, 2],
    ['b', 50, 1],
  ])
})

test('hồ sơ gia sư chỉ bổ sung tên và ảnh, không làm thay đổi tổng phút', () => {
  const profiles = new Map([
    ['a', { code: 'LOLA', name: 'Lola Nguyễn', photoURL: 'https://example.com/lola.jpg' }],
  ])
  const [row] = aggregateTeacherRanking([
    { teacherId: 'a', teacherCode: 'OLD', teacherName: 'Tên cũ', date: '2026-08-10', minutes: 25, status: 'approved' },
  ], '2026-08', profiles)

  assert.equal(row.displayName, 'LOLA - Lola Nguyễn')
  assert.equal(row.photoURL, 'https://example.com/lola.jpg')
  assert.equal(row.minutes, 25)
})

test('giới hạn số dòng sau khi đã sắp xếp', () => {
  const lessons = Array.from({ length: 15 }, (_, index) => ({
    teacherId: `teacher-${index}`,
    teacherName: `Teacher ${index}`,
    date: '2026-08-10',
    minutes: index + 1,
    status: 'approved',
  }))
  const rows = aggregateTeacherRanking(lessons, '2026-08', new Map(), 10)

  assert.equal(rows.length, 10)
  assert.equal(rows[0].teacherId, 'teacher-14')
  assert.equal(rows[9].teacherId, 'teacher-5')
})

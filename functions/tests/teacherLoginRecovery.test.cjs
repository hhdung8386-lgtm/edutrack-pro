const assert = require('node:assert/strict')
const test = require('node:test')
const { decideTeacherLoginRecovery, teacherLoginEmail } = require('../lib/teacherLoginRecovery.js')

test('cho phép UID chưa có user document hoặc đã thuộc đúng gia sư', () => {
  assert.deepEqual(decideTeacherLoginRecovery(null, 'teacher-a', false), {
    allowed: true,
    reclaimsOrphan: false,
  })
  assert.deepEqual(decideTeacherLoginRecovery({ role: 'teacher', teacherId: 'teacher-a' }, 'teacher-a', true), {
    allowed: true,
    reclaimsOrphan: false,
  })
})

test('chỉ thu hồi liên kết khác khi hồ sơ chủ cũ không còn tồn tại', () => {
  assert.deepEqual(decideTeacherLoginRecovery({ role: 'teacher', teacherId: 'missing-teacher' }, 'teacher-a', false), {
    allowed: true,
    reclaimsOrphan: true,
  })
  assert.deepEqual(decideTeacherLoginRecovery({ role: 'teacher', teacherId: 'teacher-b' }, 'teacher-a', true), {
    allowed: false,
    reason: 'owned_by_existing_teacher',
  })
})

test('không bao giờ chuyển UID của vai trò không phải gia sư', () => {
  assert.deepEqual(decideTeacherLoginRecovery({ role: 'admin', teacherId: '' }, 'teacher-a', false), {
    allowed: false,
    reason: 'unrelated_role',
  })
})

test('chuẩn hóa email đăng nhập tương thích mã gia sư hiện tại', () => {
  assert.equal(teacherLoginEmail('Oscar'), 'Oscar@edutrackpro.app')
  assert.equal(teacherLoginEmail('gvabc123'), 'GVABC123@edutrackpro.app')
  assert.equal(teacherLoginEmail('teacher@example.com'), 'teacher@example.com')
})

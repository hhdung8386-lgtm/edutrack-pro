const assert = require('node:assert/strict')
const test = require('node:test')
const {
  accountDeletionBlockReason,
  normalizedAccountEmail,
} = require('../lib/staffAccountManagement.js')

test('chuẩn hóa email trước khi kiểm tra tài khoản hệ thống', () => {
  assert.equal(normalizedAccountEmail(' Admin@123English.edu.vn '), 'admin@123english.edu.vn')
})

test('không cho xóa chính mình, bất kỳ Admin hoặc email hệ thống', () => {
  assert.equal(accountDeletionBlockReason({ actorUid: 'a', targetUid: 'a', role: 'teacher', authEmail: '', profileEmail: '' }), 'self')
  assert.equal(accountDeletionBlockReason({ actorUid: 'a', targetUid: 'b', role: 'admin', authEmail: 'b@example.com', profileEmail: '' }), 'admin_role')
  assert.equal(accountDeletionBlockReason({ actorUid: 'a', targetUid: 'b', role: 'teacher', authEmail: 'ADMIN@EDUTRACKPRO.APP', profileEmail: '' }), 'system_email')
})

test('cho phép đưa tài khoản thường vào quy trình xóa', () => {
  assert.equal(accountDeletionBlockReason({ actorUid: 'a', targetUid: 'b', role: 'teacher', authEmail: 'teacher@example.com', profileEmail: '' }), null)
})

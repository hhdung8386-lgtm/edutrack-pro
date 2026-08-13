import assert from 'node:assert/strict'
import test from 'node:test'
import { Timestamp } from 'firebase/firestore'
import { buildPublicTeacherProfile, publicProfileAsTeacher } from '../src/lib/publicTeacherProfile.ts'
import type { PublicTeacherProfile } from '../src/lib/publicTeacherProfile.ts'
import type { Teacher } from '../src/types/index.ts'

function activeTeacher(overrides: Partial<Teacher> = {}): Teacher {
  return {
    id: 'teacher-1',
    code: 'Chloe',
    name: 'Tên nội bộ',
    subjectIds: ['english', 'english', ''],
    subjectNames: ['Tiếng Anh'],
    level: 1,
    bio: ' Giới thiệu ',
    photoURL: 'https://example.com/photo.jpg',
    status: 'active',
    bankName: 'Không được công khai',
    bankAccountNo: '123456789',
    bankAccountName: 'Tên tài khoản',
    certificates: [
      { category: 'foreign_language', title: 'IELTS', score: '7.5', status: 'approved', fileURL: 'https://example.com/ielts.jpg' },
      { category: 'pedagogical', title: 'Chờ duyệt', score: 'Pass', status: 'pending', fileURL: 'https://example.com/pending.jpg' },
    ],
    createdAt: Timestamp.now(),
    ...overrides,
  }
}

test('publishes only whitelisted fields and approved certificates', () => {
  const profile = buildPublicTeacherProfile(activeTeacher())

  assert.equal(profile.code, 'Chloe')
  assert.equal(profile.bio, 'Giới thiệu')
  assert.deepEqual(profile.subjectIds, ['english'])
  assert.equal(profile.certificates.length, 1)
  assert.equal(Object.hasOwn(profile, 'bankAccountNo'), false)
  assert.equal(Object.hasOwn(profile, 'bankName'), false)
  assert.equal(Object.hasOwn(profile, 'pointsPer25Minutes'), false)
})

test('refuses inactive and tester profiles', () => {
  assert.throws(
    () => buildPublicTeacherProfile(activeTeacher({ status: 'inactive' })),
    /đang giảng dạy chính thức/,
  )
  assert.throws(
    () => buildPublicTeacherProfile(activeTeacher({ isTester: true })),
    /đang giảng dạy chính thức/,
  )
})

test('keeps old public documents compatible when optional values are missing', () => {
  const current = buildPublicTeacherProfile(activeTeacher())
  const legacy = {
    ...current,
    subjectIds: undefined,
    subjectNames: undefined,
    certificates: undefined,
    teachingYears: undefined,
  } as unknown as PublicTeacherProfile

  const teacher = publicProfileAsTeacher(' teacher-1 ', legacy)
  assert.equal(teacher.id, 'teacher-1')
  assert.deepEqual(teacher.subjectIds, [])
  assert.deepEqual(teacher.subjectNames, [])
  assert.deepEqual(teacher.certificates, [])
  assert.equal(teacher.teachingYears, undefined)
})

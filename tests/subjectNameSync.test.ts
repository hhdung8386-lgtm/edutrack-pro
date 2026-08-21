import assert from 'node:assert/strict'
import test from 'node:test'
import { buildStudentSubjectNamePatch, buildTeacherSubjectNamesPatch } from '../src/lib/subjectNameSyncCore.ts'

test('đổi tên cả field legacy và đúng phần tử môn học mà không đổi số dư', () => {
  const data = {
    subjectId: 'english',
    subjectName: 'Tên cũ',
    totalMinutes: 1300,
    subjects: [
      { subjectId: 'english', subjectName: 'Tên cũ', usedMinutes: 1200, remainingMinutes: 100 },
      { subjectId: 'ielts', subjectName: 'IELTS', usedMinutes: 50, remainingMinutes: 450 },
    ],
  }
  const patch = buildStudentSubjectNamePatch(data, 'english', 'Tên mới')
  assert.deepEqual(patch, {
    subjectName: 'Tên mới',
    subjects: [
      { subjectId: 'english', subjectName: 'Tên mới', usedMinutes: 1200, remainingMinutes: 100 },
      { subjectId: 'ielts', subjectName: 'IELTS', usedMinutes: 50, remainingMinutes: 450 },
    ],
  })
  assert.equal(data.subjects[0].subjectName, 'Tên cũ')
})

test('không tạo write khi học viên không liên quan hoặc đã đồng bộ', () => {
  assert.equal(buildStudentSubjectNamePatch({ subjectId: 'ielts', subjects: [] }, 'english', 'Tên mới'), null)
  assert.equal(buildStudentSubjectNamePatch({ subjectId: 'english', subjectName: 'Tên mới' }, 'english', 'Tên mới'), null)
})

test('đổi đúng nhãn theo vị trí subjectIds và giữ nhãn dư legacy', () => {
  const patch = buildTeacherSubjectNamesPatch({
    subjectIds: ['english', 'ielts'],
    subjectNames: ['Tên cũ', 'IELTS', 'Nhãn legacy'],
  }, 'english', 'Tên mới')
  assert.deepEqual(patch, { subjectNames: ['Tên mới', 'IELTS', 'Nhãn legacy'] })
})

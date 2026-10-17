import assert from 'node:assert/strict'
import test from 'node:test'
import { allocateApprovedLearningMinutes } from '../src/lib/courseProgress.ts'

test('lesson legacy được tính vào gói duy nhất thay vì biến mất khỏi phút đã học', () => {
  const result = allocateApprovedLearningMinutes(
    [{ subjectId: 'new-level-3', registeredMinutes: 1300 }],
    [
      { subjectId: 'new-level-3', status: 'approved', minutes: 300 },
      { subjectId: 'legacy-tutor-b', status: 'approved', minutes: 900 },
      { subjectId: 'new-level-3', status: 'pending', minutes: 50 },
    ],
  )
  assert.deepEqual(result, [1200])
})

test('lesson đúng môn được ưu tiên, phần legacy lấp theo thứ tự và không bị mất khi học vượt', () => {
  const result = allocateApprovedLearningMinutes(
    [
      { subjectId: 'a', registeredMinutes: 500 },
      { subjectId: 'b', registeredMinutes: 500 },
    ],
    [
      { subjectId: 'a', status: 'approved', minutes: 400 },
      { subjectId: 'b', status: 'approved', minutes: 100 },
      { subjectId: 'legacy', status: 'approved', minutes: 650 },
      { subjectId: 'legacy', status: 'rejected', minutes: 50 },
    ],
  )
  assert.deepEqual(result, [650, 500])
})

test('ca đã duyệt có mặt hoặc vắng không phép (vẫn trừ kim cương) đều tăng phút đã học', () => {
  const result = allocateApprovedLearningMinutes(
    [{ subjectId: 'english', registeredMinutes: 1_000 }],
    [
      { subjectId: 'english', status: 'approved', attendanceStatus: 'present', minutes: 50 },
      { subjectId: 'english', status: 'approved', attendanceStatus: 'without_permission', minutes: 50 },
      { subjectId: 'english', status: 'approved', attendanceStatus: 'with_permission', minutes: 0 },
      { subjectId: 'english', status: 'approved', minutes: 25, book: 'Học viên vắng không phép' },
      { subjectId: 'english', status: 'pending', attendanceStatus: 'present', minutes: 25 },
    ],
  )

  assert.deepEqual(result, [125])
})

test('học 925 phút + 2 buổi vắng không phép 25 phút = 975 phút, khớp 975 kim cương', () => {
  const lessons = [
    ...Array.from({ length: 37 }, () => ({ subjectId: 'gt160', status: 'approved' as const, attendanceStatus: 'present' as const, minutes: 25 })),
    { subjectId: 'gt160', status: 'approved' as const, attendanceStatus: 'without_permission' as const, minutes: 25 },
    { subjectId: 'gt160', status: 'approved' as const, attendanceStatus: 'without_permission' as const, minutes: 25 },
  ]
  assert.deepEqual(allocateApprovedLearningMinutes([{ subjectId: 'gt160', registeredMinutes: 1000 }], lessons), [975])
})

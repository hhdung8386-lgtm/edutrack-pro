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

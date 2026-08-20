import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emptyLessonReport,
  MIN_LESSON_RATING,
  validateLessonReport,
} from '../src/components/lessons/lessonReport.ts'

function validDraft() {
  const detail = 'Học viên tham gia tích cực, hoàn thành đầy đủ hoạt động và thể hiện tiến bộ rõ ràng trong buổi học. '
  return {
    ...emptyLessonReport(),
    pages: '12-15',
    knowledgeComment: detail.repeat(2),
    gamesComment: detail.repeat(2),
    exercisesComment: detail.repeat(2),
    homeworkItems: [{ type: 'writing' as const, content: 'Hoàn thành bài tập trang 16 và ôn lại nội dung buổi học.' }],
  }
}

test('lesson rating accepts every integer from three to five stars', () => {
  assert.equal(MIN_LESSON_RATING, 3)
  for (const rating of [3, 4, 5]) {
    assert.equal(validateLessonReport({ ...validDraft(), rating }), null)
  }
})

test('lesson rating rejects values outside the three-to-five range', () => {
  for (const rating of [0, 1, 2, 6, 3.5]) {
    assert.equal(validateLessonReport({ ...validDraft(), rating }), 'report.err_rating')
  }
})

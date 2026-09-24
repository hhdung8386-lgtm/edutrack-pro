import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emptyLessonReport,
  lessonHomeworkText,
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

test('approval display keeps legacy homework and recovers structured-only homework', () => {
  assert.equal(lessonHomeworkText({
    homework: 'Bài tập đã ghép từ dữ liệu cũ',
    homeworkItems: [{ type: 'reading', content: 'Nội dung cấu trúc mới' }],
  }), 'Bài tập đã ghép từ dữ liệu cũ')

  assert.equal(lessonHomeworkText({
    homework: '',
    homeworkItems: [
      { type: 'writing', content: 'Viết 5 câu về gia đình.' },
      { type: 'vocabulary', content: 'Ôn Unit 3.' },
    ],
  }), '1. Bài viết: Viết 5 câu về gia đình.\n2. Ôn tập từ vựng / Workbook: Ôn Unit 3.')
})

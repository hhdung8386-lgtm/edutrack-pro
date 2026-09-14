import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emptyLessonReport,
  lessonReportFields,
  MIN_LESSON_RATING,
  normalizeHomeworkItems,
  validateLessonReport,
} from '../src/components/lessons/lessonReport.ts'
import { validateHomeworkHtmlFile } from '../src/lib/homeworkHtmlValidation.ts'

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

test('homework HTML attachment is optional and old homework stays unchanged', () => {
  assert.deepEqual(
    normalizeHomeworkItems([{ type: 'reading', content: '  Đọc bài trang 12.  ' }]),
    [{ type: 'reading', content: 'Đọc bài trang 12.' }],
  )
})

test('valid homework HTML metadata is preserved in stored lesson fields', () => {
  const attachment = {
    fileName: 'lesson-1a.html',
    fileURL: 'https://firebasestorage.googleapis.com/example.html?token=safe',
    sizeBytes: 26_550,
  }
  const fields = lessonReportFields({
    ...validDraft(),
    homeworkItems: [{ type: 'reading', content: 'Mở và hoàn thành bài tương tác.', htmlAttachment: attachment }],
  })
  assert.deepEqual(fields.homeworkItems, [
    { type: 'reading', content: 'Mở và hoàn thành bài tương tác.', htmlAttachment: attachment },
  ])
})

test('pending browser File can never be written into Firestore lesson fields', () => {
  const draft = {
    ...validDraft(),
    homeworkItems: [{
      type: 'reading' as const,
      content: 'Mở và hoàn thành bài tương tác.',
      pendingHtmlFile: { name: 'lesson.html', size: 100 } as File,
    }],
  }
  assert.throws(() => lessonReportFields(draft), /HOMEWORK_HTML_NOT_UPLOADED/)
})

test('HTML homework file validation accepts only non-empty HTML files up to 1 MB', () => {
  assert.doesNotThrow(() => validateHomeworkHtmlFile({ name: 'lesson.htm', size: 26_550 }))
  assert.throws(() => validateHomeworkHtmlFile({ name: 'lesson.pdf', size: 26_550 }), /HOMEWORK_HTML_UNSUPPORTED/)
  assert.throws(() => validateHomeworkHtmlFile({ name: 'lesson.html', size: 0 }), /HOMEWORK_HTML_EMPTY/)
  assert.throws(() => validateHomeworkHtmlFile({ name: 'lesson.html', size: 1024 * 1024 + 1 }), /HOMEWORK_HTML_TOO_LARGE/)
})

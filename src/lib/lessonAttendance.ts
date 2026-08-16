import type { Lesson } from '@/types'

type LearningLesson = Pick<Lesson, 'status' | 'minutes' | 'attendanceStatus'>
  & Partial<Pick<Lesson, 'book' | 'comment' | 'absenceFollowUpOf'>>

const LEGACY_ABSENCE_TEXT = /học viên vắng|vắng không phép|student (?:was )?absent/i

/**
 * Một "buổi đã học" phải là báo cáo đã duyệt, có thời lượng thực học và học
 * viên có mặt. publicLessons cũ chưa lưu attendanceStatus, nên cần fallback từ
 * các dấu vết vắng ổn định mà form điểm danh đã lưu từ trước.
 */
export function isCompletedLearningLesson(lesson: LearningLesson): boolean {
  if (lesson.status !== 'approved' || Number(lesson.minutes) <= 0) return false

  if (lesson.attendanceStatus) return lesson.attendanceStatus === 'present'
  if (lesson.absenceFollowUpOf) return false

  return !LEGACY_ABSENCE_TEXT.test(`${lesson.book || ''}\n${lesson.comment || ''}`)
}

/** Số phút thực học được phép hiển thị trong tiến độ của học viên. */
export function getCompletedLearningMinutes(lesson: LearningLesson): number {
  return isCompletedLearningLesson(lesson) ? Number(lesson.minutes) : 0
}

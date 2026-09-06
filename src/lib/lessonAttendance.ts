import type { Lesson } from '@/types'

type LearningLesson = Pick<Lesson, 'status' | 'minutes' | 'attendanceStatus'>
  & Partial<Pick<Lesson, 'book' | 'comment' | 'absenceFollowUpOf'>>

// Firestore contains records written before the current attendance-status
// vocabulary. Keep this compatibility boundary local: application code still
// writes only the current `Lesson` union, while old persisted strings can be
// interpreted safely when an administrator reviews them.
type ZeroMinuteAbsenceLesson = Pick<Lesson, 'minutes'>
  & Partial<Pick<Lesson, 'book' | 'comment'>>
  & { attendanceStatus?: string }

const LEGACY_ABSENCE_TEXT = /học viên vắng|vắng không phép|student (?:was )?absent/i
const LEGACY_ZERO_MINUTE_EXCUSED_TEXT = /học viên vắng|student (?:was )?absent/i
const LEGACY_ZERO_MINUTE_UNEXCUSED_TEXT = /không phép|without permission/i

/**
 * A permitted absence never consumes lesson fund: it is recorded as zero
 * minutes. Older records can have either no `attendanceStatus` or the legacy
 * `absent_excused` value. The text fallback excludes an explicit unexcused
 * marker, and never treats an arbitrary zero-minute report as an absence.
 */
export function isZeroMinuteExcusedAbsence(
  lesson: ZeroMinuteAbsenceLesson,
): boolean {
  const minutes = Number(lesson.minutes)
  if (!Number.isFinite(minutes) || minutes !== 0) return false
  const attendanceStatus = String(lesson.attendanceStatus || '')
  if (attendanceStatus === 'with_permission' || attendanceStatus === 'absent_excused') return true
  if (attendanceStatus) return false
  const legacyText = `${lesson.book || ''}\n${lesson.comment || ''}`
  return LEGACY_ZERO_MINUTE_EXCUSED_TEXT.test(legacyText)
    && !LEGACY_ZERO_MINUTE_UNEXCUSED_TEXT.test(legacyText)
}

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

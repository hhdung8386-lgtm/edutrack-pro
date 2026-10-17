import type { Lesson } from '../types'

export type CourseProgressSubject = {
  subjectId: string
  registeredMinutes: number
}

export type CourseProgressLesson = Pick<
  Lesson,
  'subjectId' | 'status' | 'minutes' | 'attendanceStatus' | 'book' | 'comment' | 'absenceFollowUpOf'
>

/**
 * Phút đã dùng của một ca: ca đã duyệt có thời lượng > 0 (có mặt hoặc vắng không
 * phép — buổi vắng không phép vẫn trừ kim cương nên cũng mất phút). Vắng có phép
 * luôn 0 phút nên không bị tính.
 */
export function getConsumedLessonMinutes(lesson: Pick<CourseProgressLesson, 'status' | 'minutes'>): number {
  if (lesson.status !== 'approved') return 0
  const minutes = Number(lesson.minutes)
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0
}

/**
 * Phân bổ phút đã dùng theo từng quyền học: ca đã duyệt có thời lượng (kể cả vắng
 * không phép) mới được tính. Khớp subjectId trước; lesson legacy/mất liên kết được lấp vào phần
 * quyền học còn trống theo thứ tự gói. Nếu đã học vượt, phần vượt thuộc gói đầu tiên
 * để không mất số.
 */
export function allocateApprovedLearningMinutes(
  subjects: CourseProgressSubject[],
  lessons: CourseProgressLesson[],
) {
  const subjectIndexes = new Map(subjects.map((subject, index) => [subject.subjectId, index]))
  const allocated = subjects.map(() => 0)
  let unmatchedMinutes = 0

  lessons.forEach((lesson) => {
    const minutes = getConsumedLessonMinutes(lesson)
    if (minutes <= 0) return
    const index = lesson.subjectId ? subjectIndexes.get(lesson.subjectId) : undefined
    if (index === undefined) unmatchedMinutes += minutes
    else allocated[index] += minutes
  })

  subjects.forEach((subject, index) => {
    if (unmatchedMinutes <= 0) return
    const available = Math.max(0, Number(subject.registeredMinutes || 0) - allocated[index])
    const assigned = Math.min(available, unmatchedMinutes)
    allocated[index] += assigned
    unmatchedMinutes -= assigned
  })

  if (unmatchedMinutes > 0 && allocated.length > 0) allocated[0] += unmatchedMinutes
  return allocated
}

/**
 * Phút còn lại phải đi theo kim cương còn lại, quy đổi đúng tỉ lệ lúc đăng ký gói
 * (thường 25 kim cương = 25 phút). Trừ phút đã học khỏi phút đăng ký sẽ lệch khi
 * gia sư tính cao hơn giá gói (vd 35 kim cương/25 phút) hoặc buổi vắng có phí.
 */
export function courseRemainingMinutes(input: {
  registeredMinutes: number
  registeredDiamonds: number
  remainingDiamonds: number
}): number {
  const remainingDiamonds = Math.max(0, Number(input.remainingDiamonds) || 0)
  const registeredMinutes = Number(input.registeredMinutes) || 0
  const registeredDiamonds = Number(input.registeredDiamonds) || 0
  if (registeredMinutes <= 0 || registeredDiamonds <= 0) return Math.round(remainingDiamonds)
  return Math.round(remainingDiamonds * (registeredMinutes / registeredDiamonds))
}

/**
 * Kim cương đã dùng vượt phần tương ứng với phút đã học (đơn giá gia sư cao hơn giá
 * gói, buổi vắng không phép tính phí...). Chỉ để giải thích, không đổi số liệu.
 */
export function courseLearnedDiamondPremium(input: {
  registeredMinutes: number
  registeredDiamonds: number
  learnedMinutes: number
  learnedDiamonds: number
}): number {
  const registeredMinutes = Number(input.registeredMinutes) || 0
  const registeredDiamonds = Number(input.registeredDiamonds) || 0
  const ratio = registeredMinutes > 0 && registeredDiamonds > 0 ? registeredDiamonds / registeredMinutes : 1
  return Math.round((Number(input.learnedDiamonds) || 0) - (Number(input.learnedMinutes) || 0) * ratio)
}

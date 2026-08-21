export type CourseProgressSubject = {
  subjectId: string
  registeredMinutes: number
}

export type CourseProgressLesson = {
  subjectId?: string
  status: string
  minutes?: number
}

/**
 * Phân bổ phút học thực tế theo cùng nguyên tắc đối soát quỹ trên trang học viên:
 * khớp subjectId trước; lesson legacy/mất liên kết được lấp vào phần quyền học còn
 * trống theo thứ tự gói. Nếu đã học vượt, phần vượt thuộc gói đầu tiên để không mất số.
 */
export function allocateApprovedLearningMinutes(
  subjects: CourseProgressSubject[],
  lessons: CourseProgressLesson[],
) {
  const subjectIndexes = new Map(subjects.map((subject, index) => [subject.subjectId, index]))
  const allocated = subjects.map(() => 0)
  let unmatchedMinutes = 0

  lessons.forEach((lesson) => {
    if (lesson.status !== 'approved') return
    const minutes = Math.max(0, Number(lesson.minutes || 0))
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

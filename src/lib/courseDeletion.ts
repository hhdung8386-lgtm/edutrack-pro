/**
 * Quy tắc gỡ một khóa học (StudentSubject) khỏi hồ sơ học viên.
 *
 * Buổi bị từ chối / huỷ không trừ kim cương nên không được khoá nút xoá.
 * Buổi đã duyệt, đang chờ duyệt (hoặc dữ liệu cũ không có trạng thái) và ca
 * còn giữ kim cương thì phải giữ khóa học để số dư và lịch sử luôn khớp.
 */
export type CourseDeletionBlock = 'counted-lessons' | 'held-bookings'

interface LessonLike {
  subjectId?: string
  status?: string
}

interface BookingLike {
  subjectId?: string
}

const NON_COUNTING_LESSON_STATUSES = new Set(['rejected', 'cancelled'])

const normalizedId = (value: unknown) => String(value ?? '').trim()

/** `heldBookings` phải là danh sách ca đang thực sự giữ kim cương của học viên. */
export function courseDeletionBlock(
  subjectId: string,
  lessons: LessonLike[],
  heldBookings: BookingLike[],
): CourseDeletionBlock | null {
  const id = normalizedId(subjectId)
  const countsLesson = (lesson: LessonLike) => (
    normalizedId(lesson.subjectId) === id && !NON_COUNTING_LESSON_STATUSES.has(String(lesson.status ?? ''))
  )
  if (lessons.some(countsLesson)) return 'counted-lessons'
  if (heldBookings.some((booking) => normalizedId(booking.subjectId) === id)) return 'held-bookings'
  return null
}

export function courseDeletionBlockMessage(block: CourseDeletionBlock): string {
  return block === 'counted-lessons'
    ? 'Không thể xóa: khóa học đã có buổi được duyệt hoặc đang chờ duyệt.'
    : 'Không thể xóa: khóa học đang giữ kim cương cho lịch đã đặt. Hãy nhả hoặc chuyển các ca đó trước.'
}

export interface CourseFundFields {
  subjectId: string
  subjectName?: string
  minutesPerSession?: number
  totalSessions?: number
  usedSessions?: number
  remainingSessions?: number
  totalMinutes?: number
  usedMinutes?: number
  remainingMinutes?: number
}

/** Tổng hợp lại các field cấp hồ sơ sau khi bỏ một khóa, cùng quy tắc với SubjectPackageModal. */
export function studentFieldsAfterCourseRemoval<T extends CourseFundFields>(
  subjects: T[],
  subjectId: string,
  currentStatus?: string,
) {
  const remaining = subjects.filter((subject) => subject.subjectId !== subjectId)
  const sum = (key: keyof CourseFundFields) => remaining.reduce((total, subject) => total + (Number(subject[key]) || 0), 0)
  const remainingMinutes = sum('remainingMinutes')
  const primary = remaining.find((subject) => (Number(subject.remainingMinutes) || 0) > 0) || remaining[0] || null
  return {
    subjects: remaining,
    totalSessions: sum('totalSessions'),
    usedSessions: sum('usedSessions'),
    remainingSessions: sum('remainingSessions'),
    totalMinutes: sum('totalMinutes'),
    usedMinutes: sum('usedMinutes'),
    remainingMinutes,
    subjectId: primary ? primary.subjectId : '',
    subjectName: primary ? primary.subjectName || '' : '',
    minutesPerSession: primary ? Number(primary.minutesPerSession) || 25 : 25,
    // Hồ sơ bảo lưu / ngưng học giữ nguyên; chỉ tự chuyển giữa đang học và hết hạn.
    status: currentStatus === 'reserved' || currentStatus === 'inactive'
      ? currentStatus
      : remainingMinutes <= 0 ? 'expired' : 'active',
  }
}

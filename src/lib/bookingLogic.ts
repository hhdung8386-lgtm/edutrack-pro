import type { BookingRequest, LessonScheduleCheckSnapshot } from '@/types'

export type LessonBookingReference = {
  id: string
  bookingRequestId?: string
  bookingRequestIds?: string[]
  scheduleCheck?: Pick<LessonScheduleCheckSnapshot, 'bookingId' | 'bookingIds'>
  studentId: string
  teacherId: string
  date: string
  minutes: number
  subjectId: string
}

/** Booking đã có báo cáo điểm danh hoặc đã được duyệt hoàn tất. */
export function isBookingAttended(booking: BookingRequest | null | undefined): boolean {
  return Boolean(booking && (booking.lessonId || booking.status === 'completed'))
}

/** Chỉ lịch đang giữ chỗ và chưa có báo cáo điểm danh mới được phép nhả/xóa. */
export function isBookingCancellable(booking: BookingRequest | null | undefined): boolean {
  return Boolean(
    booking
    && (booking.status === 'pending' || booking.status === 'confirmed')
    && !booking.lessonId,
  )
}

const ACTIVE_BOOKING_STATUSES = new Set<BookingRequest['status']>(['pending', 'confirmed'])

function timeToMinutes(time: string) {
  const [hours = '0', minutes = '0'] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}

export function isSameAttendanceClass(left: BookingRequest, right: BookingRequest) {
  return Boolean(
    left.studentId
    && left.studentId === right.studentId
    && (!left.studentCode || !right.studentCode || left.studentCode === right.studentCode)
    && (left.subjectId || '') === (right.subjectId || '')
    && (left.requestedDate || '') === (right.requestedDate || ''),
  )
}

export function areConsecutiveBookings(previous: BookingRequest, next: BookingRequest) {
  if (!previous.requestedStart || !next.requestedStart) return false

  const previousStart = timeToMinutes(previous.requestedStart)
  const nextStart = timeToMinutes(next.requestedStart)
  const requestedMinutes = Number(previous.requestedMinutes)
  const slotStep = Number.isFinite(requestedMinutes) && requestedMinutes > 0
    ? Math.max(30, Math.ceil(requestedMinutes / 30) * 30)
    : 30

  return nextStart === previousStart + slotStep
}

/**
 * Các ca còn lại trong ngày của cùng học viên/gia sư/môn. Dùng cho vắng học:
 * đóng toàn bộ lịch sau đó nhưng chỉ ca đầu chịu phí theo quy tắc nghiệp vụ.
 */
export function findLaterSameDayBookings(
  bookings: BookingRequest[],
  current: BookingRequest | null | undefined,
): BookingRequest[] {
  if (!current?.requestedDate || !current?.requestedStart) return []
  const currentStart = timeToMinutes(current.requestedStart)
  return bookings
    .filter((booking) => {
      if (booking.id === current.id) return false
      if (!isSameAttendanceClass(booking, current)) return false
      if (booking.status !== 'confirmed' || booking.lessonId) return false
      if (!booking.requestedStart) return false
      return timeToMinutes(booking.requestedStart) > currentStart
    })
    .sort((a, b) => timeToMinutes(a.requestedStart || '') - timeToMinutes(b.requestedStart || ''))
}

/** Chọn trọn cụm ca liền nhau của cùng lớp quanh ô giáo viên vừa mở. */
export function findConsecutiveAttendanceBookings(
  bookings: BookingRequest[],
  current: BookingRequest | null | undefined,
  maxBookings = 4,
): BookingRequest[] {
  if (!current || maxBookings < 1) return []

  const candidates = bookings
    .filter((booking) => isSameAttendanceClass(booking, current))
    .sort((left, right) => timeToMinutes(left.requestedStart || '') - timeToMinutes(right.requestedStart || ''))
  const currentIndex = candidates.findIndex((booking) => booking.id === current.id)
  if (currentIndex < 0) return [current]

  let start = currentIndex
  let end = currentIndex
  while (start > 0 && areConsecutiveBookings(candidates[start - 1], candidates[start])) start -= 1
  while (end + 1 < candidates.length && areConsecutiveBookings(candidates[end], candidates[end + 1])) end += 1

  return candidates.slice(start, end + 1).slice(0, maxBookings)
}

function sameLessonIdentity(booking: BookingRequest, lesson: LessonBookingReference): boolean {
  if (booking.studentId !== lesson.studentId) return false
  if (booking.teacherId !== lesson.teacherId) return false
  if (booking.requestedDate !== lesson.date) return false
  return !lesson.subjectId || !booking.subjectId || booking.subjectId === lesson.subjectId
}

export function totalBookingMinutes(bookings: BookingRequest[]): number {
  return bookings.reduce((sum, booking) => sum + Number(booking.requestedMinutes || 0), 0)
}

export function validateExplicitLessonBookings(
  bookings: BookingRequest[],
  lesson: LessonBookingReference,
): boolean {
  return bookings.every((booking) => sameLessonIdentity(booking, lesson))
    && (Number(lesson.minutes) <= 0 || totalBookingMinutes(bookings) === Number(lesson.minutes))
}

/** Fallback chỉ được chọn khi kết quả duy nhất và khớp toàn bộ thời lượng. */
export function selectLessonBookingMatches(
  matches: BookingRequest[],
  lesson: LessonBookingReference,
): BookingRequest[] {
  const active = matches.filter((booking) => ACTIVE_BOOKING_STATUSES.has(booking.status) && sameLessonIdentity(booking, lesson))
  if (active.length === 0) return []

  const exact = active.filter((booking) => Number(booking.requestedMinutes) === Number(lesson.minutes))
  if (exact.length === 1) return exact
  if (exact.length > 1) throw new Error('BOOKING_MATCH_AMBIGUOUS')
  if (active.length > 1 && totalBookingMinutes(active) === Number(lesson.minutes)) return active

  throw new Error('BOOKING_MATCH_AMBIGUOUS')
}

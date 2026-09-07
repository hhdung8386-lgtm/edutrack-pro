import type { BookingRequest, LessonScheduleCheckSnapshot } from '@/types'

export type LessonBookingReference = {
  id: string
  bookingRequestId?: string
  bookingRequestIds?: string[]
  scheduleCheck?: Pick<LessonScheduleCheckSnapshot, 'bookingId' | 'bookingIds' | 'bookingStart' | 'bookingEnd'>
  studentId: string
  teacherId: string
  date: string
  minutes: number
  subjectId: string
  /** Only enabled for a zero-minute excused absence; never relax normal matching. */
  isZeroMinuteExcusedAbsence?: boolean
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

/**
 * Returns one whole contiguous class block only when exactly one such block
 * has the requested total. Callers must supply bookings for one attendance
 * identity (student, teacher, subject and date); an adjacent extra booking
 * makes the block ineligible rather than being silently split.
 */
export function selectUniqueContiguousBookingSet(
  candidates: BookingRequest[],
  requestedMinutes: number,
): BookingRequest[] {
  const target = Number(requestedMinutes)
  if (![25, 50, 75, 100].includes(target)) return []

  // A single booking whose persisted duration already equals the lesson is
  // sufficient even for older records that never stored a display start time.
  const exactSingles = candidates.filter((booking) => Number(booking.requestedMinutes) === target)
  if (exactSingles.length === 1) return exactSingles
  if (exactSingles.length > 1) return []

  const sorted = candidates
    .filter(hasValidAttendanceSlot)
    .sort((left, right) => timeToMinutes(left.requestedStart) - timeToMinutes(right.requestedStart))
  const blocks: BookingRequest[][] = []
  for (const booking of sorted) {
    const current = blocks[blocks.length - 1]
    if (current && areConsecutiveBookings(current[current.length - 1], booking)) current.push(booking)
    else blocks.push([booking])
  }

  const exactBlocks = blocks.filter((block) => totalBookingMinutes(block) === target)
  return exactBlocks.length === 1 ? exactBlocks[0] : []
}

function sameLessonIdentity(booking: BookingRequest, lesson: LessonBookingReference): boolean {
  if (booking.studentId !== lesson.studentId) return false
  if (booking.teacherId !== lesson.teacherId) return false
  if (booking.requestedDate !== lesson.date) return false
  return matchesLessonBookingSubject(booking, lesson.subjectId)
}

/**
 * Subject IDs became mandatory after early booking records existed. A missing
 * legacy ID remains eligible for manual verification, but two explicit, unlike
 * subjects must never be combined into one attendance lesson.
 */
export function matchesLessonBookingSubject(booking: BookingRequest, subjectId?: string): boolean {
  return !subjectId || !booking.subjectId || booking.subjectId === subjectId
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

/**
 * Khôi phục duy nhất liên kết cũ của một buổi dài đã từng chỉ lưu ID của ô đầu.
 *
 * Chỉ nhận một cụm ca liền nhau, cùng học viên/gia sư/môn/ngày, đủ ĐÚNG số phút
 * của lesson và không có ca nào đã thuộc một lesson khác. Không suy đoán khi có
 * thêm một ô liền kề, lệch giờ, hoặc tổng số phút không khớp.
 */
export function recoverLegacySingleBookingReference(
  candidates: BookingRequest[],
  explicitBookings: BookingRequest[],
  lesson: LessonBookingReference,
): BookingRequest[] {
  const lessonMinutes = Number(lesson.minutes)
  if (explicitBookings.length !== 1 || ![25, 50, 75, 100].includes(lessonMinutes)) return []

  const explicit = explicitBookings[0]
  if (
    !ACTIVE_BOOKING_STATUSES.has(explicit.status)
    || !sameLessonIdentity(explicit, lesson)
    || !hasValidAttendanceSlot(explicit)
  ) return []

  const eligible = candidates.filter((booking) => (
    ACTIVE_BOOKING_STATUSES.has(booking.status)
    && sameLessonIdentity(booking, lesson)
    && (!booking.lessonId || booking.lessonId === lesson.id)
    && hasValidAttendanceSlot(booking)
  ))
  if (!eligible.some((booking) => booking.id === explicit.id)) return []

  // Ask for the whole uninterrupted block rather than only enough adjacent
  // rows: otherwise a 50-minute lesson inside a longer block would be guessed.
  const contiguous = selectUniqueContiguousBookingSet(eligible, lessonMinutes)
  if (contiguous.length < 2 || !contiguous.some((booking) => booking.id === explicit.id)) return []

  return contiguous
}

/**
 * A legacy 0-minute excused absence has no duration with which to expand a
 * booking group. It can only recover one exact booking if the saved schedule
 * snapshot anchors both its start (and, when available, its end) uniquely.
 */
export function selectLegacyExcusedAbsenceBookingByScheduleCheck(
  candidates: BookingRequest[],
  lesson: LessonBookingReference,
): BookingRequest[] {
  if (Number(lesson.minutes) !== 0 || !lesson.isZeroMinuteExcusedAbsence) return []
  const start = lesson.scheduleCheck?.bookingStart
  const end = lesson.scheduleCheck?.bookingEnd
  if (!start) return []

  const anchored = candidates.filter((booking) => (
    ACTIVE_BOOKING_STATUSES.has(booking.status)
    && sameLessonIdentity(booking, lesson)
    && (!booking.lessonId || booking.lessonId === lesson.id)
    && booking.requestedStart === start
    && (!end || booking.requestedEnd === end)
  ))
  return anchored.length === 1 ? anchored : []
}

function hasValidAttendanceSlot(booking: BookingRequest): boolean {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(booking.requestedStart || '')
  if (!match) return false
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const duration = Number(booking.requestedMinutes)
  return Number.isInteger(hours)
    && hours >= 0
    && hours <= 49
    && Number.isInteger(minutes)
    && Number.isInteger(duration)
    && [25, 50, 75, 100].includes(duration)
}

/** Fallback chỉ được chọn khi kết quả duy nhất và khớp toàn bộ thời lượng. */
export function selectLessonBookingMatches(
  matches: BookingRequest[],
  lesson: LessonBookingReference,
): BookingRequest[] {
  const active = matches.filter((booking) => (
    ACTIVE_BOOKING_STATUSES.has(booking.status)
    && sameLessonIdentity(booking, lesson)
    && (!booking.lessonId || booking.lessonId === lesson.id)
  ))
  if (active.length === 0) return []

  // An excused absence is saved as zero minutes while its arranged slot still
  // has its normal 25/50-minute duration. For legacy lessons that do not keep
  // a booking ID, join only when exactly one safe candidate remains.
  if (Number(lesson.minutes) === 0 && lesson.isZeroMinuteExcusedAbsence) {
    if (active.length === 1) return active
    throw new Error('BOOKING_MATCH_AMBIGUOUS')
  }

  const exact = active.filter((booking) => Number(booking.requestedMinutes) === Number(lesson.minutes))
  if (exact.length === 1) return exact
  if (exact.length > 1) throw new Error('BOOKING_MATCH_AMBIGUOUS')
  if (active.length > 1 && totalBookingMinutes(active) === Number(lesson.minutes)) return active

  throw new Error('BOOKING_MATCH_AMBIGUOUS')
}

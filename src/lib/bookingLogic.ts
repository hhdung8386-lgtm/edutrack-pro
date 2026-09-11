import type { BookingRequest, LessonBookingSubjectReconciliation, LessonScheduleCheckSnapshot } from '@/types'
import { sameClassHuntCompensation } from './classHuntCompensation.ts'

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
  subjectName?: string
  groupClassId?: string
  bookingSubjectReconciliation?: LessonBookingSubjectReconciliation
  /** Only enabled for a zero-minute excused absence; never relax normal matching. */
  isZeroMinuteExcusedAbsence?: boolean
}

export type BookingSubjectReconciliationDraft = {
  kind: 'prelinked_subject_mismatch'
  bookingIds: string[]
  bookingSubjectId: string
  bookingSubjectName?: string
  reportedSubjectId: string
  reportedSubjectName?: string
  settlementSubjectId: string
  settlementSubjectName: string
  reason: string
  confirmed: boolean
}

export type PrelinkedSubjectMismatchCandidate = {
  bookingIds: string[]
  bookingSubjectId: string
  bookingSubjectName?: string
  bookingStart: string
  bookingEnd: string
  totalMinutes: number
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

/**
 * A booking keeps the student's diamond fund reserved until approval settles
 * it. Attendance attaches `lessonId` before that settlement, so `lessonId`
 * must never by itself make an active booking spendable again. Cancellation
 * uses the narrower `isBookingCancellable` predicate above.
 */
export function isBookingHoldingStudentFund(
  booking: Pick<BookingRequest, 'status'> | null | undefined,
): boolean {
  return Boolean(booking && (booking.status === 'pending' || booking.status === 'confirmed'))
}

/**
 * A parent self-service cancellation can keep the original diamonds locked
 * while the family must arrange a replacement lesson. This is no longer a
 * calendar booking, but it remains a financial hold until a replacement has
 * consumed it (or an audited workflow clears it).
 */
export function isBookingPendingRebookFundHold(
  booking: Pick<BookingRequest, 'status' | 'pendingRebook' | 'rebookHoldPoints' | 'rebookedByBookingId'> | null | undefined,
): boolean {
  const points = Number(booking?.rebookHoldPoints)
  return Boolean(
    booking
    && booking.status === 'released'
    && booking.pendingRebook === true
    && !booking.rebookedByBookingId
    && Number.isFinite(points)
    && points > 0,
  )
}

/** A financial hold is either a live calendar booking or an unrebooked debt. */
export function isBookingFinancialHold(
  booking: Pick<BookingRequest, 'status' | 'pendingRebook' | 'rebookHoldPoints' | 'rebookedByBookingId'> | null | undefined,
): boolean {
  return isBookingHoldingStudentFund(booking) || isBookingPendingRebookFundHold(booking)
}

/**
 * Trước 10/08/2026 duyệt buổi chỉ gắn `lessonId` mà không đóng ca đặt lịch, nên
 * còn nhiều ca `confirmed` trỏ về buổi ĐÃ DUYỆT. Buổi đó đã trừ quỹ; nếu vẫn coi
 * ca là đang giữ thì học viên bị tính hai lần ("hết kim cương" dù còn quỹ, sổ
 * báo "đã đặt" nhưng Lịch đã đặt trống). Mọi phép tính quỹ phải chạy qua
 * `settleApprovedLessonBookings` khi có dữ liệu buổi dạy. Buổi chưa đọc được,
 * không tồn tại, chưa duyệt hoặc thuộc học viên khác giữ nguyên ca (không nhả nhầm).
 */
export interface LessonSettlementFact {
  status: string
  studentId: string
}

export type LessonSettlementFacts = ReadonlyMap<string, LessonSettlementFact>

export function lessonSettlementFacts(
  lessons: ReadonlyArray<{ id: string; status?: string; studentId?: string }>,
): Map<string, LessonSettlementFact> {
  return new Map(lessons.map((lesson) => [lesson.id, { status: lesson.status || '', studentId: lesson.studentId || '' }]))
}

export function activeLinkedLessonIds(
  bookings: ReadonlyArray<Pick<BookingRequest, 'status' | 'lessonId'>>,
): string[] {
  return Array.from(new Set(bookings.flatMap((booking) => (
    isBookingHoldingStudentFund(booking) && booking.lessonId ? [booking.lessonId] : []
  )))).sort()
}

export function isBookingSettledByApprovedLesson(
  booking: Pick<BookingRequest, 'status' | 'lessonId' | 'studentId'>,
  facts: LessonSettlementFacts,
): boolean {
  if (!isBookingHoldingStudentFund(booking) || !booking.lessonId || !booking.studentId) return false
  const fact = facts.get(booking.lessonId)
  return fact?.status === 'approved' && fact.studentId === booking.studentId
}

/** Bản sao coi ca đã có buổi được duyệt là `completed`; không ghi dữ liệu. */
export function settleApprovedLessonBookings<T extends Pick<BookingRequest, 'status' | 'lessonId' | 'studentId'>>(
  bookings: T[],
  facts: LessonSettlementFacts,
): T[] {
  if (facts.size === 0) return bookings
  let changed = false
  const next = bookings.map((booking) => {
    if (!isBookingSettledByApprovedLesson(booking, facts)) return booking
    changed = true
    return { ...booking, status: 'completed' as const }
  })
  return changed ? next : bookings
}

const ACTIVE_BOOKING_STATUSES = new Set<BookingRequest['status']>(['pending', 'confirmed'])

/**
 * A booking is usable for attendance only while it is still an active hold.
 * A pending request that the tutor already declined must not be linked later
 * merely because its Firestore status has not been released yet.
 */
export function isActiveAttendanceBooking(
  booking: Pick<BookingRequest, 'status' | 'teacherResponse'>,
): boolean {
  return ACTIVE_BOOKING_STATUSES.has(booking.status)
    && !(booking.status === 'pending' && booking.teacherResponse === 'declined')
}

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
    && (left.requestedDate || '') === (right.requestedDate || '')
    && sameClassHuntCompensation(left, right),
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

  const sorted = candidates
    .filter(hasValidAttendanceSlot)
    .sort((left, right) => timeToMinutes(left.requestedStart) - timeToMinutes(right.requestedStart))

  // A single legacy record without a usable display time can remain compatible
  // only when it is the sole candidate. With any additional candidate we cannot
  // prove whether it belongs to the same class block, so fail closed.
  if (sorted.length !== candidates.length) {
    return candidates.length === 1 && Number(candidates[0].requestedMinutes) === target
      ? [candidates[0]]
      : []
  }

  // Do not silently split a contiguous block. This covers a persisted 50-minute
  // slot followed by an adjacent slot as well as the common 25 + 25-minute case.
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

function sameLessonIdentityIgnoringSubject(booking: BookingRequest, lesson: LessonBookingReference): boolean {
  return booking.studentId === lesson.studentId
    && booking.teacherId === lesson.teacherId
    && booking.requestedDate === lesson.date
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

export function lessonReferencedBookingIds(lesson: LessonBookingReference): string[] {
  return Array.from(new Set([
    ...(lesson.bookingRequestIds || []),
    ...(lesson.scheduleCheck?.bookingIds || []),
    lesson.bookingRequestId,
    lesson.scheduleCheck?.bookingId,
  ].filter((id): id is string => Boolean(id))))
}

/**
 * A stored reconciliation records an exceptional settlement that must be
 * handled manually. Bulk actions and the generic rollback path must leave it
 * alone until a dedicated, audited data-administration workflow exists.
 */
export function requiresIndividualSubjectReconciliation(
  lesson: Pick<LessonBookingReference, 'bookingSubjectReconciliation'>,
): boolean {
  return Boolean(lesson.bookingSubjectReconciliation)
}

/**
 * A generic status rollback cannot safely reverse an exceptional subject
 * settlement: its exact booking set, point debit, payroll, and audit trail
 * must be handled together by a dedicated data-administration workflow.
 */
export const RECONCILIATION_MANUAL_ROLLBACK_REQUIRED = 'RECONCILIATION_MANUAL_ROLLBACK_REQUIRED'

export function assertAutomaticReconciliationRollbackAllowed(
  lesson: Pick<LessonBookingReference, 'bookingSubjectReconciliation'>,
): void {
  if (requiresIndividualSubjectReconciliation(lesson)) {
    throw new Error(RECONCILIATION_MANUAL_ROLLBACK_REQUIRED)
  }
}

function sameBookingIdSet(left: string[], right: string[]) {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  return leftSet.size === rightSet.size
    && [...leftSet].every((id) => rightSet.has(id))
}

function samePrelinkedAttendanceIdentity(booking: BookingRequest, lesson: LessonBookingReference) {
  if (booking.studentId !== lesson.studentId) return false
  if (booking.teacherId !== lesson.teacherId) return false
  if (booking.requestedDate !== lesson.date) return false
  // The reconciliation exception must never turn an individual attendance
  // row into a group-class booking (or the reverse) merely because the other
  // identity fields happen to match.
  if ((booking.groupClassId || '') !== (lesson.groupClassId || '')) return false
  return booking.lessonId === lesson.id
}

function structurallyValidPrelinkedBookings(
  bookings: BookingRequest[],
  lesson: LessonBookingReference,
  mode: 'approval' | 'rollback',
) {
  const referencedIds = lessonReferencedBookingIds(lesson)
  const bookingIds = bookings.map((booking) => booking.id)
  if (bookings.length === 0 || !sameBookingIdSet(referencedIds, bookingIds)) return false
  if (Number(lesson.minutes) <= 0 || totalBookingMinutes(bookings) !== Number(lesson.minutes)) return false
  if (!bookings.every((booking) => samePrelinkedAttendanceIdentity(booking, lesson))) return false

  const groupClassIds = new Set(bookings.map((booking) => booking.groupClassId || ''))
  if (groupClassIds.size !== 1) return false

  const bookingSubjectIds = new Set(bookings.map((booking) => booking.subjectId || ''))
  if (bookingSubjectIds.size !== 1 || bookingSubjectIds.has('')) return false

  const stateIsValid = mode === 'approval'
    ? bookings.every(isActiveAttendanceBooking)
    : bookings.every((booking) => booking.status === 'completed' && booking.lessonId === lesson.id)
  if (!stateIsValid) return false

  const contiguous = selectUniqueContiguousBookingSet(bookings, Number(lesson.minutes))
  return contiguous.length === bookings.length
    && sameBookingIdSet(contiguous.map((booking) => booking.id), bookings.map((booking) => booking.id))
}

/**
 * Returns a candidate only for the narrow, auditable legacy case where every
 * booking is already linked to this lesson. It never searches nearby rows and
 * therefore cannot guess which timetable block should be charged.
 */
export function getPrelinkedSubjectMismatchCandidate(
  bookings: BookingRequest[],
  lesson: LessonBookingReference,
): PrelinkedSubjectMismatchCandidate | null {
  if (!structurallyValidPrelinkedBookings(bookings, lesson, 'approval')) return null
  const sorted = [...bookings].sort((left, right) => timeToMinutes(left.requestedStart) - timeToMinutes(right.requestedStart))
  const last = sorted[sorted.length - 1]
  return {
    bookingIds: sorted.map((booking) => booking.id),
    bookingSubjectId: sorted[0].subjectId || '',
    bookingSubjectName: sorted[0].subjectName,
    bookingStart: sorted[0].requestedStart,
    bookingEnd: last.requestedEnd || '',
    totalMinutes: totalBookingMinutes(sorted),
  }
}

export function validatePrelinkedSubjectMismatchForApproval(
  bookings: BookingRequest[],
  lesson: LessonBookingReference,
  draft: BookingSubjectReconciliationDraft | null | undefined,
): boolean {
  if (!draft || draft.kind !== 'prelinked_subject_mismatch' || draft.confirmed !== true) return false
  const reason = draft.reason.trim()
  if (reason.length < 12 || reason.length > 500) return false
  if (!draft.settlementSubjectId || !draft.settlementSubjectName.trim()) return false
  if (draft.reportedSubjectId !== (lesson.subjectId || '')) return false

  const candidate = getPrelinkedSubjectMismatchCandidate(bookings, lesson)
  if (!candidate) return false
  if (!sameBookingIdSet(candidate.bookingIds, draft.bookingIds)) return false
  if (candidate.bookingSubjectId !== draft.bookingSubjectId) return false

  // The teacher-reported lesson subject is the only canonical settlement
  // target. The exception repairs the old booking link; it never grants a
  // browser operator permission to choose an unrelated third package.
  return draft.settlementSubjectId === (lesson.subjectId || '')
    && candidate.bookingSubjectId !== (lesson.subjectId || '')
}

export function validateExplicitLessonBookings(
  bookings: BookingRequest[],
  lesson: LessonBookingReference,
): boolean {
  if (bookings.length === 0) return false
  if (!bookings.every((booking) => sameLessonIdentity(booking, lesson))) return false

  const lessonMinutes = Number(lesson.minutes)
  if (lessonMinutes <= 0) return true
  if (totalBookingMinutes(bookings) !== lessonMinutes) return false

  const contiguous = selectUniqueContiguousBookingSet(bookings, lessonMinutes)
  if (contiguous.length !== bookings.length) return false
  const selectedIds = new Set(contiguous.map((booking) => booking.id))
  return bookings.every((booking) => selectedIds.has(booking.id))
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
    !isActiveAttendanceBooking(explicit)
    || !sameLessonIdentity(explicit, lesson)
    || !hasValidAttendanceSlot(explicit)
  ) return []

  const eligible = candidates.filter((booking) => (
    isActiveAttendanceBooking(booking)
    && sameLessonIdentity(booking, lesson)
    && (!booking.lessonId || booking.lessonId === lesson.id)
    && hasValidAttendanceSlot(booking)
  ))
  if (!eligible.some((booking) => booking.id === explicit.id)) return []

  // Ask for the whole uninterrupted block rather than only enough adjacent
  // rows: otherwise a 50-minute lesson inside a longer block would be guessed.
  const contiguous = selectUniqueContiguousBookingSet(eligible, lessonMinutes)
  if (
    contiguous.length < 2
    || contiguous.length !== eligible.length
    || !contiguous.some((booking) => booking.id === explicit.id)
  ) return []

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
    isActiveAttendanceBooking(booking)
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
  const activeSameIdentity = matches.filter((booking) => (
    isActiveAttendanceBooking(booking)
    && sameLessonIdentityIgnoringSubject(booking, lesson)
    && (!booking.lessonId || booking.lessonId === lesson.id)
  ))
  const active = activeSameIdentity.filter((booking) => sameLessonIdentity(booking, lesson))
  if (active.length === 0) {
    // A concrete booking for the same pupil, tutor and day exists, but it is
    // explicitly tied to a different subject. Returning [] here would let an
    // approval be treated as an unbooked fixed lesson and charge a package that
    // was never selected for this booking.
    if (activeSameIdentity.some((booking) => (
      Boolean(lesson.subjectId)
      && Boolean(booking.subjectId)
      && booking.subjectId !== lesson.subjectId
    ))) throw new Error('BOOKING_SUBJECT_MISMATCH')
    return []
  }

  // An excused absence is saved as zero minutes while its arranged slot still
  // has its normal 25/50-minute duration. For legacy lessons that do not keep
  // a booking ID, join only when exactly one safe candidate remains.
  if (Number(lesson.minutes) === 0 && lesson.isZeroMinuteExcusedAbsence) {
    if (active.length === 1) return active
    throw new Error('BOOKING_MATCH_AMBIGUOUS')
  }

  const contiguous = selectUniqueContiguousBookingSet(active, Number(lesson.minutes))
  if (contiguous.length > 0 && contiguous.length === active.length) return contiguous

  throw new Error('BOOKING_MATCH_AMBIGUOUS')
}

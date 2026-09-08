import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { BookingRequest, Teacher } from '@/types'
import { checkBookingTimeRangeConsistency } from '@/lib/bookingTime'
import { getBookingPoints } from '@/lib/points'
import {
  assertAutomaticReconciliationRollbackAllowed,
  type BookingSubjectReconciliationDraft,
  type LessonBookingReference,
  type PrelinkedSubjectMismatchCandidate,
  getPrelinkedSubjectMismatchCandidate,
  isActiveAttendanceBooking,
  lessonReferencedBookingIds,
  recoverLegacySingleBookingReference,
  selectLegacyExcusedAbsenceBookingByScheduleCheck,
  selectLessonBookingMatches,
  validateExplicitLessonBookings,
  validatePrelinkedSubjectMismatchForApproval,
} from '@/lib/bookingLogic'

export { selectLessonBookingMatches } from '@/lib/bookingLogic'

/**
 * Số phút mà một ca đặt lịch ĐANG THỰC SỰ giữ của học viên.
 *
 * QUAN TRỌNG: ca đã 'released'/'rejected' thì hold đã được trả lại trước đó rồi.
 * Nếu vẫn trả về số phút, luồng duyệt buổi dạy sẽ trừ hold LẦN THỨ HAI và ăn nhầm
 * vào phần đang giữ của các ca khác. (resolveLessonBooking có thể khớp trúng ca đã
 * huỷ vì nó tìm theo học viên + gia sư + ngày.)
 */
export function bookingHoldPoints(
  booking: BookingRequest | null | undefined,
  teacher?: Partial<Teacher> | null,
): number {
  if (!booking) return 0
  const isHolding = booking.status === 'confirmed' || booking.status === 'pending'
  if (!isHolding) return 0
  return getBookingPoints(booking, teacher)
}

/**
 * Tên cũ được giữ lại để các màn hình chưa đổi tên field vẫn tương thích.
 * Giá trị trả về là KIM CƯƠNG đang giữ, không phải thời lượng của ca học.
 */
export const bookingHoldMinutes = bookingHoldPoints

/**
 * Không cho duyệt/tính lương một booking có khoảng giờ đã chứng minh là khác
 * với thời lượng được lưu. Bản ghi legacy thiếu giờ kết thúc được giữ tương
 * thích vì không thể kết luận chính xác là sai.
 */
export function assertBookingTimeRangeIntegrity(bookings: BookingRequest[]): void {
  for (const booking of bookings) {
    if (checkBookingTimeRangeConsistency(booking).status === 'mismatch') {
      throw new Error('BOOKING_TIME_RANGE_INVALID')
    }
  }
}

/**
 * The resolver reads booking candidates before an approval transaction. Re-read
 * rows must still be active and either unclaimed or claimed by this exact
 * lesson; otherwise a concurrent operation could charge funds without closing
 * the intended booking.
 */
export function assertBookingsAvailableForApproval(bookings: BookingRequest[], lessonId: string): void {
  for (const booking of bookings) {
    if (
      !isActiveAttendanceBooking(booking)
      || (booking.lessonId && booking.lessonId !== lessonId)
    ) throw new Error('BOOKING_STATE_CHANGED')
  }
}

/**
 * Re-check the identity and topology inside the approval transaction. The
 * resolver runs before the transaction, so a booking edited concurrently must
 * never be used to deduct a different course package.
 */
export function assertBookingsMatchLessonForApproval(
  bookings: BookingRequest[],
  lesson: LessonBookingReference,
  subjectMismatchReconciliation?: BookingSubjectReconciliationDraft | null,
): void {
  if (bookings.length === 0) return
  if (!bookings.every(isActiveAttendanceBooking)) throw new Error('BOOKING_STATE_CHANGED')

  if (subjectMismatchReconciliation) {
    if (!validatePrelinkedSubjectMismatchForApproval(bookings, lesson, subjectMismatchReconciliation)) {
      throw new Error('BOOKING_RECONCILIATION_INVALID')
    }
    return
  }

  const hasExplicitSubjectMismatch = bookings.some((booking) => (
    booking.studentId === lesson.studentId
    && booking.teacherId === lesson.teacherId
    && booking.requestedDate === lesson.date
    && Boolean(lesson.subjectId)
    && Boolean(booking.subjectId)
    && booking.subjectId !== lesson.subjectId
  ))
  if (hasExplicitSubjectMismatch) throw new Error('BOOKING_SUBJECT_MISMATCH')
  if (!validateExplicitLessonBookings(bookings, lesson)) throw new Error('BOOKING_STATE_CHANGED')
}

export type ResolveLessonBookingsOptions = {
  subjectMismatchReconciliation?: BookingSubjectReconciliationDraft | null
  purpose?: 'approval' | 'rollback'
}

export async function resolvePrelinkedSubjectMismatchCandidate(
  lesson: LessonBookingReference,
): Promise<PrelinkedSubjectMismatchCandidate | null> {
  const bookingIds = lessonReferencedBookingIds(lesson)
  if (bookingIds.length === 0) return null
  const bookingSnaps = await Promise.all(
    bookingIds.map((bookingId) => getDoc(doc(db, 'bookingRequests', bookingId))),
  )
  if (bookingSnaps.some((snapshot) => !snapshot.exists())) return null
  const bookings = bookingSnaps.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() } as BookingRequest))
  const candidate = getPrelinkedSubjectMismatchCandidate(bookings, lesson)
  if (!candidate) return null
  assertBookingTimeRangeIntegrity(bookings)
  return candidate
}

export async function resolveLessonBookings(
  lesson: LessonBookingReference,
  options: ResolveLessonBookingsOptions = {},
): Promise<BookingRequest[]> {
  if (options.purpose === 'rollback') assertAutomaticReconciliationRollbackAllowed(lesson)
  const bookingIds = options.subjectMismatchReconciliation
    ? [...options.subjectMismatchReconciliation.bookingIds]
    : lessonReferencedBookingIds(lesson)

  if (bookingIds.length > 0) {
    const bookingSnaps = await Promise.all(
      bookingIds.map((bookingId) => getDoc(doc(db, 'bookingRequests', bookingId))),
    )
    const resolved = bookingSnaps
      .filter((snap) => snap.exists())
      .map((snap) => ({ id: snap.id, ...snap.data() } as BookingRequest))
    if (resolved.length !== bookingIds.length) throw new Error('BOOKING_REFERENCE_INVALID')

    if (options.subjectMismatchReconciliation) {
      // The draft may only repeat IDs already owned by the lesson. Never let a
      // browser-supplied reconciliation replace or expand that authoritative
      // set, even during this preflight; the transaction performs the same
      // validation again against a fresh lesson snapshot.
      if (!validatePrelinkedSubjectMismatchForApproval(resolved, lesson, options.subjectMismatchReconciliation)) {
        throw new Error('BOOKING_RECONCILIATION_INVALID')
      }
      assertBookingTimeRangeIntegrity(resolved)
      return resolved
    }

    if (!validateExplicitLessonBookings(resolved, lesson)) {
      const hasExplicitSubjectMismatch = resolved.some((booking) => (
        booking.studentId === lesson.studentId
        && booking.teacherId === lesson.teacherId
        && booking.requestedDate === lesson.date
        && Boolean(lesson.subjectId)
        && Boolean(booking.subjectId)
        && booking.subjectId !== lesson.subjectId
      ))
      if (hasExplicitSubjectMismatch) throw new Error('BOOKING_SUBJECT_MISMATCH')
      // Old attendance records could retain only the first 25-minute booking
      // ID after a teacher reported a merged 50/75/100-minute lesson. Recover
      // only a provably complete contiguous set; all ambiguous cases fail closed.
      if (resolved.length === 1 && Number(lesson.minutes) > 0) {
        const candidates = await fetchSameDayLessonBookingCandidates(lesson)
        const recovered = recoverLegacySingleBookingReference(candidates, resolved, lesson)
        if (recovered.length > 0) return recovered
      }
      throw new Error('BOOKING_REFERENCE_INVALID')
    }
    return resolved
  }

  const matches = await fetchSameDayLessonBookingCandidates(lesson)
  if (matches.length === 0) return []

  const anchoredExcusedAbsence = selectLegacyExcusedAbsenceBookingByScheduleCheck(matches, lesson)
  if (anchoredExcusedAbsence.length > 0) return anchoredExcusedAbsence

  return selectLessonBookingMatches(matches, lesson)
}

async function fetchSameDayLessonBookingCandidates(lesson: LessonBookingReference): Promise<BookingRequest[]> {
  const q = query(
    collection(db, 'bookingRequests'),
    where('studentId', '==', lesson.studentId),
    where('teacherId', '==', lesson.teacherId),
    where('requestedDate', '==', lesson.date),
  )
  const snap = await getDocs(q)
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as BookingRequest))
}

export async function resolveLessonBooking(lesson: LessonBookingReference): Promise<BookingRequest | null> {
  return (await resolveLessonBookings(lesson))[0] || null
}

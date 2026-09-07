import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { BookingRequest, Teacher } from '@/types'
import { checkBookingTimeRangeConsistency } from '@/lib/bookingTime'
import { getBookingPoints } from '@/lib/points'
import {
  LessonBookingReference,
  recoverLegacySingleBookingReference,
  selectLegacyExcusedAbsenceBookingByScheduleCheck,
  selectLessonBookingMatches,
  validateExplicitLessonBookings,
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
      (booking.status !== 'pending' && booking.status !== 'confirmed')
      || (booking.lessonId && booking.lessonId !== lessonId)
    ) throw new Error('BOOKING_STATE_CHANGED')
  }
}

export async function resolveLessonBookings(lesson: LessonBookingReference): Promise<BookingRequest[]> {
  const bookingIds = Array.from(new Set([
    ...(lesson.bookingRequestIds || []),
    ...(lesson.scheduleCheck?.bookingIds || []),
    lesson.bookingRequestId,
    lesson.scheduleCheck?.bookingId,
  ].filter((id): id is string => Boolean(id))))

  if (bookingIds.length > 0) {
    const bookingSnaps = await Promise.all(
      bookingIds.map((bookingId) => getDoc(doc(db, 'bookingRequests', bookingId))),
    )
    const resolved = bookingSnaps
      .filter((snap) => snap.exists())
      .map((snap) => ({ id: snap.id, ...snap.data() } as BookingRequest))
    if (resolved.length !== bookingIds.length) throw new Error('BOOKING_REFERENCE_INVALID')
    if (!validateExplicitLessonBookings(resolved, lesson)) {
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

import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { BookingRequest, Teacher } from '@/types'
import { getBookingPoints } from '@/lib/points'
import {
  LessonBookingReference,
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
    if (!validateExplicitLessonBookings(resolved, lesson)) throw new Error('BOOKING_REFERENCE_INVALID')
    return resolved
  }

  const q = query(
    collection(db, 'bookingRequests'),
    where('studentId', '==', lesson.studentId),
    where('teacherId', '==', lesson.teacherId),
    where('requestedDate', '==', lesson.date),
  )
  
  const snap = await getDocs(q)
  if (snap.empty) return []

  const matches = snap.docs.map(d => ({ id: d.id, ...d.data() } as BookingRequest))
  return selectLessonBookingMatches(matches, lesson)
}

export async function resolveLessonBooking(lesson: LessonBookingReference): Promise<BookingRequest | null> {
  return (await resolveLessonBookings(lesson))[0] || null
}

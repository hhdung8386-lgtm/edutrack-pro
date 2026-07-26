import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { BookingRequest, Teacher } from '@/types'
import { getBookingPoints } from '@/lib/points'

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

export async function resolveLessonBooking(lesson: {
  id: string
  bookingRequestId?: string
  studentId: string
  teacherId: string
  date: string
  minutes: number
  subjectId: string
}): Promise<BookingRequest | null> {
  if (lesson.bookingRequestId) {
    const bookingRef = doc(db, 'bookingRequests', lesson.bookingRequestId)
    const bookingSnap = await getDoc(bookingRef)
    if (bookingSnap.exists()) {
      return { id: bookingSnap.id, ...bookingSnap.data() } as BookingRequest
    }
  }

  const q = query(
    collection(db, 'bookingRequests'),
    where('studentId', '==', lesson.studentId),
    where('teacherId', '==', lesson.teacherId),
    where('requestedDate', '==', lesson.date),
  )
  
  const snap = await getDocs(q)
  if (snap.empty) return null

  const matches = snap.docs.map(d => ({ id: d.id, ...d.data() } as BookingRequest))
  const exactMatch = matches.find(m => m.requestedMinutes === lesson.minutes && (m.status === 'confirmed' || m.status === 'pending'))
  if (exactMatch) return exactMatch

  const statusMatch = matches.find(m => m.status === 'confirmed' || m.status === 'pending')
  if (statusMatch) return statusMatch

  return matches[0] || null
}

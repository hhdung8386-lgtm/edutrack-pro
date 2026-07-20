import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { BookingRequest } from '@/types'

export function bookingHoldMinutes(booking: BookingRequest | null | undefined): number {
  if (!booking) return 0
  return Number(booking.requestedMinutes) || 0
}

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

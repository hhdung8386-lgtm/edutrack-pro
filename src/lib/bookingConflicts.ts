import { collection, getDocsFromServer, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { BookingRequest } from '@/types'
import {
  bookingIntervalEndInMinutes,
  bookingIntervalStartInMinutes,
  bookingIntervalsOverlap,
} from '@/lib/bookingTime'

export { bookingIntervalsOverlap, bookingTimeToMinutes } from '@/lib/bookingTime'

export type BookingConflictReason = 'teacher' | 'student'

export type BookingCandidate = Pick<
  BookingRequest,
  | 'teacherId'
  | 'studentId'
  | 'requestedDate'
  | 'requestedStart'
  | 'requestedEnd'
> & Partial<Pick<BookingRequest, 'id' | 'teacherName' | 'studentName' | 'studentCode'>> & {
  requestedMinutes?: number
}

export interface BookingConflict {
  candidate: BookingCandidate
  existing: BookingRequest
  reasons: BookingConflictReason[]
}

export interface BookingConflictPair {
  first: BookingRequest
  second: BookingRequest
  reasons: BookingConflictReason[]
}

const ACTIVE_STATUSES = new Set<BookingRequest['status']>(['pending', 'confirmed'])

export function isActiveBooking(booking: Pick<BookingRequest, 'status' | 'teacherResponse'>) {
  return ACTIVE_STATUSES.has(booking.status)
    && !(booking.status === 'pending' && booking.teacherResponse === 'declined')
}

function conflictReasons(candidate: BookingCandidate, existing: BookingCandidate) {
  const reasons: BookingConflictReason[] = []
  if (candidate.teacherId && candidate.teacherId === existing.teacherId) reasons.push('teacher')
  if (candidate.studentId && candidate.studentId === existing.studentId) reasons.push('student')
  return reasons
}

export function findBookingConflicts(
  candidates: BookingCandidate[],
  existingBookings: BookingRequest[],
  options: { ignoreBookingIds?: Iterable<string>; includePending?: boolean } = {},
) {
  const ignored = new Set(options.ignoreBookingIds || [])
  const includePending = options.includePending !== false
  const activeExisting = existingBookings.filter((booking) => {
    if (ignored.has(booking.id) || !isActiveBooking(booking)) return false
    if (!includePending && booking.status === 'pending' && booking.teacherResponse !== 'accepted') return false
    return true
  })

  const conflicts: BookingConflict[] = []
  const acceptedCandidates: BookingCandidate[] = []

  for (const candidate of candidates) {
    for (const existing of activeExisting) {
      const reasons = conflictReasons(candidate, existing)
      if (reasons.length > 0 && bookingIntervalsOverlap(candidate, existing)) {
        conflicts.push({ candidate, existing, reasons })
      }
    }

    // Cũng chặn hai ca trùng ngay trong cùng một thao tác đặt hàng loạt/lịch lặp.
    for (const previous of acceptedCandidates) {
      const reasons = conflictReasons(candidate, previous)
      if (reasons.length > 0 && bookingIntervalsOverlap(candidate, previous)) {
        conflicts.push({
          candidate,
          existing: {
            ...previous,
            id: previous.id || '__new_booking__',
            status: 'pending',
          } as BookingRequest,
          reasons,
        })
      }
    }
    acceptedCandidates.push(candidate)
  }

  return conflicts
}

export async function loadRelevantActiveBookings(candidates: BookingCandidate[]) {
  const teacherIds = Array.from(new Set(candidates.map((item) => item.teacherId).filter(Boolean)))
  const studentIds = Array.from(new Set(candidates.map((item) => item.studentId).filter(Boolean)))
  const snapshots = await Promise.all([
    // Lịch là dữ liệu giao dịch: luôn đọc trực tiếp từ server. Dùng getDocs() ở đây có thể
    // trả về cache cũ trong lúc hai chuỗi lịch vừa được tạo sát nhau, khiến ca thứ hai
    // không nhìn thấy ca thứ nhất và cùng ghi vào một khung giờ.
    ...teacherIds.map((teacherId) => getDocsFromServer(query(collection(db, 'bookingRequests'), where('teacherId', '==', teacherId)))),
    ...studentIds.map((studentId) => getDocsFromServer(query(collection(db, 'bookingRequests'), where('studentId', '==', studentId)))),
  ])

  const byId = new Map<string, BookingRequest>()
  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((item) => {
      const booking = { id: item.id, ...item.data() } as BookingRequest
      if (isActiveBooking(booking)) byId.set(booking.id, booking)
    })
  })
  return Array.from(byId.values())
}

export async function checkBookingCandidates(
  candidates: BookingCandidate[],
  options: { ignoreBookingIds?: Iterable<string>; includePending?: boolean } = {},
) {
  if (candidates.length === 0) return []
  const existing = await loadRelevantActiveBookings(candidates)
  return findBookingConflicts(candidates, existing, options)
}

export function findExistingBookingConflictPairs(bookings: BookingRequest[]) {
  const active = bookings.filter((booking) => isActiveBooking(booking) && Boolean(booking.requestedDate))
  const groups = new Map<string, BookingRequest[]>()

  for (const booking of active) {
    const keys = [
      booking.teacherId ? `teacher:${booking.teacherId}` : '',
      booking.studentId ? `student:${booking.studentId}` : '',
    ].filter(Boolean)
    keys.forEach((key) => groups.set(key, [...(groups.get(key) || []), booking]))
  }

  const pairMap = new Map<string, BookingConflictPair>()
  groups.forEach((items, key) => {
    const reason: BookingConflictReason = key.startsWith('teacher:') ? 'teacher' : 'student'
    const sorted = [...items].sort((a, b) => bookingIntervalStartInMinutes(a) - bookingIntervalStartInMinutes(b))
    for (let left = 0; left < sorted.length; left += 1) {
      const leftEnd = bookingIntervalEndInMinutes(sorted[left])
      for (let right = left + 1; right < sorted.length; right += 1) {
        if (bookingIntervalStartInMinutes(sorted[right]) >= leftEnd) break
        if (!bookingIntervalsOverlap(sorted[left], sorted[right])) continue
        const ids = [sorted[left].id, sorted[right].id].sort()
        const pairKey = `${ids[0]}::${ids[1]}`
        const current = pairMap.get(pairKey)
        if (current) {
          if (!current.reasons.includes(reason)) current.reasons.push(reason)
        } else {
          pairMap.set(pairKey, { first: sorted[left], second: sorted[right], reasons: [reason] })
        }
      }
    }
  })

  return Array.from(pairMap.values()).sort((a, b) => {
    const firstKey = `${a.first.requestedDate || ''} ${a.first.requestedStart || ''}`
    const secondKey = `${b.first.requestedDate || ''} ${b.first.requestedStart || ''}`
    return firstKey.localeCompare(secondKey)
  })
}

export function formatBookingDate(dateISO?: string) {
  if (!dateISO) return 'ngày chưa xác định'
  const [year, month, day] = dateISO.split('-')
  return year && month && day ? `${day}/${month}/${year}` : dateISO
}

export function bookingConflictMessage(conflict: BookingConflict, language: 'vi' | 'en' = 'vi') {
  const { candidate, existing, reasons } = conflict
  if (language === 'en') {
    const owner = reasons.includes('teacher')
      ? `Teacher ${existing.teacherName || existing.teacherCode || ''}`
      : `Student ${existing.studentName || existing.studentCode || ''}`
    return `${owner} already has a class on ${existing.requestedDate || candidate.requestedDate || ''} at ${existing.requestedStart}-${existing.requestedEnd}. Please choose another time.`
  }

  const time = `${existing.requestedStart}-${existing.requestedEnd}`
  const date = formatBookingDate(existing.requestedDate || candidate.requestedDate)
  if (reasons.includes('teacher') && reasons.includes('student')) {
    return `Không thể đặt trùng: ${existing.teacherName || 'giáo viên'} và ${existing.studentName || 'học viên'} đã có đúng ca ${time}, ${date}.`
  }
  if (reasons.includes('teacher')) {
    return `Không thể đặt trùng: giáo viên ${existing.teacherName || existing.teacherCode || ''} đã có lớp với ${existing.studentName || existing.studentCode || 'học viên khác'} lúc ${time}, ${date}.`
  }
  return `Không thể đặt trùng: học viên ${existing.studentName || existing.studentCode || ''} đã có lớp với ${existing.teacherName || existing.teacherCode || 'giáo viên khác'} lúc ${time}, ${date}.`
}

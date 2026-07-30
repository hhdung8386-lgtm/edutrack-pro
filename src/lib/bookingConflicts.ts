import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { BookingRequest } from '@/types'

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

export function bookingTimeToMinutes(value?: string) {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return Number.NaN
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.NaN
  return hours * 60 + minutes
}

function bookingEndInMinutes(booking: BookingCandidate) {
  const explicitEnd = bookingTimeToMinutes(booking.requestedEnd)
  if (Number.isFinite(explicitEnd)) return explicitEnd
  const start = bookingTimeToMinutes(booking.requestedStart)
  return start + Number(booking.requestedMinutes || 0)
}

export function bookingIntervalsOverlap(first: BookingCandidate, second: BookingCandidate) {
  if (!first.requestedDate || first.requestedDate !== second.requestedDate) return false
  const firstStart = bookingTimeToMinutes(first.requestedStart)
  const firstEnd = bookingEndInMinutes(first)
  const secondStart = bookingTimeToMinutes(second.requestedStart)
  const secondEnd = bookingEndInMinutes(second)
  if (![firstStart, firstEnd, secondStart, secondEnd].every(Number.isFinite)) return false

  // Khoảng mở: 08:00-08:25 và 08:25-08:50 được phép đặt liền nhau.
  return firstStart < secondEnd && secondStart < firstEnd
}

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
    ...teacherIds.map((teacherId) => getDocs(query(collection(db, 'bookingRequests'), where('teacherId', '==', teacherId)))),
    ...studentIds.map((studentId) => getDocs(query(collection(db, 'bookingRequests'), where('studentId', '==', studentId)))),
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
      booking.teacherId ? `teacher:${booking.teacherId}:${booking.requestedDate}` : '',
      booking.studentId ? `student:${booking.studentId}:${booking.requestedDate}` : '',
    ].filter(Boolean)
    keys.forEach((key) => groups.set(key, [...(groups.get(key) || []), booking]))
  }

  const pairMap = new Map<string, BookingConflictPair>()
  groups.forEach((items, key) => {
    const reason: BookingConflictReason = key.startsWith('teacher:') ? 'teacher' : 'student'
    const sorted = [...items].sort((a, b) => bookingTimeToMinutes(a.requestedStart) - bookingTimeToMinutes(b.requestedStart))
    for (let left = 0; left < sorted.length; left += 1) {
      const leftEnd = bookingEndInMinutes(sorted[left])
      for (let right = left + 1; right < sorted.length; right += 1) {
        if (bookingTimeToMinutes(sorted[right].requestedStart) >= leftEnd) break
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
    return `${owner} already has a class on ${candidate.requestedDate || ''} at ${existing.requestedStart}-${existing.requestedEnd}. Please choose another time.`
  }

  const time = `${existing.requestedStart}-${existing.requestedEnd}`
  const date = formatBookingDate(candidate.requestedDate)
  if (reasons.includes('teacher') && reasons.includes('student')) {
    return `Không thể đặt trùng: ${existing.teacherName || 'giáo viên'} và ${existing.studentName || 'học viên'} đã có đúng ca ${time}, ${date}.`
  }
  if (reasons.includes('teacher')) {
    return `Không thể đặt trùng: giáo viên ${existing.teacherName || existing.teacherCode || ''} đã có lớp với ${existing.studentName || existing.studentCode || 'học viên khác'} lúc ${time}, ${date}.`
  }
  return `Không thể đặt trùng: học viên ${existing.studentName || existing.studentCode || ''} đã có lớp với ${existing.teacherName || existing.teacherCode || 'giáo viên khác'} lúc ${time}, ${date}.`
}

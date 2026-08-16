import { BookingRequest, Student } from '@/types'
import { getBookingPoints } from '@/lib/points'
import {
  getStudentMinuteSummaryCore,
  getStudentSubjectMinuteFunds,
  resolveStudentSubjectFund,
} from '@/lib/studentQuotaCore'

export function getStudentPackageMinuteSummary(student: Student) {
  return getStudentMinuteSummaryCore(student)
}

export function getHeldBookingMinutes(bookings: BookingRequest[], subjectId: string): number {
  return bookings
    .filter(b => b.subjectId === subjectId && !b.lessonId && (b.status === 'pending' || b.status === 'confirmed'))
    .reduce((sum, b) => sum + getBookingPoints(b), 0)
}

export function getStudentSubjectAvailableMinutes(
  student: Student,
  bookings: BookingRequest[],
  subjectId?: string,
  ignoreBookingIds: string[] = [],
) {
  const fund = resolveStudentSubjectFund(student, subjectId)
  if (!fund) return { fund: undefined, remainingMinutes: 0, heldMinutes: 0, availableMinutes: 0 }
  const ignored = new Set(ignoreBookingIds)
  const heldMinutes = bookings
    .filter((booking) => {
      if (ignored.has(booking.id) || booking.lessonId || !['pending', 'confirmed'].includes(booking.status)) return false
      const bookingFund = resolveStudentSubjectFund(student, booking.subjectId)
      return bookingFund?.key === fund.key
    })
    .reduce((sum, booking) => sum + getBookingPoints(booking), 0)

  return {
    fund,
    remainingMinutes: fund.remainingMinutes,
    heldMinutes,
    availableMinutes: Math.max(0, fund.remainingMinutes - heldMinutes),
  }
}

export type StudentQuotaBreakdown = {
  key: string
  subjectId: string
  subjectName: string
  remainingMinutes: number
  heldMinutes: number
  overBy: number
  bookings: BookingRequest[]
}

export function getStudentBookingQuotaBreakdown(student: Student, bookings: BookingRequest[]) {
  const activeBookings = bookings.filter(
    (booking) => !booking.lessonId && (booking.status === 'pending' || booking.status === 'confirmed'),
  )
  const breakdown = new Map<string, StudentQuotaBreakdown>()
  getStudentSubjectMinuteFunds(student).forEach((fund) => {
    breakdown.set(fund.key, {
      key: fund.key,
      subjectId: fund.subjectId,
      subjectName: fund.subjectName,
      remainingMinutes: fund.remainingMinutes,
      heldMinutes: 0,
      overBy: 0,
      bookings: [],
    })
  })

  activeBookings.forEach((booking) => {
    const fund = resolveStudentSubjectFund(student, booking.subjectId)
    const key = fund?.key || `__unmatched__:${booking.subjectId || 'missing'}`
    const item = breakdown.get(key) || {
      key,
      subjectId: String(booking.subjectId || ''),
      subjectName: String(booking.subjectName || 'Không xác định môn'),
      remainingMinutes: 0,
      heldMinutes: 0,
      overBy: 0,
      bookings: [],
    }
    item.heldMinutes += getBookingPoints(booking)
    item.bookings.push(booking)
    breakdown.set(key, item)
  })

  const subjects = Array.from(breakdown.values()).map((item) => ({
    ...item,
    overBy: Math.max(0, item.heldMinutes - item.remainingMinutes),
  }))
  return {
    subjects,
    remainingMinutes: subjects.reduce((sum, item) => sum + item.remainingMinutes, 0),
    actualHeld: subjects.reduce((sum, item) => sum + item.heldMinutes, 0),
    overByActual: subjects.reduce((sum, item) => sum + item.overBy, 0),
  }
}

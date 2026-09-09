import { BookingRequest, Student } from '@/types'
import { getBookingPoints } from '@/lib/points'
import {
  getStudentMinuteSummaryCore,
  getStudentSubjectMinuteFunds,
  resolveStudentSubjectFund,
} from '@/lib/studentQuotaCore'
import { isBookingFinancialHold, isBookingHoldingStudentFund, isBookingPendingRebookFundHold } from '@/lib/bookingLogic'

export function getStudentPackageMinuteSummary(student: Student) {
  return getStudentMinuteSummaryCore(student)
}

/**
 * Keep one financial-ledger definition for all balance views. A released
 * pending-rebook row has no calendar slot, so its preserved amount lives in
 * `rebookHoldPoints` rather than the original booking price.
 */
export function getBookingFinancialHoldPoints(booking: BookingRequest): number {
  if (isBookingHoldingStudentFund(booking)) return getBookingPoints(booking)
  return isBookingPendingRebookFundHold(booking) ? Number(booking.rebookHoldPoints) : 0
}

export function getHeldBookingMinutes(bookings: BookingRequest[], subjectId: string): number {
  return bookings
    .filter((booking) => booking.subjectId === subjectId && isBookingFinancialHold(booking))
    .reduce((sum, b) => sum + getBookingFinancialHoldPoints(b), 0)
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
      if (ignored.has(booking.id) || !isBookingFinancialHold(booking)) return false
      const bookingFund = resolveStudentSubjectFund(student, booking.subjectId)
      return bookingFund?.key === fund.key
    })
    .reduce((sum, booking) => sum + getBookingFinancialHoldPoints(booking), 0)

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
  const activeBookings = bookings.filter(isBookingFinancialHold)
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
    item.heldMinutes += getBookingFinancialHoldPoints(booking)
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

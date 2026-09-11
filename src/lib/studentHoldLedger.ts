import type { BookingRequest } from '../types/index.ts'
import { isBookingHoldingStudentFund, isBookingPendingRebookFundHold } from './bookingLogic.ts'
import { getBookingPoints } from './points.ts'

/**
 * Mọi dòng booking đang giữ kim cương của học viên, chia theo nơi giáo vụ xử lý:
 * - future: ca từ hôm nay, chưa điểm danh -> hủy ở Lịch đã đặt
 * - overdue: ca đã qua ngày, chưa điểm danh -> chẩn đoán rồi nhả/gắn buổi
 * - linked: ca đã gắn buổi điểm danh -> duyệt, gỡ liên kết hoặc đóng ca đã duyệt
 * - pending_rebook: học viên tự hủy, kim cương vẫn giữ chờ đặt lại
 * - undated: ca đang giữ nhưng thiếu ngày học (dữ liệu cũ)
 *
 * Tổng các nhóm phải bằng đúng số "đã giữ · sổ booking" ở danh sách học viên
 * (getStudentBookingQuotaBreakdown), để không còn kim cương bị giữ ở nơi không nhìn thấy.
 */
export type StudentHoldKind = 'future' | 'overdue' | 'linked' | 'pending_rebook' | 'undated'

export const STUDENT_HOLD_KINDS: StudentHoldKind[] = ['future', 'overdue', 'linked', 'pending_rebook', 'undated']

export interface StudentHoldItem {
  booking: BookingRequest
  kind: StudentHoldKind
  points: number
}

export interface StudentHoldLedger {
  items: StudentHoldItem[]
  byKind: Record<StudentHoldKind, StudentHoldItem[]>
  pointsByKind: Record<StudentHoldKind, number>
  totalPoints: number
}

export function classifyStudentHold(booking: BookingRequest, todayISO: string): StudentHoldKind | null {
  if (isBookingHoldingStudentFund(booking)) {
    if (booking.lessonId) return 'linked'
    if (!booking.requestedDate) return 'undated'
    return booking.requestedDate < todayISO ? 'overdue' : 'future'
  }
  return isBookingPendingRebookFundHold(booking) ? 'pending_rebook' : null
}

/** Cùng định nghĩa với getBookingFinancialHoldPoints trong studentMinutes. */
export function studentHoldPoints(booking: BookingRequest): number {
  if (isBookingHoldingStudentFund(booking)) return getBookingPoints(booking)
  return isBookingPendingRebookFundHold(booking) ? Number(booking.rebookHoldPoints) : 0
}

function emptyByKind<T>(factory: () => T): Record<StudentHoldKind, T> {
  return {
    future: factory(),
    overdue: factory(),
    linked: factory(),
    pending_rebook: factory(),
    undated: factory(),
  }
}

export function buildStudentHoldLedger(bookings: BookingRequest[], todayISO: string): StudentHoldLedger {
  const items = bookings
    .flatMap((booking) => {
      const kind = classifyStudentHold(booking, todayISO)
      return kind ? [{ booking, kind, points: studentHoldPoints(booking) }] : []
    })
    .sort((left, right) => (left.booking.requestedDate || '').localeCompare(right.booking.requestedDate || '')
      || (left.booking.requestedStart || '').localeCompare(right.booking.requestedStart || ''))

  const byKind = emptyByKind<StudentHoldItem[]>(() => [])
  const pointsByKind = emptyByKind(() => 0)
  items.forEach((item) => {
    byKind[item.kind].push(item)
    pointsByKind[item.kind] += item.points
  })

  return {
    items,
    byKind,
    pointsByKind,
    totalPoints: items.reduce((sum, item) => sum + item.points, 0),
  }
}

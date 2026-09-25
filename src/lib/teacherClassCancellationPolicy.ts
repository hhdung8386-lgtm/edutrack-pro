export const TEACHER_CANCELLATION_NOTICE_MS = 60 * 60 * 1000
export const LATE_CANCELLATION_PENALTY_AMOUNT_VND = 50_000

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000

export interface TeacherCancellationBookingTime {
  requestedDate?: string
  requestedStart?: string
}

/** Mốc bắt đầu ca theo giờ Việt Nam (dữ liệu booking luôn lưu giờ VN). */
export function bookingStartMs(booking: TeacherCancellationBookingTime): number | null {
  const date = booking.requestedDate || ''
  const start = booking.requestedStart || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start)) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = start.split(':').map(Number)
  if (hours > 23 || minutes > 59) return null
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  return Date.UTC(year, month - 1, day, hours, minutes) - VIETNAM_OFFSET_MS
}

export function lateTeacherCancellationPenaltyApplies(
  booking: TeacherCancellationBookingTime | null | undefined,
  nowMs: number,
) {
  if (!booking) return false
  const startMs = bookingStartMs(booking)
  return startMs !== null && startMs > nowMs && startMs - nowMs < TEACHER_CANCELLATION_NOTICE_MS
}

export function lateCancellationPenaltyPayrollId(bookingId: string) {
  return `teacher-cancellation-${bookingId}`
}

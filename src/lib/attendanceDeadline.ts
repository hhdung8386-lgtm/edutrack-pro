import type { BookingRequest } from '@/types'

/**
 * Attendance can be submitted shortly after a scheduled class ends, but never
 * more than twelve hours after that end time.  Booking times are stored as
 * Vietnam-local wall-clock values, so conversion stays in one place instead
 * of being reimplemented by each attendance surface.
 */
export const ATTENDANCE_EARLIEST_SUBMISSION_DELAY_MS = 5 * 60 * 1000
export const ATTENDANCE_SUBMISSION_WINDOW_MS = 12 * 60 * 60 * 1000

export type AttendanceDeadlineState = 'invalid' | 'too_early' | 'open' | 'expired'

export type AttendanceDeadline = {
  state: AttendanceDeadlineState
  classEndMs: number | null
  earliestSubmissionMs: number | null
  deadlineMs: number | null
}

export function bookingClassEndMs(booking: Pick<BookingRequest, 'requestedDate' | 'requestedEnd'>): number | null {
  if (!booking.requestedDate || !booking.requestedEnd) return null
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(booking.requestedDate)
  const timeMatch = /^(\d{1,2}):([0-5]\d)$/.exec(booking.requestedEnd)
  if (!dateMatch || !timeMatch) return null
  const year = Number(dateMatch[1])
  const month = Number(dateMatch[2])
  const day = Number(dateMatch[3])
  const hours = Number(timeMatch[1])
  const minutes = Number(timeMatch[2])
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31 || hours < 0 || hours > 25) return null

  // Reject Date.UTC's silent normalization (e.g. 2026-02-31) so a malformed
  // legacy booking cannot move the attendance window onto another day.
  const calendarDateMs = Date.UTC(year, month - 1, day)
  const calendarDate = new Date(calendarDateMs)
  if (!Number.isFinite(calendarDateMs)
    || calendarDate.getUTCFullYear() !== year
    || calendarDate.getUTCMonth() !== month - 1
    || calendarDate.getUTCDate() !== day) return null

  // Firestore stores the schedule as Vietnam local time.  The schedule UI also
  // supports 24:xx for a cross-midnight class, which Date.UTC handles by
  // carrying into the following day.
  const localWallClockMs = Date.UTC(year, month - 1, day, hours, minutes)
  if (!Number.isFinite(localWallClockMs)) return null
  return localWallClockMs - 7 * 60 * 60 * 1000
}

export function getAttendanceDeadline(
  booking: Pick<BookingRequest, 'requestedDate' | 'requestedEnd'>,
  nowMs = Date.now(),
): AttendanceDeadline {
  const classEndMs = bookingClassEndMs(booking)
  if (classEndMs === null || !Number.isFinite(nowMs)) {
    return { state: 'invalid', classEndMs: null, earliestSubmissionMs: null, deadlineMs: null }
  }
  const earliestSubmissionMs = classEndMs + ATTENDANCE_EARLIEST_SUBMISSION_DELAY_MS
  const deadlineMs = classEndMs + ATTENDANCE_SUBMISSION_WINDOW_MS
  const state: AttendanceDeadlineState = nowMs < earliestSubmissionMs
    ? 'too_early'
    : nowMs > deadlineMs
      ? 'expired'
      : 'open'
  return { state, classEndMs, earliestSubmissionMs, deadlineMs }
}

export function canSubmitAttendance(
  booking: Pick<BookingRequest, 'requestedDate' | 'requestedEnd'>,
  nowMs = Date.now(),
): boolean {
  return getAttendanceDeadline(booking, nowMs).state === 'open'
}

export function attendanceDeadlineMessage(state: AttendanceDeadlineState, language: 'vi' | 'en' = 'vi'): string {
  if (state === 'expired') {
    return language === 'vi'
      ? 'Đã quá 12 tiếng kể từ khi kết thúc ca. Vui lòng báo giáo vụ để được hỗ trợ.'
      : 'More than 12 hours have passed since the class ended. Please contact the academic team for help.'
  }
  if (state === 'too_early') {
    return language === 'vi'
      ? 'Chưa đến thời điểm điểm danh. Vui lòng chờ ít nhất 5 phút sau khi ca kết thúc.'
      : 'Attendance is not available yet. Please wait at least 5 minutes after the class ends.'
  }
  return language === 'vi'
    ? 'Không thể xác định thời gian kết thúc ca. Vui lòng báo giáo vụ kiểm tra lịch.'
    : 'The class end time could not be verified. Please ask the academic team to check the schedule.'
}

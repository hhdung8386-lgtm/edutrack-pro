export interface BookingIntervalLike {
  requestedDate?: string
  requestedStart?: string
  requestedEnd?: string
  requestedMinutes?: number
}

const MINUTES_PER_DAY = 24 * 60
const MAX_BOOKING_MINUTES = 100
const VALID_BOOKING_MINUTES = new Set([25, 50, 75, 100])
const VIETNAM_OFFSET_MINUTES = 7 * 60

export type OnlineClassroomMeetingTimer = {
  durationSeconds: number
  elapsedSeconds: number
}

export function bookingTimeToMinutes(value?: string) {
  if (!value) return Number.NaN
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value)
  if (!match) return Number.NaN

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || hours < 0 || hours > 49) return Number.NaN
  return hours * 60 + minutes
}

function bookingDateStartInMinutes(dateISO?: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO || '')
  if (!match) return Number.NaN

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const dateMs = Date.UTC(year, month - 1, day)
  const date = new Date(dateMs)
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return Number.NaN
  }

  return dateMs / 60_000
}

export function bookingIntervalStartInMinutes(booking: BookingIntervalLike) {
  const dateStart = bookingDateStartInMinutes(booking.requestedDate)
  const start = bookingTimeToMinutes(booking.requestedStart)
  if (!Number.isFinite(dateStart) || !Number.isFinite(start)) return Number.NaN
  return dateStart + start
}

export function bookingIntervalEndInMinutes(booking: BookingIntervalLike) {
  const start = bookingIntervalStartInMinutes(booking)
  if (!Number.isFinite(start)) return Number.NaN

  // BookingRequest.requestedMinutes is validated at the write boundary and is
  // the canonical duration. Prefer it over a stale or malformed display end.
  const requestedMinutes = Number(booking.requestedMinutes)
  if (Number.isInteger(requestedMinutes) && VALID_BOOKING_MINUTES.has(requestedMinutes)) {
    return start + requestedMinutes
  }

  const explicitEnd = bookingTimeToMinutes(booking.requestedEnd)
  if (Number.isFinite(explicitEnd)) {
    const explicitStart = bookingTimeToMinutes(booking.requestedStart)
    let duration = explicitEnd - explicitStart
    if (duration < 0) duration += MINUTES_PER_DAY

    // End-only intervals are used for legacy bookings and calendar cells.
    // Reject zero-length or implausibly long values instead of allowing one
    // malformed record to block a teacher/student for a full day or longer.
    return duration > 0 && duration <= MAX_BOOKING_MINUTES
      ? start + duration
      : Number.NaN
  }

  return Number.NaN
}

export function bookingIntervalsOverlap(first: BookingIntervalLike, second: BookingIntervalLike) {
  const firstStart = bookingIntervalStartInMinutes(first)
  const firstEnd = bookingIntervalEndInMinutes(first)
  const secondStart = bookingIntervalStartInMinutes(second)
  const secondEnd = bookingIntervalEndInMinutes(second)
  if (![firstStart, firstEnd, secondStart, secondEnd].every(Number.isFinite)) return false

  // Half-open intervals allow adjacent classes, including across midnight.
  return firstStart < secondEnd && secondStart < firstEnd
}

/**
 * Đồng hồ JaaS dùng giây nhưng lịch của hệ thống lưu theo giờ Việt Nam, kể cả
 * mốc 24:xx/25:xx. Dùng cùng parser với booking để hai phía không lệch ngày.
 */
export function onlineClassroomMeetingTimer(
  booking: BookingIntervalLike,
  nowMs: number,
): OnlineClassroomMeetingTimer {
  const startMinutes = bookingIntervalStartInMinutes(booking)
  const endMinutes = bookingIntervalEndInMinutes(booking)
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
    return { durationSeconds: 0, elapsedSeconds: 0 }
  }

  const scheduledStartMs = (startMinutes - VIETNAM_OFFSET_MINUTES) * 60_000
  return {
    durationSeconds: Math.floor((endMinutes - startMinutes) * 60),
    elapsedSeconds: Math.max(0, Math.floor((nowMs - scheduledStartMs) / 1_000)),
  }
}

export function formatClassroomElapsed(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0))
  const hours = Math.floor(safeSeconds / 3_600)
  const minutes = Math.floor((safeSeconds % 3_600) / 60)
  const seconds = safeSeconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

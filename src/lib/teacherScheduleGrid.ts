import { bookingIntervalsOverlap, type BookingIntervalLike } from './bookingTime.ts'

export type TeacherScheduleBookingLike = BookingIntervalLike & {
  status?: string
  displayDate: string
  displayStart: string
  displayEnd: string
}

export function teacherScheduleCellKey(dateISO: string, start: string) {
  return `${dateISO}|${start}`
}

function timeToMinutes(time: string) {
  const [hours = '0', minutes = '0'] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}

function minutesToTime(total: number) {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/**
 * Build the calendar lookup once when bookings/week/window change.
 *
 * The old timetable searched every historical booking for every cell during
 * every render. Attendance form keystrokes update state in the page, so a
 * teacher with a long booking history could trigger hundreds of thousands of
 * interval comparisons per keypress and make the modal appear frozen.
 */
export function buildTeacherScheduleBookingIndex<T extends TeacherScheduleBookingLike>(
  bookings: readonly T[],
  dateISOs: readonly string[],
  visibleStarts: readonly string[],
) {
  const visibleDates = new Set(dateISOs)
  const byCell = new Map<string, T>()

  for (const booking of bookings) {
    if (booking.status !== 'confirmed' && booking.status !== 'pending') continue
    if (!visibleDates.has(booking.displayDate)) continue

    const bookingInterval = {
      requestedDate: booking.displayDate,
      requestedStart: booking.displayStart,
      requestedEnd: booking.displayEnd,
      requestedMinutes: booking.requestedMinutes,
    }

    for (const start of visibleStarts) {
      const key = teacherScheduleCellKey(booking.displayDate, start)
      // Match Array.find semantics from the previous implementation when
      // malformed legacy data contains more than one booking in a cell.
      if (byCell.has(key)) continue

      const cellStart = timeToMinutes(start)
      if (bookingIntervalsOverlap(bookingInterval, {
        requestedDate: booking.displayDate,
        requestedStart: start,
        requestedEnd: minutesToTime(cellStart + 30),
      })) {
        byCell.set(key, booking)
      }
    }
  }

  return byCell
}

export type ReminderSessionBooking = {
  id: string
  studentId?: string
  teacherId?: string
  subjectId?: string
  requestedDate?: string
  requestedStart?: string
  requestedEnd?: string
  requestedMinutes?: number
}

export type ReminderSession<T extends ReminderSessionBooking> = {
  bookings: T[]
  sessionStart: string
  sessionEnd: string
}

export type ReminderDay<T extends ReminderSessionBooking> = {
  bookings: T[]
  dayStart: string
  dayEnd: string
}

function timeToMinutes(value?: string): number | null {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return null
  const [hour, minute] = value.split(':').map(Number)
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 24 || minute < 0 || minute > 59) return null
  if (hour === 24 && minute !== 0) return null
  return hour * 60 + minute
}

function minutesToTime(value: number): string {
  const hour = Math.floor(value / 60)
  const minute = value % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function bookingEndMinutes(booking: ReminderSessionBooking): number | null {
  const explicitEnd = timeToMinutes(booking.requestedEnd)
  if (explicitEnd !== null) return explicitEnd

  const start = timeToMinutes(booking.requestedStart)
  const duration = Number(booking.requestedMinutes)
  return start !== null && Number.isFinite(duration) && duration > 0 ? start + duration : null
}

function areConsecutive(previous: ReminderSessionBooking, next: ReminderSessionBooking): boolean {
  const previousStart = timeToMinutes(previous.requestedStart)
  const nextStart = timeToMinutes(next.requestedStart)
  if (previousStart === null || nextStart === null) return false

  const duration = Number(previous.requestedMinutes)
  const slotStep = Number.isFinite(duration) && duration > 0
    ? Math.max(30, Math.ceil(duration / 30) * 30)
    : 30
  return nextStart === previousStart + slotStep
}

function sessionIdentity(booking: ReminderSessionBooking): string {
  return [
    booking.studentId || '',
    booking.teacherId || '',
    booking.subjectId || '',
    booking.requestedDate || '',
  ].join('|')
}

function dayIdentity(booking: ReminderSessionBooking): string {
  return [booking.studentId || '', booking.requestedDate || ''].join('|')
}

function sortedValidBookings<T extends ReminderSessionBooking>(bookings: T[]): T[] {
  return bookings
    .filter((booking) => timeToMinutes(booking.requestedStart) !== null)
    .sort((left, right) => {
      const byStart = (timeToMinutes(left.requestedStart) || 0) - (timeToMinutes(right.requestedStart) || 0)
      return byStart || left.id.localeCompare(right.id)
    })
}

/**
 * Toàn bộ lịch còn hiệu lực của một học viên trong cùng ngày được gửi chung
 * trong một email. Không đưa teacher/subject vào khóa vì một ngày có thể học
 * nhiều gia sư hoặc nhiều môn và nghiệp vụ vẫn yêu cầu chỉ một email.
 */
export function groupReminderDays<T extends ReminderSessionBooking>(bookings: T[]): ReminderDay<T>[] {
  const groups = new Map<string, T[]>()
  for (const booking of sortedValidBookings(bookings)) {
    if (!booking.studentId || !booking.requestedDate) continue
    const key = dayIdentity(booking)
    groups.set(key, [...(groups.get(key) || []), booking])
  }

  return [...groups.values()].map((group) => {
    const sorted = sortedValidBookings(group)
    const starts = sorted.map((booking) => timeToMinutes(booking.requestedStart)).filter((value): value is number => value !== null)
    const ends = sorted.map(bookingEndMinutes).filter((value): value is number => value !== null)
    return {
      bookings: sorted,
      dayStart: minutesToTime(Math.min(...starts)),
      dayEnd: minutesToTime(Math.max(...ends)),
    }
  }).sort((left, right) => {
    const leftBooking = left.bookings[0]
    const rightBooking = right.bookings[0]
    return (leftBooking.requestedDate || '').localeCompare(rightBooking.requestedDate || '')
      || left.dayStart.localeCompare(right.dayStart)
      || (leftBooking.studentId || '').localeCompare(rightBooking.studentId || '')
  })
}

/**
 * Các ô lịch liền nhau của cùng học viên/gia sư/môn/ngày là một cụm buổi học.
 * Một lượt xếp nhiều ô vì vậy chỉ tạo một cặp email nhắc 12 giờ và 30 phút.
 */
export function groupReminderSessions<T extends ReminderSessionBooking>(bookings: T[]): ReminderSession<T>[] {
  const groups = new Map<string, T[]>()
  for (const booking of bookings) {
    const start = timeToMinutes(booking.requestedStart)
    if (start === null) continue
    const key = sessionIdentity(booking)
    groups.set(key, [...(groups.get(key) || []), booking])
  }

  const sessions: ReminderSession<T>[] = []
  for (const group of groups.values()) {
    const sorted = sortedValidBookings(group)

    let current: T[] = []
    let previousDistinct: T | undefined
    const flush = () => {
      if (current.length === 0) return
      const starts = current.map((booking) => timeToMinutes(booking.requestedStart)).filter((value): value is number => value !== null)
      const ends = current.map(bookingEndMinutes).filter((value): value is number => value !== null)
      sessions.push({
        bookings: current,
        sessionStart: minutesToTime(Math.min(...starts)),
        sessionEnd: minutesToTime(Math.max(...ends)),
      })
      current = []
      previousDistinct = undefined
    }

    for (const booking of sorted) {
      const start = timeToMinutes(booking.requestedStart)
      const previousStart = timeToMinutes(previousDistinct?.requestedStart)
      const duplicateSlot = previousStart !== null && start === previousStart
      if (current.length === 0 || duplicateSlot || (previousDistinct && areConsecutive(previousDistinct, booking))) {
        current.push(booking)
      } else {
        flush()
        current.push(booking)
      }
      if (!duplicateSlot) previousDistinct = booking
    }
    flush()
  }

  return sessions.sort((left, right) => {
    const leftBooking = left.bookings[0]
    const rightBooking = right.bookings[0]
    return (leftBooking.requestedDate || '').localeCompare(rightBooking.requestedDate || '')
      || left.sessionStart.localeCompare(right.sessionStart)
  })
}

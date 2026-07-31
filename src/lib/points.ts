import type { BookingRequest, Lesson, Teacher } from '@/types'

export const DEFAULT_POINTS_PER_25_MINUTES = 25
export const POINT_OPTIONS = [25, 30, 35, 40, 45, 50, 60] as const

export function normalizePointsPer25Minutes(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed)
    : DEFAULT_POINTS_PER_25_MINUTES
}

export function getTeacherPointsPer25Minutes(teacher?: Partial<Teacher> | null): number {
  return normalizePointsPer25Minutes(teacher?.pointsPer25Minutes)
}

export function calculateLessonPoints(
  durationMinutes: number,
  pointsPer25Minutes: number = DEFAULT_POINTS_PER_25_MINUTES,
): number {
  const duration = Number(durationMinutes)
  if (!Number.isFinite(duration) || duration <= 0) return 0

  const points = (duration / 25) * normalizePointsPer25Minutes(pointsPer25Minutes)
  return Math.round(points * 100) / 100
}

export function getLessonPoints(
  lesson: Pick<Lesson, 'minutes'> & Partial<Pick<Lesson, 'points' | 'pointsPer25Minutes'>>,
  teacher?: Partial<Teacher> | null,
): number {
  // The rate snapshot is the canonical price for a lesson. Some historical
  // 50-minute lessons were saved with the 25-minute point total, so trusting
  // `points` first permanently under-counted the student's used fund.
  const storedRate = Number(lesson.pointsPer25Minutes)
  if (
    lesson.pointsPer25Minutes !== null
    && lesson.pointsPer25Minutes !== undefined
    && Number.isFinite(storedRate)
    && storedRate > 0
  ) {
    return calculateLessonPoints(lesson.minutes, storedRate)
  }

  // Legacy lessons without a rate snapshot keep their stored point total.
  // This avoids repricing old lessons when a teacher's current rate changes.
  const storedPoints = Number(lesson.points)
  if (lesson.points !== null && lesson.points !== undefined && Number.isFinite(storedPoints) && storedPoints >= 0) {
    return storedPoints
  }

  const rate = lesson.pointsPer25Minutes ?? teacher?.pointsPer25Minutes
  return calculateLessonPoints(lesson.minutes, normalizePointsPer25Minutes(rate))
}

export function getBookingPoints(
  booking: Pick<BookingRequest, 'requestedMinutes'> & Partial<Pick<BookingRequest, 'requestedPoints' | 'pointsPer25Minutes'>>,
  teacher?: Partial<Teacher> | null,
): number {
  // Keep held/reserved points consistent with lesson charging: when a booking
  // contains the rate snapshot, duration x snapshot rate is authoritative.
  const storedRate = Number(booking.pointsPer25Minutes)
  if (
    booking.pointsPer25Minutes !== null
    && booking.pointsPer25Minutes !== undefined
    && Number.isFinite(storedRate)
    && storedRate > 0
  ) {
    return calculateLessonPoints(booking.requestedMinutes, storedRate)
  }

  // Legacy bookings without a rate snapshot retain their stored total so an
  // edited teacher rate never changes an already-held historical balance.
  const storedPoints = Number(booking.requestedPoints)
  if (
    booking.requestedPoints !== null
    && booking.requestedPoints !== undefined
    && Number.isFinite(storedPoints)
    && storedPoints >= 0
  ) {
    return storedPoints
  }

  return calculateLessonPoints(
    booking.requestedMinutes,
    getTeacherPointsPer25Minutes(teacher),
  )
}

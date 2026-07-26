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
  const storedPoints = Number(booking.requestedPoints)
  if (
    booking.requestedPoints !== null
    && booking.requestedPoints !== undefined
    && Number.isFinite(storedPoints)
    && storedPoints >= 0
  ) {
    return storedPoints
  }

  const rate = booking.pointsPer25Minutes ?? teacher?.pointsPer25Minutes
  return calculateLessonPoints(booking.requestedMinutes, normalizePointsPer25Minutes(rate))
}

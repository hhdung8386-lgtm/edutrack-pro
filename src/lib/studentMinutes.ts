import { BookingRequest, Student } from '@/types'
import { getBookingPoints } from '@/lib/points'

export function getStudentPackageMinuteSummary(student: Student) {
  const subjects = student.subjects || []
  if (subjects.length > 0) {
    const totalMinutes = subjects.reduce((sum, sub) => {
      const minutesPerSession = Number(sub.minutesPerSession) || 50
      const storedTotal = Number(sub.totalMinutes)
      const fallbackTotal = (Number(sub.totalSessions) || 0) * minutesPerSession
      const hasStoredTotal = sub.totalMinutes !== null && sub.totalMinutes !== undefined && Number.isFinite(storedTotal)
      return sum + (hasStoredTotal ? storedTotal : fallbackTotal)
    }, 0)
    const usedMinutes = subjects.reduce((sum, sub) => {
      const minutesPerSession = Number(sub.minutesPerSession) || 50
      const storedUsed = Number(sub.usedMinutes)
      const fallbackUsed = (Number(sub.usedSessions) || 0) * minutesPerSession
      const hasStoredUsed = sub.usedMinutes !== null && sub.usedMinutes !== undefined && Number.isFinite(storedUsed)
      return sum + (hasStoredUsed ? storedUsed : fallbackUsed)
    }, 0)
    const remainingMinutes = Math.max(0, totalMinutes - usedMinutes)
    return {
      totalMinutes,
      usedMinutes,
      remainingMinutes,
    }
  }
  const mps = student.minutesPerSession || 50
  const storedTotal = Number(student.totalMinutes)
  const storedUsed = Number(student.usedMinutes)
  const hasStoredTotal = student.totalMinutes !== null && student.totalMinutes !== undefined && Number.isFinite(storedTotal)
  const hasStoredUsed = student.usedMinutes !== null && student.usedMinutes !== undefined && Number.isFinite(storedUsed)
  const totalMinutes = hasStoredTotal ? storedTotal : (student.totalSessions ? student.totalSessions * mps : 0)
  const usedMinutes = hasStoredUsed ? storedUsed : (student.usedSessions ? student.usedSessions * mps : 0)
  const remainingMinutes = Math.max(0, totalMinutes - usedMinutes)
  return {
    totalMinutes,
    usedMinutes,
    remainingMinutes,
  }
}

export function getHeldBookingMinutes(bookings: BookingRequest[], subjectId: string): number {
  return bookings
    .filter(b => b.subjectId === subjectId && !b.lessonId && (b.status === 'pending' || b.status === 'confirmed'))
    .reduce((sum, b) => sum + getBookingPoints(b), 0)
}

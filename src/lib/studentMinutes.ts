import { BookingRequest, Student } from '@/types'

export function getStudentPackageMinuteSummary(student: Student) {
  const subjects = student.subjects || []
  if (subjects.length > 0) {
    const totalMinutes = subjects.reduce((sum, sub) => sum + (Number(sub.totalMinutes) || 0), 0)
    const usedMinutes = subjects.reduce((sum, sub) => sum + (Number(sub.usedMinutes) || 0), 0)
    const remainingMinutes = Math.max(0, totalMinutes - usedMinutes)
    return {
      totalMinutes,
      usedMinutes,
      remainingMinutes,
    }
  }
  const mps = student.minutesPerSession || 50
  const totalMinutes = Number(student.totalMinutes) || (student.totalSessions ? student.totalSessions * mps : 0)
  const usedMinutes = Number(student.usedMinutes) || (student.usedSessions ? student.usedSessions * mps : 0)
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
    .reduce((sum, b) => sum + (Number(b.requestedMinutes) || 0), 0)
}

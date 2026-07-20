import { BookingRequest, Student, StudentSubject } from '@/types'

export function getStudentPackageMinuteSummary(student: Student) {
  const subjects = student.subjects || []
  const totalMinutes = subjects.reduce((sum, sub) => sum + (Number(sub.totalMinutes) || 0), 0)
  const remainingMinutes = subjects.reduce((sum, sub) => sum + (Number(sub.remainingMinutes) || 0), 0)
  return {
    totalMinutes,
    remainingMinutes,
  }
}

export function getHeldBookingMinutes(bookings: BookingRequest[], subjectId: string): number {
  return bookings
    .filter(b => b.subjectId === subjectId && !b.lessonId && (b.status === 'pending' || b.status === 'confirmed'))
    .reduce((sum, b) => sum + (Number(b.requestedMinutes) || 0), 0)
}

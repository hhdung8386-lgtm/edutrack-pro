import type { Lesson } from '@/types'

export const STUDENT_ABSENCE_ALERT_THRESHOLD = 2

export interface StudentAbsenceAlert {
  studentId: string
  studentCode: string
  studentName: string
  totalAbsences: number
  excusedAbsences: number
  unexcusedAbsences: number
  latestAbsenceDate: string
  recentAbsences: Array<{
    id: string
    date: string
    attendanceStatus: 'with_permission' | 'without_permission'
    teacherName: string
    subjectName: string
    status: Lesson['status']
  }>
}

/**
 * Gom các báo cáo vắng theo học viên. Báo cáo bị từ chối không được tính vì
 * chưa phải dữ liệu điểm danh hợp lệ; dữ liệu cũ không có attendanceStatus
 * cũng được bỏ qua để tránh suy diễn từ nội dung ghi chú tự do.
 */
export function buildStudentAbsenceAlerts(
  lessons: Lesson[],
  threshold = STUDENT_ABSENCE_ALERT_THRESHOLD,
): StudentAbsenceAlert[] {
  const byStudent = new Map<string, StudentAbsenceAlert>()

  lessons.forEach((lesson) => {
    if (
      lesson.status === 'rejected'
      || (lesson.attendanceStatus !== 'with_permission' && lesson.attendanceStatus !== 'without_permission')
      || !lesson.studentId
    ) return

    const current = byStudent.get(lesson.studentId) || {
      studentId: lesson.studentId,
      studentCode: lesson.studentCode || '—',
      studentName: lesson.studentName || 'Học viên chưa có tên',
      totalAbsences: 0,
      excusedAbsences: 0,
      unexcusedAbsences: 0,
      latestAbsenceDate: '',
      recentAbsences: [],
    }

    current.totalAbsences += 1
    if (lesson.attendanceStatus === 'with_permission') current.excusedAbsences += 1
    else current.unexcusedAbsences += 1
    if (lesson.date > current.latestAbsenceDate) current.latestAbsenceDate = lesson.date
    current.recentAbsences.push({
      id: lesson.id,
      date: lesson.date,
      attendanceStatus: lesson.attendanceStatus,
      teacherName: lesson.teacherName || '—',
      subjectName: lesson.subjectName || '—',
      status: lesson.status,
    })
    byStudent.set(lesson.studentId, current)
  })

  return Array.from(byStudent.values())
    .filter((alert) => alert.totalAbsences >= threshold)
    .map((alert) => ({
      ...alert,
      recentAbsences: alert.recentAbsences
        .sort((left, right) => right.date.localeCompare(left.date))
        .slice(0, 3),
    }))
    .sort((left, right) =>
      right.totalAbsences - left.totalAbsences
      || right.latestAbsenceDate.localeCompare(left.latestAbsenceDate)
      || left.studentName.localeCompare(right.studentName, 'vi'),
    )
}

import type { Student } from '@/types'

export type StudentClassification = 'fixed' | 'flexible' | 'offline'
export type StudentGroupView = 'all' | StudentClassification

export const STUDENT_CLASSIFICATION_OPTIONS: ReadonlyArray<{
  value: StudentClassification
  label: string
}> = [
  { value: 'fixed', label: 'Học viên cố định' },
  { value: 'flexible', label: 'Học viên linh hoạt' },
  { value: 'offline', label: 'Lớp offline' },
]

/**
 * Giữ tương thích hồ sơ cũ: field trống, `unclassified` hoặc giá trị lạ đều
 * thuộc nhóm cố định. Không cần backfill hàng loạt nên không phát sinh write.
 */
export function getStudentClassification(
  student: Pick<Student, 'learningScheduleType'>,
): StudentClassification {
  if (student.learningScheduleType === 'flexible') return 'flexible'
  if (student.learningScheduleType === 'offline') return 'offline'
  return 'fixed'
}

/** Mặc định chọn một đích khác trang hiện tại để tránh ghi no-op. */
export function getDefaultBulkClassification(view: StudentGroupView): StudentClassification {
  if (view === 'fixed') return 'flexible'
  return 'fixed'
}

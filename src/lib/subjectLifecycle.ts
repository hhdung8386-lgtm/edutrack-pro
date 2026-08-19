export interface SubjectLifecycleFields {
  status?: string
  isDeleted?: boolean
}

/**
 * Môn đã xoá chỉ bị loại khỏi danh mục vận hành. Bản ghi Firestore và các
 * snapshot tên/giá trong học viên, booking, lesson, payroll vẫn được giữ lại.
 */
export function isDeletedSubject(subject: SubjectLifecycleFields): boolean {
  return subject.isDeleted === true
}

/** Môn tạm dừng hoặc đã xoá không được dùng cho cấu hình/giao dịch mới. */
export function isSelectableSubject(subject: SubjectLifecycleFields): boolean {
  return !isDeletedSubject(subject) && subject.status !== 'inactive'
}

/** Danh sách quản trị vẫn hiện môn tạm dừng, nhưng ẩn môn đã bấm xoá. */
export function isVisibleSubject(subject: SubjectLifecycleFields): boolean {
  return !isDeletedSubject(subject)
}

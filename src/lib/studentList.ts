/**
 * Đổi phiên bản khóa khi mặc định hiển thị danh sách thay đổi. Khóa riêng giúp
 * không kế thừa giá trị 200 được tự gán ở bản giao diện tổng hợp đã thu hồi.
 */
export const STUDENT_LIST_LIMIT_STORAGE_VERSION = 'full-list-v1'

export function studentListLimitStorageKey(storagePrefix: string) {
  return `${storagePrefix}_limitVal_${STUDENT_LIST_LIMIT_STORAGE_VERSION}`
}

export function parseStoredStudentListLimit(stored: string | null) {
  if (!stored) return 0
  const parsed = Number(stored)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
}

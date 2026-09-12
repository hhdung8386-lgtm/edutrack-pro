/** Chú thích của một môn trong danh mục; admin nhập, gia sư đọc được. */
export const SUBJECT_TEACHER_NOTE_MAX_LENGTH = 1000

/** Môn cũ không có field này (hoặc sai kiểu) được hiểu là chưa có chú thích. */
export function normalizeSubjectTeacherNote(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\r\n?/g, '\n').trim().slice(0, SUBJECT_TEACHER_NOTE_MAX_LENGTH)
}
